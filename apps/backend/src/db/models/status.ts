import { Schema } from 'mongoose';
import { DAY_SECONDS, baseOptions, defineModel } from './common';

/** Incidents published on the status page (created by staff through the CLI). */
export interface IncidentDoc {
  _id: string;
  title: string;
  impact: 'minor' | 'major' | 'maintenance';
  components: string[];
  startedAt: Date;
  resolvedAt: Date | null;
  updates: { at: Date; stage: 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved' | 'Scheduled' | 'Completed'; text: string }[];
  createdAt: Date;
}

const incidentSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    impact: { type: String, enum: ['minor', 'major', 'maintenance'], required: true },
    components: { type: [String], default: [] },
    startedAt: { type: Date, required: true },
    resolvedAt: { type: Date, default: null },
    updates: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            stage: { type: String, enum: ['Investigating', 'Identified', 'Monitoring', 'Resolved', 'Scheduled', 'Completed'], required: true },
            text: { type: String, required: true },
          },
          { _id: false, strict: 'throw' },
        ),
      ],
      default: [],
    },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);
incidentSchema.index({ startedAt: -1 }, { name: 'incident_started' });

export const Incident = defineModel<IncidentDoc>('Incident', incidentSchema, 'incidents');

export interface MaintenanceDoc {
  _id: string;
  title: string;
  body: string;
  startsAt: Date;
  endsAt: Date;
  affected: string[];
  /** Notification fan-out happens once. */
  notifiedAt: Date | null;
  createdAt: Date;
}

const maintenanceSchema = new Schema(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    affected: { type: [String], default: [] },
    notifiedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);
maintenanceSchema.index({ endsAt: 1 }, { name: 'maintenance_ends' });

export const Maintenance = defineModel<MaintenanceDoc>('Maintenance', maintenanceSchema, 'maintenance_windows');

/** Availability observations (5-minute buckets) from the status prober. */
export interface AvailabilitySampleDoc {
  component: string;
  ts: Date;
  up: number;
  checks: number;
  latencyMsTotal: number;
}

const availabilitySchema = new Schema(
  {
    component: { type: String, required: true },
    ts: { type: Date, required: true },
    up: { type: Number, required: true },
    checks: { type: Number, required: true },
    latencyMsTotal: { type: Number, required: true },
  },
  baseOptions,
);
availabilitySchema.index({ component: 1, ts: 1 }, { unique: true, name: 'availability_component_ts_unique' });
availabilitySchema.index({ ts: 1 }, { expireAfterSeconds: 120 * DAY_SECONDS, name: 'availability_ttl' });

export const AvailabilitySample = defineModel<AvailabilitySampleDoc>('AvailabilitySample', availabilitySchema, 'availability_samples');

/** Daily platform snapshot collected by the worker; admin charts never invent older values. */
export interface RevenueSnapshotDoc {
  _id: string;
  date: string;
  mrrCents: number;
  users: number;
  activeServices: number;
  paidServices: number;
  createdAt: Date;
}

const revenueSchema = new Schema(
  {
    _id: { type: String, required: true },
    date: { type: String, required: true },
    mrrCents: { type: Number, required: true },
    users: { type: Number, required: true },
    activeServices: { type: Number, required: true },
    paidServices: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);

export const RevenueSnapshot = defineModel<RevenueSnapshotDoc>('RevenueSnapshot', revenueSchema, 'revenue_snapshots');
