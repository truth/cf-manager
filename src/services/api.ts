import { invoke } from '@tauri-apps/api/core';
import type { TunnelConfig, TunnelStatus, LogEntry } from '../types';

// Tunnel Commands
export async function startTunnel(tunnelId: string, name: string, token: string): Promise<string> {
  return invoke<string>('start_tunnel', { tunnelId, name, token });
}

export async function stopTunnel(tunnelId: string): Promise<string> {
  return invoke<string>('stop_tunnel', { tunnelId });
}

export async function stopAllTunnels(): Promise<string> {
  return invoke<string>('stop_all_tunnels');
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  return invoke<TunnelStatus>('get_tunnel_status');
}

// Config Commands
export async function saveConfig(config: TunnelConfig): Promise<void> {
  return invoke<void>('save_config', { config });
}

export async function deleteConfig(id: string): Promise<void> {
  return invoke<void>('delete_config', { id });
}

export async function getConfig(id: string): Promise<TunnelConfig | null> {
  return invoke<TunnelConfig | null>('get_config', { id });
}

export async function listTunnels(): Promise<TunnelConfig[]> {
  return invoke<TunnelConfig[]>('list_tunnels');
}

// Import/Export Commands
export async function exportConfigs(): Promise<string> {
  return invoke<string>('export_configs');
}

export async function importConfigs(jsonData: string): Promise<number> {
  return invoke<number>('import_configs', { jsonData });
}

// Log Commands
export async function getLogs(limit?: number): Promise<LogEntry[]> {
  return invoke<LogEntry[]>('get_logs', { limit });
}

export async function clearLogsApi(): Promise<void> {
  return invoke<void>('clear_logs');
}
