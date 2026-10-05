import { readFileSync } from 'node:fs';
import { PassThrough, type Readable } from 'node:stream';
import Docker from 'dockerode';
import { ctx } from '../context';
import type { ServerDoc } from '../db/models';
import type { ContainerSpec, ContainerState, HostInfo, ManagedContainer, RawStats, RuntimeDriver, RuntimeEvent } from './driver';

const MiB = 1024 * 1024;

/**
 * Connects to a host's Docker Engine. Production hosts use TCP with mutual TLS (client certificate
 * held by workers only); a local Unix socket is for single-machine development. Plain TCP is
 * refused in production because an unauthenticated daemon grants root on the host.
 */
export function dockerDriverFor(server: ServerDoc): RuntimeDriver {
  const d = server.docker;
  const production = ctx().config.production;
  let docker: Docker;
  if (d.protocol === 'socket') docker = new Docker({ socketPath: d.socketPath ?? '/var/run/docker.sock' });
  else if (d.protocol === 'https') {
    if (!d.tls) throw new Error(`Server ${server._id} uses https without TLS client material`);
    docker = new Docker({ host: d.host!, port: d.port ?? 2376, protocol: 'https', ca: readFileSync(d.tls.caFile), cert: readFileSync(d.tls.certFile), key: readFileSync(d.tls.keyFile) });
  } else if (d.protocol === 'http' && !production) docker = new Docker({ host: d.host!, port: d.port ?? 2375, protocol: 'http' });
  else throw new Error(`Docker protocol ${d.protocol} is not allowed for server ${server._id}`);
  return new DockerDriver(server._id, docker);
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        onTimeout();
        reject(new Error(message));
      }, ms);
    }),
  ]);
}

function registryAuth(ref: string) {
  const c = ctx().config;
  if (!c.REGISTRY_URL || !c.REGISTRY_USERNAME || !ref.startsWith(`${c.REGISTRY_URL}/`)) return undefined;
  return { username: c.REGISTRY_USERNAME, password: c.REGISTRY_PASSWORD, serveraddress: c.REGISTRY_URL };
}

export class DockerDriver implements RuntimeDriver {
  constructor(
    readonly serverId: string,
    private readonly docker: Docker,
  ) {}

  async ping() {
    await this.docker.ping();
  }

  async info(): Promise<HostInfo> {
    const i = (await this.docker.info()) as {
      NCPU: number;
      MemTotal: number;
      Driver: string;
      DriverStatus?: [string, string][];
      Runtimes?: Record<string, unknown>;
      ServerVersion: string;
    };
    return {
      cpus: i.NCPU,
      memoryMb: Math.floor(i.MemTotal / MiB),
      storageDriver: i.Driver,
      backingFilesystem: i.DriverStatus?.find(([k]) => k === 'Backing Filesystem')?.[1] ?? null,
      runtimes: Object.keys(i.Runtimes ?? {}),
      serverVersion: i.ServerVersion,
    };
  }

  async ensureNetwork(name: string, labels: Record<string, string>) {
    const existing = await this.docker.listNetworks({ filters: { name: [name] } });
    if (existing.some((n) => n.Name === name)) return;
    // One bridge per team: containers of different teams cannot reach each other.
    await this.docker.createNetwork({ Name: name, Driver: 'bridge', CheckDuplicate: true, Labels: labels, Options: { 'com.docker.network.bridge.enable_icc': 'true' } });
  }

  async imageExists(ref: string) {
    try {
      await this.docker.getImage(ref).inspect();
      return true;
    } catch {
      return false;
    }
  }

