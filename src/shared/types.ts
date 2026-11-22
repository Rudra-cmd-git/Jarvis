export type ViewId =
  | 'dashboard'
  | 'chat'
  | 'pc-control'
  | 'automation'
  | 'developer-hub'
  | 'knowledge'
  | 'productivity'
  | 'settings';

export interface AppInfo {
  appName: string;
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  sqliteAvailable: boolean;
  sqliteDetail: string;
  startedAt: number;
}

export interface CpuMetrics {
  usagePercent: number;
  cores: number;
  model: string;
}

export interface MemoryMetrics {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface StorageMetrics {
  available: boolean;
  mount: string;
  totalBytes: number | null;
  freeBytes: number | null;
  usedBytes: number | null;
  usagePercent: number | null;
  detail: string;
}

export interface ProcessMetrics {
  pid: number;
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  uptimeSeconds: number;
}

export interface SystemIdentity {
  hostname: string;
  platform: string;
  release: string;
  arch: string;
  uptimeSeconds: number;
}

export interface SystemMetrics {
  sampledAt: number;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  storage: StorageMetrics;
  process: ProcessMetrics;
  system: SystemIdentity;
}

export interface QuitResult {
  accepted: boolean;
}

export interface JarvisApi {
  getAppInfo(): Promise<AppInfo>;
  getSystemMetrics(): Promise<SystemMetrics>;
  quitApp(): Promise<QuitResult>;
}
