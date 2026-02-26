# AGENTS.md - Cloudflare Tunnel Manager

## Project Overview

Rust + Tauri desktop app for Cloudflare Tunnel (cloudflared) GUI management. **Greenfield project** - use modern best practices.

---

## 1. Build, Lint & Test Commands

### Rust Backend (src-tauri/)

```bash
# Development
cargo tauri dev                    # Run with hot reload
cargo tauri build                  # Build production executable

# Linting & Formatting
cargo clippy                       # Lint (warnings as errors: RUSTFLAGS="-Dwarnings")
cargo fmt                          # Format (check: cargo fmt --check)

# Testing
cargo test                         # Run all tests
cargo test --lib                   # Library tests only
cargo test --test <name>           # Specific test file
cargo test <test_function_name>    # Single test by name
```

### Frontend (src/)

```bash
npm run dev                        # Dev server
npm run build                      # Production build
npm run lint                       # ESLint check
npm test -- --watch               # Watch mode

# Single test
npm test -- --testNamePattern="<pattern>"
```

### Full Stack

```bash
cargo tauri build                  # Builds frontend + Rust backend
```

---

## 2. Code Style Guidelines

### Rust Backend

#### Naming

```rust
// Variables & Functions: snake_case
let config_path = "config.yml";
fn start_tunnel(token: String) -> Result<String, TunnelError> {}

// Structs, Enums, Traits: PascalCase
struct TunnelConfig { }
enum TunnelStatus { Running, Stopped, Error }

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRY_ATTEMPTS: u32 = 3;

// Private fields: prefix with underscore
struct InnerState {
    pub process_handle: Option<Child>,
    _config: Config,
}
```

#### Imports

```rust
// Order: std → crates → tauri → local modules
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

use tauri::{AppHandle, Manager, State};
use serde::{Deserialize, Serialize};

mod tunnel;
use tunnel::{TunnelManager, TunnelEvent};
```

#### Error Handling

```rust
// NEVER use unwrap() in production
// let data = json.parse().unwrap();  // BAD

// Use proper error types
#[derive(Debug, thiserror::Error)]
pub enum TunnelError {
    #[error("Failed to start tunnel: {0}")]
    StartFailed(String),
    #[error("Tunnel not found: {0}")]
    NotFound(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn start_tunnel(token: &str) -> Result<TunnelHandle, TunnelError> {
    if token.is_empty() {
        return Err(TunnelError::StartFailed("Empty token".into()));
    }
    // implementation
}
```

#### Tauri Commands

```rust
#[tauri::command]
async fn start_tunnel(
    token: String,
    state: State<'_, TunnelState>,
) -> Result<String, String> { }

window.emit("tunnel-log", LogLine { level: "info", message })?;
```

---

## 3. Frontend (React/TypeScript)

### Naming

```typescript
// Components: PascalCase
function TunnelDashboard() { }
const TunnelCard = () => { };

// Hooks: camelCase with 'use' prefix
const useTunnelStatus = () => { };

// Types: PascalCase
interface TunnelConfig {
  token: string;
  tunnelId: string;
}
type TunnelStatus = 'running' | 'stopped' | 'error';
```

### TypeScript

```typescript
// Always type function parameters and returns
function startTunnel(token: string): Promise<Result<string, string>> {
  return invoke('start_tunnel', { token });
}

// Use interfaces for object shapes
interface TunnelConfig {
  token: string;
  tunnelName?: string;
}

// Avoid 'any' - use unknown if truly unknown
function handleUnknown(data: unknown): string {
  if (typeof data === 'string') return data;
  return String(data);
}
```

---

## 4. Architecture

```
src-tauri/
├── src/
│   ├── main.rs              # Entry point, Tauri builder
│   ├── commands/            # Tauri command handlers
│   │   ├── tunnel.rs        # Start/stop/list tunnels
│   │   └── config.rs       # Configuration management
│   ├── tunnel/              # Tunnel management logic
│   │   ├── process.rs      # Process spawning & lifecycle
│   │   └── logs.rs         # Log parsing & streaming
│   └── state.rs             # Application state
└── binaries/                # cloudflared sidecar binaries

src/                         # Frontend (React/Vue)
├── components/              # UI components
├── hooks/                   # Custom hooks
├── services/                # Tauri invoke wrappers
└── types/                   # TypeScript interfaces
```

### Tauri 2.x Note

Requirements doc uses Tauri 1.x API. Use **Tauri 2.x** with:
- `@tauri-apps/plugin-shell` for sidecar execution
- `tauri-plugin-store` for persistence

---

## 5. Development Workflow

1. Start dev: `cargo tauri dev`
2. Make changes
3. Run tests: `cargo test` + `npm test`
4. Lint: `cargo clippy` + `npm run lint`
5. Build: `cargo tauri build`

---

## 6. Key Considerations

- **Process Management**: Hold child process handles to prevent premature termination
- **Log Streaming**: Use `tauri::Emitter` to send logs to frontend in real-time
- **Token Storage**: Use `tauri-plugin-store` (NOT localStorage)
- **Error Propagation**: Return meaningful errors to frontend for user feedback

### Git Commits

```bash
git commit -m "feat: add tunnel start/stop commands"
git commit -m "fix: handle empty token gracefully"
```