  async buildImage(context: Readable, tag: string, opts: { dockerfile: string; labels: Record<string, string>; memoryMb: number; timeoutMs: number; onLog: (line: string) => void }) {
    const stream = (await this.docker.buildImage(context as NodeJS.ReadableStream, {
      t: tag,
      dockerfile: opts.dockerfile,
      labels: opts.labels,
      rm: true,
      forcerm: true,
      pull: 'true',
      memory: opts.memoryMb * MiB,
      memswap: opts.memoryMb * MiB,
      networkmode: 'bridge',
    } as unknown as Docker.ImageBuildOptions)) as Readable;
    let imageId = '';
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => (err ? reject(err) : resolve()),
          (ev: { stream?: string; error?: string; aux?: { ID?: string } }) => {
            if (ev.error) return reject(new Error(ev.error));
            if (ev.aux?.ID) imageId = ev.aux.ID;
            if (ev.stream) for (const line of ev.stream.split('\n')) if (line.trim()) opts.onLog(line.replace(/\r/g, ''));
          },
        );
      }),
      opts.timeoutMs,
      () => stream.destroy(),
      'The build took too long and was stopped.',
    );
    if (!imageId) imageId = (await this.docker.getImage(tag).inspect()).Id;
    return { imageId };
  }

  async pullImage(ref: string, opts: { timeoutMs: number; onLog: (line: string) => void }) {
    const stream = (await this.docker.pull(ref, { authconfig: registryAuth(ref) })) as Readable;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null) => (err ? reject(err) : resolve()),
          (ev: { status?: string; id?: string; error?: string }) => {
            if (ev.error) return reject(new Error(ev.error));
            if (ev.status && !ev.status.startsWith('Downloading') && !ev.status.startsWith('Extracting')) opts.onLog(`${ev.id ? `${ev.id}: ` : ''}${ev.status}`);
          },
        );
      }),
      opts.timeoutMs,
      () => stream.destroy(),
      'Pulling the image took too long.',
    );
    const img = await this.docker.getImage(ref).inspect();
    return { imageId: img.Id, digest: img.RepoDigests?.[0]?.split('@')[1] ?? null };
  }

  async pushImage(tag: string, opts: { onLog: (line: string) => void }) {
    const stream = (await this.docker.getImage(tag).push({ authconfig: registryAuth(tag) })) as Readable;
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(
        stream,
        (err: Error | null) => (err ? reject(err) : resolve()),
        (ev: { status?: string; error?: string }) => {
          if (ev.error) return reject(new Error(ev.error));
          if (ev.status === 'Pushed' || ev.status?.startsWith('latest') || ev.status?.includes('digest')) opts.onLog(ev.status);
        },
      );
    });
  }

  async removeImage(ref: string) {
    try {
      await this.docker.getImage(ref).remove({ force: false });
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    }
  }

  async createContainer(spec: ContainerSpec) {
    const portKey = spec.port ? `${spec.port}/tcp` : null;
    const c = await this.docker.createContainer({
      name: spec.name,
      Image: spec.image,
      ...(spec.cmd ? { Cmd: spec.cmd } : {}),
      Env: Object.entries(spec.env).map(([k, v]) => `${k}=${v}`),
      User: spec.user,
      Labels: spec.labels,
      StopSignal: 'SIGTERM',
      StopTimeout: spec.stopTimeoutSec,
      ...(portKey ? { ExposedPorts: { [portKey]: {} } } : {}),
      HostConfig: {
        Memory: spec.memoryMb * MiB,
        MemorySwap: spec.memoryMb * MiB,
        NanoCpus: spec.nanoCpus,
        PidsLimit: spec.pidsLimit,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges:true'],
        Privileged: false,
        Init: true,
        ...(spec.storageMb !== null ? { StorageOpt: { size: `${spec.storageMb}M` } } : {}),
        ...(portKey ? { PortBindings: { [portKey]: [{ HostIp: spec.hostIp, HostPort: '' }] } } : {}),
        NetworkMode: spec.network,
        RestartPolicy: { Name: 'no' },
        LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
        Ulimits: [{ Name: 'nofile', Soft: 4096, Hard: 8192 }],
        ...(spec.ociRuntime ? { Runtime: spec.ociRuntime } : {}),
      },
    });
    return c.id;
  }

  async startContainer(id: string) {
    await this.docker.getContainer(id).start();
  }

  async stopContainer(id: string, timeoutSec: number) {
    try {
      await this.docker.getContainer(id).stop({ t: timeoutSec });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code !== 304 && code !== 404) throw e; // already stopped / gone
    }
  }

  async removeContainer(id: string) {
    try {
      await this.docker.getContainer(id).remove({ force: true, v: true });
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    }
  }

  async inspectContainer(id: string, opts: { size?: boolean } = {}): Promise<ContainerState | null> {
    try {
      // `size` is a valid Engine API option missing from the type definitions.
      const i = await this.docker.getContainer(id).inspect({ size: opts.size ?? false } as Docker.ContainerInspectOptions);
      const binding = Object.values(i.NetworkSettings?.Ports ?? {})[0]?.[0];
      return {
        id: i.Id,
        name: i.Name.replace(/^\//, ''),
        running: i.State.Running,
        exitCode: i.State.Running ? null : i.State.ExitCode,
        oomKilled: i.State.OOMKilled,
        startedAt: i.State.StartedAt && !i.State.StartedAt.startsWith('0001') ? new Date(i.State.StartedAt) : null,
        finishedAt: i.State.FinishedAt && !i.State.FinishedAt.startsWith('0001') ? new Date(i.State.FinishedAt) : null,
        restartCount: i.RestartCount ?? 0,
        hostPort: binding?.HostPort ? Number(binding.HostPort) : null,
        labels: i.Config.Labels ?? {},
        sizeRwBytes: (i as unknown as { SizeRw?: number }).SizeRw ?? null,
      };
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null;
      throw e;
    }
  }

  async listManaged(filter: Record<string, string> = {}): Promise<ManagedContainer[]> {
    const labels = ['dgc.managed=true', ...Object.entries(filter).map(([k, v]) => `${k}=${v}`)];
    const list = await this.docker.listContainers({ all: true, filters: { label: labels } });
    return list.map((c) => ({ id: c.Id, name: (c.Names[0] ?? '').replace(/^\//, ''), labels: c.Labels, running: c.State === 'running', createdAt: new Date(c.Created * 1000) }));
  }

  async updateResources(id: string, r: { memoryMb: number; nanoCpus: number }) {
    await this.docker.getContainer(id).update({ Memory: r.memoryMb * MiB, MemorySwap: r.memoryMb * MiB, NanoCpus: r.nanoCpus });
  }

  async logs(id: string, opts: { sinceSec?: number; follow: boolean; onStdout: (chunk: Buffer) => void; onStderr: (chunk: Buffer) => void }) {
    const container = this.docker.getContainer(id);
    const stream = (await container.logs({ follow: true, stdout: true, stderr: true, timestamps: false, since: opts.sinceSec ?? 0 } as never)) as unknown as Readable;
    const out = new PassThrough();
    const err = new PassThrough();
    out.on('data', opts.onStdout);
    err.on('data', opts.onStderr);
    this.docker.modem.demuxStream(stream, out, err);
    const done = new Promise<void>((resolve) => {
      stream.on('end', resolve);
      stream.on('close', resolve);
      stream.on('error', () => resolve());
    });
    return { done, stop: () => stream.destroy() };
  }

  async stats(id: string): Promise<RawStats | null> {
    try {
      const s = (await this.docker.getContainer(id).stats({ stream: false })) as unknown as {
        cpu_stats: { cpu_usage: { total_usage: number; percpu_usage?: number[] }; system_cpu_usage: number; online_cpus?: number };
        precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage: number };
        memory_stats: { usage?: number; stats?: Record<string, number> };
        networks?: Record<string, { rx_bytes: number; tx_bytes: number }>;
      };
      const cpuDelta = s.cpu_stats.cpu_usage.total_usage - (s.precpu_stats.cpu_usage?.total_usage ?? 0);
      const sysDelta = s.cpu_stats.system_cpu_usage - (s.precpu_stats.system_cpu_usage ?? 0);
      const online = s.cpu_stats.online_cpus ?? s.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
      const cache = s.memory_stats.stats?.inactive_file ?? s.memory_stats.stats?.cache ?? 0;
      const nets = Object.values(s.networks ?? {});
      return {
        cpuPercentOfHost: sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * online * 100 : 0,
        onlineCpus: online,
        memoryBytes: Math.max(0, (s.memory_stats.usage ?? 0) - cache),
        rxBytes: nets.reduce((a, n) => a + n.rx_bytes, 0),
        txBytes: nets.reduce((a, n) => a + n.tx_bytes, 0),
      };
    } catch (e) {
      if ((e as { statusCode?: number }).statusCode === 404) return null;
      throw e;
    }
  }

  async events(onEvent: (e: RuntimeEvent) => void, onError: (err: Error) => void) {
    const stream = (await this.docker.getEvents({ filters: { type: ['container'], label: ['dgc.managed=true'], event: ['die', 'oom', 'start', 'stop'] } })) as unknown as Readable;
    let buf = '';
    stream.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        try {
          const ev = JSON.parse(line) as { Action: string; Actor: { ID: string; Attributes: Record<string, string> }; time: number };
          onEvent({ action: ev.Action as RuntimeEvent['action'], containerId: ev.Actor.ID, labels: ev.Actor.Attributes, exitCode: ev.Actor.Attributes.exitCode !== undefined ? Number(ev.Actor.Attributes.exitCode) : null, time: new Date(ev.time * 1000) });
        } catch {
          // ignore malformed lines
        }
      }
    });
    stream.on('error', onError);
    stream.on('end', () => onError(new Error('event stream ended')));
    return () => stream.destroy();
  }

  async probeStorageQuota(probeImage: string) {
    // A size quota on the writable layer only works on supported storage drivers (e.g. overlay2 on xfs with pquota).
    try {
      if (!(await this.imageExists(probeImage))) await this.pullImage(probeImage, { timeoutMs: 120_000, onLog: () => {} });
      const c = await this.docker.createContainer({ Image: probeImage, Cmd: ['true'], Labels: { 'dgc.probe': 'true' }, HostConfig: { StorageOpt: { size: '64M' } } });
      await c.remove({ force: true });
      return true;
    } catch {
      return false;
    }
  }
}
