// Tunnel Types
export interface TunnelConfig {
  id: string;
  name: string;
  token: string;
  notes?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface TunnelStatus {
  running: boolean;
  running_count: number;
  tunnels: RunningTunnelStatus[];
}

export interface RunningTunnelStatus {
  tunnel_id: string;
  name: string;
  started_at: string;
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
