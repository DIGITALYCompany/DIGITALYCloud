export type ServiceType = 'discord' | 'node' | 'api' | 'worker';
export type ServiceStatus = 'running' | 'stopped' | 'deploying' | 'failed';
export type PlanId = 'free' | 'starter' | 'pro' | 'business';
export type SourceType = 'github' | 'upload' | 'docker';

export interface User {
  id: string;
  name: string;
  firstName: string;
  email: string;
  plan: PlanId;
  role: 'user' | 'admin';
  avatarInitials: string;
}

export interface EnvVar {
  id: string;
  key: string;
  value: string;
  secret: boolean;
}

export interface Service {
  id: string;
  name: string;
  type: ServiceType;
  status: ServiceStatus;
  cpu: number;
  ramMb: number;
  ramLimitMb: number;
  storageMb: number;
  storageLimitMb: number;
  startedAt: number | null;
  createdAt: number;
  lastDeployAt: number;
  region: string;
  server: string;
  runtime: string;
  nodeVersion: string;
  startCommand: string;
  port: number | null;
  plan: PlanId;
  source: SourceType;
  repo: string;
  branch: string;
  env: EnvVar[];
}

export type DeploymentStatus = 'success' | 'failed' | 'building';

export interface Deployment {
  id: string;
  serviceId: string;
  number: number;
  environment: 'Production' | 'Preview';
  status: DeploymentStatus;
  createdAt: number;
  commit: string;
  commitMessage: string;
  author: string;
  durationSec: number;
  logs: string[];
}

export interface Server {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'maintenance';
  cpu: number;
  ram: number;
  storage: number;
  containers: number;
  region: string;
  country: string;
  ip: string;
  cores: number;
  memoryGb: number;
  diskTb: number;
  uptimeDays: number;
}

export interface Invoice {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
  plan: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsed: number | null;
  scope: 'read' | 'full';
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: number;
  read: boolean;
  kind: 'success' | 'warning' | 'info' | 'error';
}

export interface LogLine {
  id: number;
  ts: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  text: string;
}
