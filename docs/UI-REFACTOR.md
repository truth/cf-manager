# UI 重构说明（2026-02-26）

## 1. 目标

- 全量重构前端 UI 结构，统一视觉和交互语义。
- 修复旧版页面中的状态管理问题（如错误使用 `useState` 做副作用）。
- 提升页面可维护性，降低后续扩展（多隧道、设置持久化）成本。

## 2. 重构范围

- 应用壳层：`src/App.tsx`、`src/components/layout/AppShell.tsx`
- 通用 UI 组件：
  - `src/components/ui/Button.tsx`
  - `src/components/ui/StatusBadge.tsx`
  - `src/components/ui/Dialog.tsx`
- 页面：
  - `src/pages/TunnelsPage.tsx`
  - `src/pages/LogsPage.tsx`
  - `src/pages/SettingsPage.tsx`
- 样式系统：`src/App.css`
- 状态 Hook：`src/hooks/useTunnel.ts`
- 类型定义：`src/types/index.ts`

## 3. 新的前端结构

```text
src/
├── components/
│   ├── layout/
│   │   └── AppShell.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Dialog.tsx
│       └── StatusBadge.tsx
├── hooks/
│   └── useTunnel.ts
├── pages/
│   ├── LogsPage.tsx
│   ├── SettingsPage.tsx
│   └── TunnelsPage.tsx
├── types/
│   └── index.ts
├── App.css
├── App.tsx
└── main.tsx
```

## 4. 设计系统与视觉规范

- 使用 CSS 变量定义主题 token（颜色、圆角、阴影、动效）。
- 采用统一语义类名（`panel`、`btn`、`status-badge`），替代页面内大量散乱样式。
- 采用侧边导航 + 工作区布局：
  - 桌面端：左侧导航，右侧内容区。
  - 移动端：导航转为顶部网格按钮。
- 新增轻量动效：
  - 页面内容进入动画（`rise-in`）
  - 按钮悬停抬升
  - 卡片选中与 hover 过渡

## 5. 页面行为变化

### 5.1 Tunnels 页面

- 修复配置加载时机：从错误副作用改为 `useEffect + useCallback`。
- 增加“选中 tunnel”概念，并展示详情卡片。
- 启停操作与选中 tunnel 绑定。
- 新建 tunnel 使用通用 `Dialog` 组件。
- 增加成功/错误反馈条，提升可用性。

### 5.2 Logs 页面

- 增加关键字搜索（按 message/source）。
- 支持 `debug/info/warn/error/all` 过滤。
- 保留自动滚动开关。
- 统一日志行结构与级别徽标显示。

### 5.3 Settings 页面

- 重组为“启动行为 / 外观 / 日志保留”三组设置卡片。
- 使用一致的控件风格和状态反馈。
- 当前仍为前端内存态，保存接口待后端接入。

## 6. Hook 与类型改进

- `useTunnelStatus`：
  - 统一状态刷新逻辑。
  - 监听 `tunnel-status` 事件并处理运行/停止/错误。
- `useTunnelLogs`：
  - 初次加载后端日志缓存。
  - 限制日志条数（最多 500）避免内存持续增长。
- 类型新增：
  - `LogLevel`
  - `LogFilter`

## 7. 后续建议

1. 接入设置持久化（`tauri-plugin-store`），替换当前 `console.info` 占位逻辑。
2. 在隧道列表加入“编辑 token/名称”能力。
3. 给日志增加“导出文件”功能。
4. 在设置页提供“cloudflared 版本检测”与“诊断”入口。
