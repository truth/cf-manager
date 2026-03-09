// Profile Types
export type ProfileType = 'publish' | 'forward';
export type CloudflaredSource = 'env' | 'bundled' | 'downloaded' | 'path';

interface BaseProfile {
  id: string;
  type: ProfileType;
  name: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface PublishProfile extends BaseProfile {
  type: 'publish';
  token: string;
  hostname?: string;
  origin_url?: string;
}

export interface ForwardProfile extends BaseProfile {
  type: 'forward';
  target_hostname: string;
  local_bind_host: string;
  local_bind_port: number;
}

export type TunnelConfig = PublishProfile | ForwardProfile;

export interface TunnelStatus {
  running: boolean;
  running_count: number;
  tunnels: RunningTunnelStatus[];
}

export interface RunningTunnelStatus {
  tunnel_id: string;
  name: string;
  type: ProfileType;
  started_at: string;
  target?: string;
  local_endpoint?: string;
}

export interface CloudflaredInfo {
  found: boolean;
  path?: string;
  source?: CloudflaredSource;
  version?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Log Types
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';
export type LogFilter = 'all' | LogLevel;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source: 'cloudflared' | 'app';
}

// App Settings
export interface AppSettings {
  autoStart: boolean;
  minimizeToTray: boolean;
  theme: 'light' | 'dark' | 'system';
  logRetentionDays: number;
}

// API Result Types
export type Result<T, E = string> =
  | { Ok: T }
  | { Err: E };
