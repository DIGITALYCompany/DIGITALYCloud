import { ALL_MODELS } from './models';

/**
 * Creates every collection and every index declared in the schemas. Non-destructive: existing
 * indexes are kept, unknown indexes are never dropped. Runs from migrations, not at app startup.
 */
export async function ensureCollectionsAndIndexes(log: (msg: string) => void = () => {}) {
  for (const model of ALL_MODELS) {
    const name = model.collection.collectionName;
    const exists = (await model.db.db!.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
    if (!exists) {
      await model.createCollection();
      log(`created collection ${name}`);
    }
    await model.createIndexes();
  }
}

export interface IndexReport {
  collection: string;
  missing: string[];
  extra: string[];
}

/** Compares declared and actual indexes (readiness reporting; nothing is changed). */
export async function verifyIndexes(): Promise<IndexReport[]> {
  const out: IndexReport[] = [];
  for (const model of ALL_MODELS) {
    const declared = model.schema.indexes().map(([, opts]) => (opts as { name?: string }).name).filter((n): n is string => Boolean(n));
    let actual: string[] = [];
    try {
      actual = (await model.collection.indexes()).map((i) => i.name!).filter((n) => n !== '_id_');
    } catch {
      actual = [];
    }
    const missing = declared.filter((n) => !actual.includes(n));
    const extra = actual.filter((n) => !declared.includes(n));
    if (missing.length || extra.length) out.push({ collection: model.collection.collectionName, missing, extra });
  }
  return out;
}

/**
 * Drops indexes that are no longer declared. Destructive: only run deliberately (`cli indexes:sync --confirm`),
 * never automatically in production.
 */
export async function dropUndeclaredIndexes(log: (msg: string) => void = () => {}) {
  for (const r of await verifyIndexes()) {
    const model = ALL_MODELS.find((m) => m.collection.collectionName === r.collection)!;
    for (const name of r.extra) {
      await model.collection.dropIndex(name);
      log(`dropped ${r.collection}.${name}`);
    }
  }
}
