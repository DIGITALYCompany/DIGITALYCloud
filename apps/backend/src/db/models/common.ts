import mongoose, { Schema, type Model, type SchemaOptions } from 'mongoose';
import type { Encrypted } from '../../lib/crypto';

/**
 * Conventions for every collection:
 * - `_id` is a prefixed string id (`usr_…`); services use their public slug.
 * - no `__v` (we never use Mongoose versioning; concurrency uses conditional updates and generations);
 * - `strict: 'throw'` so a misspelled path in a write fails loudly instead of being dropped.
 */
export const baseOptions: SchemaOptions = { versionKey: false, strict: 'throw', id: false, autoIndex: false, autoCreate: false };

export const encryptedSchema = new Schema<Encrypted>(
  {
    kid: { type: String, required: true },
    iv: { type: Buffer, required: true },
    tag: { type: Buffer, required: true },
    ct: { type: Buffer, required: true },
  },
  { _id: false, versionKey: false, strict: 'throw' },
);

export function defineModel<T>(name: string, schema: Schema, collection: string): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? (mongoose.model(name, schema, collection) as unknown as Model<T>);
}

export const DAY_SECONDS = 86_400;
