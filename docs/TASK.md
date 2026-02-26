# Cloudflare Tunnel Manager - 项目任务计划

## 项目阶段划分

### Phase 1: 基础架构 (任务 1-3)
搭建项目骨架，准备开发环境

### Phase 2: 核心功能 (任务 4-7)
实现 Tunnel 管理核心逻辑

### Phase 3: 前端开发 (任务 8-11)
实现用户界面

### Phase 4: 系统集成 (任务 12-15)
高级特性集成

### Phase 5: 发布 (任务 16)
构建与打包

---

## 详细任务列表

### Phase 1: 基础架构

| ID | 任务 | 优先级 | 预估时间 |
|----|------|--------|----------|
| 1 | 项目初始化：创建 Tauri 2.x 项目，配置前端框架（React + TypeScript + Tailwind） | HIGH | 1h |
| 2 | Rust 基础架构：搭建模块结构（commands, tunnel, state），配置日志系统（tracing） | HIGH | 2h |
| 3 | Sidecar 配置：下载 cloudflared 二进制，配置 tauri.conf.json | HIGH | 30min |

### Phase 2: 核心功能

| ID | 任务 | 优先级 | 预估时间 |
|----|------|--------|----------|
| 4 | Tunnel 核心功能：实现 start_tunnel / stop_tunnel / get_tunnel_status 命令 | HIGH | 2h |
| 5 | 进程管理：实现进程生命周期管理、日志流式读取、事件发射 | HIGH | 2h |
| 6 | 配置管理：实现 save_config / get_config / delete_config / list_tunnels | MEDIUM | 1h |
| 7 | 存储层：集成 tauri-plugin-store，实现 Token 加密存储 | MEDIUM | 1h |

### Phase 3: 前端开发

| ID | 任务 | 优先级 | 预估时间 |
|----|------|--------|----------|
| 8 | 前端基础框架：搭建页面结构（Layout, Navigation, Tunnels/Logs/Settings 页面） | HIGH | 2h |
| 9 | Tunnels 页面：Tunnel 卡片组件、新增/编辑/删除对话框 | HIGH | 3h |
| 10 | Logs 页面：实时日志显示、日志过滤、日志搜索 | HIGH | 2h |
| 11 | Settings 页面：主题切换、开机自启动、最小化到托盘设置 | MEDIUM | 1h |

### Phase 4: 系统集成

| ID | 任务 | 优先级 | 预估时间 |
|----|------|--------|----------|
| 12 | 系统托盘：实现托盘图标、托盘菜单、托盘状态指示 | MEDIUM | 2h |
| 13 | 配置导入导出：实现 YAML/JSON 配置文件的导入导出功能 | LOW | 1h |
| 14 | 自动更新：集成 tauri-plugin-updater 实现自动更新检查 | LOW | 1h |
| 15 | 错误处理：完善前后端错误处理、用户友好提示 | MEDIUM | 1h |

### Phase 5: 发布

| ID | 任务 | 优先级 | 预估时间 |
|----|------|--------|----------|
| 16 | 构建与测试：生产构建、测试验证、Release 打包 | HIGH | 2h |

---

## 总计

- **总任务数**: 16
- **HIGH 优先级**: 8
- **MEDIUM 优先级**: 5
- **LOW 优先级**: 3

- **预估总时间**: ~22 小时

---

## 技术栈

- **后端**: Rust + Tauri 2.x
- **前端**: React 18 + TypeScript + Tailwind CSS
- **状态管理**: Zustand / Jotai
- **存储**: tauri-plugin-store
- **Shell**: tauri-plugin-shell (Sidecar)
- **托盘**: tauri-plugin-tray (built-in)
- **自动更新**: tauri-plugin-updater

---

## 依赖项 (Rust)

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
tauri-plugin-shell = "2"
tauri-plugin-store = "2"
tauri-plugin-autostart = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tracing = "0.1"
tracing-subscriber = "0.3"
thiserror = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

---

## 里程碑

- [x] **M1** (2h): 项目初始化 + Sidecar 配置完成
- [x] **M2** (6h): Tunnel 核心功能完成，可命令行测试
- [x] **M3** (10h): 前端界面基本可用
- [x] **M4** (14h): 系统托盘 + 配置管理完成
- [x] **M5** (16h): 高级特性完成
- [x] **M6** (18h): 完整测试 + Bug 修复
- [x] **M7** (20h): Release 构建完成
