import { invoke } from '@tauri-apps/api/core';
import type { CloudflaredInfo, LogEntry, TunnelConfig, TunnelStatus, ValidationResult } from '../types';

// Runtime Commands
export async function startProfile(profileId: string): Promise<string> {
  return invoke<string>('start_profile', { profileId });
}

export async function stopProfile(profileId: string): Promise<string> {
  return invoke<string>('stop_profile', { profileId });
}

export async function stopAllProfiles(): Promise<string> {
  return invoke<string>('stop_all_profiles');
}

export async function getRuntimeStatus(): Promise<TunnelStatus> {
  return invoke<TunnelStatus>('get_runtime_status');
}

export async function validateProfile(profileId: string): Promise<ValidationResult> {
  return invoke<ValidationResult>('validate_profile', { profileId });
}

export async function detectCloudflared(): Promise<CloudflaredInfo> {
  return invoke<CloudflaredInfo>('detect_cloudflared');
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
