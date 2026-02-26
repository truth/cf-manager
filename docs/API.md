# Cloudflare Tunnel Manager - API 设计文档

## 1. 概述

本文档定义了 Cloudflare Tunnel Manager 的后端 API 接口，供前端调用。

## 2. Tauri Commands (前端 → Rust)

### 2.1 Tunnel Management

#### `start_tunnel`

启动一个 Cloudflare Tunnel。

```typescript
invoke('start_tunnel', { token: string }): Promise<Result<string, string>>
```

**参数：**
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| token | string | 是 | Cloudflare Tunnel Token |

**返回值：**
```json
{
  "Ok": "Tunnel started successfully"
}
```

**错误：**
```json
{
  "Err": "Failed to start tunnel: token is empty"
}
```

---

#### `stop_tunnel`

停止当前运行的 Tunnel。

```typescript
invoke('stop_tunnel'): Promise<Result<string, string>>
```

**返回值：**
```json
{
  "Ok": "Tunnel stopped"
}
```

**错误：**
```json
{
  "Err": "No tunnel running"
}
```

---

#### `get_tunnel_status`

获取 Tunnel 当前状态。

```typescript
invoke('get_tunnel_status'): Promise<Result<TunnelStatus, string>>
```

**返回值：**
```typescript
type TunnelStatus = {
  running: boolean;
  tunnel_id?: string;
  started_at?: string;  // ISO 8601
};
```

---

#### `list_tunnels`

列出所有已配置的 Tunnels（本地存储的配置）。

```typescript
invoke('list_tunnels'): Promise<Result<TunnelConfig[], string>>
```

---

### 2.2 Configuration Management

#### `save_config`

保存 Tunnel 配置到本地存储。

```typescript
invoke('save_config', { config: TunnelConfig }): Promise<Result<(), string>>
```

**TunnelConfig 类型：**
```typescript
interface TunnelConfig {
  id: string;
  name: string;
  token: string;
  created_at: string;
  updated_at: string;
}
```

---

#### `delete_config`

删除指定的 Tunnel 配置。

```typescript
invoke('delete_config', { id: string }): Promise<Result<(), string>>
```

---

#### `get_config`

获取指定 Tunnel 配置。

```typescript
invoke('get_config', { id: string }): Promise<Result<TunnelConfig | null, string>>
```

---

### 2.3 Log Management

#### `get_logs`

获取 Tunnel 运行日志。

```typescript
invoke('get_logs', { limit?: number }): Promise<Result<LogEntry[], string>>
```

**LogEntry 类型：**
```typescript
interface LogEntry {
  timestamp: string;      // ISO 8601
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: 'cloudflared' | 'app';
}
```

---

#### `clear_logs`

清空日志缓存。

```typescript
invoke('clear_logs'): Promise<Result<(), string>>
```

---

## 3. Events (Rust → 前端)

### 3.1 Tunnel Events

#### `tunnel-status`

Tunnel 状态变更事件。

```typescript
listen('tunnel-status', (event: TunnelStatus) => { ... })
```

**Payload：**
```typescript
type TunnelStatus = {
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  message?: string;
  tunnel_id?: string;
};
```

---

#### `tunnel-log`

Tunnel 日志输出事件。

```typescript
listen('tunnel-log', (event: LogEntry) => { ... })
```

---

#### `tunnel-error`

Tunnel 错误事件。

```typescript
listen('tunnel-error', (event: LogEntry) => { ... })
```

---

#### `tunnel-connected`

Tunnel 成功连接 Cloudflare。

```typescript
listen('tunnel-connected', (event: { tunnel_id: string; domain: string }) => { ... })
```

---

## 4. Data Structures

### 4.1 Core Types

```typescript
// Tunnel 状态枚举
type TunnelStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

// 日志级别
type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// Tunnel 配置
interface TunnelConfig {
  id: string;              // UUID
  name: string;            // 用户自定义名称
  token: string;           // Cloudflare Token (加密存储)
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}

// 单条日志
interface LogEntry {
  id: string;              // UUID
  timestamp: string;       // ISO 8601
  level: LogLevel;
  message: string;
  source: 'cloudflared' | 'app';
}

// 应用设置
interface AppSettings {
  auto_start: boolean;     // 开机自启动
  minimize_to_tray: boolean;
  theme: 'light' | 'dark' | 'system';
  log_retention_days: number;
}
```

### 4.2 Error Types

```typescript
// 统一的错误响应格式
interface AppError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// 错误码定义
const ErrorCodes = {
  // Tunnel 相关
  TUNNEL_START_FAILED: 'TUNNEL_START_FAILED',
  TUNNEL_NOT_RUNNING: 'TUNNEL_NOT_RUNNING',
  TUNNEL_ALREADY_RUNNING: 'TUNNEL_ALREADY_RUNNING',
  
  // 配置相关
  CONFIG_NOT_FOUND: 'CONFIG_NOT_FOUND',
  CONFIG_SAVE_FAILED: 'CONFIG_SAVE_FAILED',
  CONFIG_INVALID_TOKEN: 'CONFIG_INVALID_TOKEN',
  
  // 系统相关
  CLOUDFLARED_NOT_FOUND: 'CLOUDFLARED_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;
```

---

## 5. API Versioning

当前 API 版本：`v1`

所有命令以 `invoke` 方式调用，事件以 `listen` 方式监听。

---

## 6. 使用示例

### 6.1 启动 Tunnel

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

async function startTunnel(token: string) {
  try {
    await invoke('start_tunnel', { token });
    
    // 监听日志
    const unlisten = await listen('tunnel-log', (event) => {
      console.log('[LOG]', event.payload.message);
    });
    
    // 监听状态变更
    await listen('tunnel-status', (event) => {
      console.log('[STATUS]', event.payload.status);
    });
    
  } catch (error) {
    console.error('Failed to start tunnel:', error);
  }
}
```

### 6.2 保存配置

```typescript
async function saveTunnelConfig(name: string, token: string) {
  const config = {
    id: crypto.randomUUID(),
    name,
    token,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  await invoke('save_config', { config });
}
```

---

## 7. 注意事项

1. **Token 安全**：Token 必须加密存储，使用 `tauri-plugin-store` 的安全存储
2. **进程管理**：必须持有进程句柄，防止进程被意外终止
3. **日志流**：使用事件机制实时推送日志，避免轮询
4. **错误处理**：所有命令返回 `Result<T, String>`，前端需正确处理错误情况
