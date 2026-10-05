import type { Model } from 'mongoose';
import * as billing from './billing';
import * as hosting from './hosting';
import * as identity from './identity';
import * as infra from './infra';
import * as product from './product';
import * as reliability from './reliability';
import * as status from './status';
import * as teams from './teams';

export * from './billing';
export * from './hosting';
export * from './identity';
export * from './infra';
export * from './product';
export * from './reliability';
export * from './status';
export * from './teams';

const isModel = (v: unknown): v is Model<unknown> => typeof v === 'function' && 'collection' in (v as object) && 'schema' in (v as object);

/** Every model, for index management and test resets. */
export const ALL_MODELS: Model<unknown>[] = [identity, teams, hosting, infra, product, billing, reliability, status].flatMap((m) =>
  Object.values(m).filter(isModel),
);
