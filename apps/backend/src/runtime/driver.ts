import type { Readable } from 'node:stream';
import type { ServerDoc } from '../db/models';

/** Everything needed to run one service container. Resource values always come from the plan. */
export interface ContainerSpec {
  name: string;
  image: string;
  /** `null` keeps the image's own command. */
  cmd: string[] | null;
  env: Record<string, string>;
  user: string;
  labels: Record<string, string>;
  port: number | null;
  /** Host interface the container port is published on (the server's private address). */
  hostIp: string;
  memoryMb: number;
  nanoCpus: number;
  pidsLimit: number;
  /** Writable-layer quota in MB, or null when the host cannot enforce it (development only). */
  storageMb: number | null;
  network: string;
  ociRuntime: string | null;
  stopTimeoutSec: number;
}

export interface ContainerState {
  id: string;
  name: string;
  running: boolean;
  exitCode: number | null;
  oomKilled: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
  restartCount: number;
  hostPort: number | null;
  labels: Record<string, string>;
  sizeRwBytes: number | null;
}

export interface ManagedContainer {
  id: string;
  name: string;
  labels: Record<string, string>;
  running: boolean;
  createdAt: Date;
}

export interface RawStats {
  cpuPercentOfHost: number;
  onlineCpus: number;
  memoryBytes: number;
  rxBytes: number;
  txBytes: number;
}

export interface RuntimeEvent {
  action: 'die' | 'oom' | 'start' | 'stop';
  containerId: string;
  labels: Record<string, string>;
  exitCode: number | null;
  time: Date;
}

export interface HostInfo {
  cpus: number;
  memoryMb: number;
  storageDriver: string;
  backingFilesystem: string | null;
  runtimes: string[];
  serverVersion: string;
}

/**
 * Runtime boundary. Workers and collectors use it; the public API process never does.
 * `DockerDriver` talks to a host's Docker Engine over mTLS (or a local socket in development).
 */
export interface RuntimeDriver {
  readonly serverId: string;
  ping(): Promise<void>;
  info(): Promise<HostInfo>;
  ensureNetwork(name: string, labels: Record<string, string>): Promise<void>;
  imageExists(ref: string): Promise<boolean>;
  buildImage(context: Readable, tag: string, opts: { dockerfile: string; labels: Record<string, string>; memoryMb: number; timeoutMs: number; onLog: (line: string) => void }): Promise<{ imageId: string }>;
  pullImage(ref: string, opts: { timeoutMs: number; onLog: (line: string) => void }): Promise<{ imageId: string; digest: string | null }>;
  pushImage(tag: string, opts: { onLog: (line: string) => void }): Promise<void>;
  removeImage(ref: string): Promise<void>;
  createContainer(spec: ContainerSpec): Promise<string>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, timeoutSec: number): Promise<void>;
  removeContainer(id: string): Promise<void>;
  inspectContainer(id: string, opts?: { size?: boolean }): Promise<ContainerState | null>;
  listManaged(filter?: Record<string, string>): Promise<ManagedContainer[]>;
  updateResources(id: string, r: { memoryMb: number; nanoCpus: number }): Promise<void>;
  logs(id: string, opts: { sinceSec?: number; follow: boolean; onStdout: (chunk: Buffer) => void; onStderr: (chunk: Buffer) => void }): Promise<{ done: Promise<void>; stop: () => void }>;
  stats(id: string): Promise<RawStats | null>;
  events(onEvent: (e: RuntimeEvent) => void, onError: (err: Error) => void): Promise<() => void>;
  /** True when the storage driver accepts a per-container size quota. */
  probeStorageQuota(probeImage: string): Promise<boolean>;
}

const cache = new Map<string, { at: number; driver: RuntimeDriver }>();

/** One Docker client per host, rebuilt when the server record changes. */
export async function driverFor(server: ServerDoc): Promise<RuntimeDriver> {
  const hit = cache.get(server._id);
  if (hit && hit.at === (server.updatedAt?.getTime() ?? 0)) return hit.driver;
  const { dockerDriverFor } = await import('./docker-driver');
  const driver = dockerDriverFor(server);
  cache.set(server._id, { at: server.updatedAt?.getTime() ?? 0, driver });
  return driver;
}
