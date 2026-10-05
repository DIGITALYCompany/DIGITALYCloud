import type { ClientSession } from 'mongoose';
import { ENV_KEY_RE, ENV_LIMITS, MESSAGES, RESERVED_ENV_PREFIX, type EnvVarDto, type EnvVarInput } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { EnvVar, type EnvVarDoc } from '../../db/models';
import { conflict, validation } from '../../lib/errors';
import { isId, newId } from '../../lib/ids';

export const envAad = (serviceId: string, id: string, key: string) => `env:${serviceId}:${id}:${key}`;

/**
 * Validates a full env list (the PUT contract replaces the whole list). Keys: `^[A-Z_][A-Z0-9_]*$`,
 * ≤ 128 chars, unique, not `DIGITALY_*`. Values ≤ 32 KB (UTF-8), no NUL bytes. At most 100 entries.
 * A value may be omitted only for an existing id, which keeps the stored value.
 */
export function validateEnvList(list: EnvVarInput[], existing: Map<string, EnvVarDoc>) {
  if (list.length > ENV_LIMITS.maxVars) throw validation(`A service can have at most ${ENV_LIMITS.maxVars} environment variables.`, 'env');
  const seen = new Set<string>();
  return list.map((v, i) => {
    const field = `env.${i}`;
    if (typeof v.key !== 'string' || !ENV_KEY_RE.test(v.key) || v.key.length > ENV_LIMITS.maxKeyLength) throw validation(MESSAGES.envKey, `${field}.key`);
    if (v.key.startsWith(RESERVED_ENV_PREFIX)) throw validation(MESSAGES.envReserved, `${field}.key`);
    if (seen.has(v.key)) throw conflict(`${v.key} already exists.`, 'CONFLICT', { [`${field}.key`]: `${v.key} already exists.` });
    seen.add(v.key);
    const keep = v.id && isId('env', v.id) ? existing.get(v.id) : undefined;
    if (v.value === undefined && !keep) throw validation('Every new variable needs a value.', `${field}.value`);
    if (v.value !== undefined) {
      if (Buffer.byteLength(v.value, 'utf8') > ENV_LIMITS.maxValueBytes) throw validation('Values can be at most 32 KB.', `${field}.value`);
      if (v.value.includes('\u0000')) throw validation('Values can’t contain NUL characters.', `${field}.value`);
    }
    return { input: v, keep };
  });
}

/** Decrypted env for a service, in saved order. */
export async function loadEnv(serviceId: string, session?: ClientSession): Promise<{ doc: EnvVarDoc; value: string }[]> {
  const docs = await EnvVar.find({ serviceId }, null, session ? { session } : {}).sort({ position: 1 }).lean<EnvVarDoc[]>();
  const cipher = ctx().cipher;
  return docs.map((doc) => ({ doc, value: cipher.decrypt(doc.valueEnc, envAad(serviceId, doc._id, doc.key)) }));
}

export function envDto(rows: { doc: EnvVarDoc; value: string }[], mode: 'plain' | 'redacted'): EnvVarDto[] {
  return rows.map(({ doc, value }) => ({ id: doc._id, key: doc.key, value: mode === 'plain' || !doc.secret ? value : '', secret: doc.secret }));
}

/** API-key responses never contain env values. */
export const redactAll = (rows: { doc: EnvVarDoc }[]): EnvVarDto[] => rows.map(({ doc }) => ({ id: doc._id, key: doc.key, value: '', secret: doc.secret }));

/**
 * Replaces a service's env inside the caller's transaction. Existing ids are kept, new rows get
 * server ids, every value is re-encrypted with a fresh nonce (and with AAD bound to its id and key).
 */
export async function replaceEnv(session: ClientSession, serviceId: string, teamId: string, list: EnvVarInput[]) {
  const existingDocs = await EnvVar.find({ serviceId }, null, { session }).lean<EnvVarDoc[]>();
  const existing = new Map(existingDocs.map((d) => [d._id, d]));
  const validated = validateEnvList(list, existing);
  const cipher = ctx().cipher;
  const now = new Date();
  const docs: EnvVarDoc[] = validated.map(({ input, keep }, position) => {
    const id = keep?._id ?? newId('env');
    const value = input.value ?? cipher.decrypt(keep!.valueEnc, envAad(serviceId, keep!._id, keep!.key));
    return {
      _id: id,
      serviceId,
      teamId,
      key: input.key,
      valueEnc: cipher.encrypt(value, envAad(serviceId, id, input.key)),
      secret: input.secret,
      position,
      createdAt: keep?.createdAt ?? now,
      updatedAt: now,
    };
  });
  await EnvVar.deleteMany({ serviceId }, { session });
  if (docs.length) await EnvVar.insertMany(docs, { session });
  return docs;
}

/** Environment injected into a container: user values, then the platform's reserved variables (which win). */
export async function runtimeEnv(serviceId: string, platform: { regionId: string; deploymentId: string; port: number | null }) {
  const rows = await loadEnv(serviceId);
  const env: Record<string, string> = {};
  for (const { doc, value } of rows) env[doc.key] = value;
  env.DIGITALY_REGION = platform.regionId;
  env.DIGITALY_DEPLOYMENT_ID = platform.deploymentId;
  if (platform.port !== null) env.PORT = String(platform.port);
  else delete env.PORT;
  return { env, secrets: rows.filter((r) => r.doc.secret && r.value.length >= 4).map((r) => r.value) };
}

