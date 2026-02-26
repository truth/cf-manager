# Cloudflare Tunnel Manager

一个简洁易用的 Cloudflare Tunnel (cloudflared) GUI 客户端，基于 Rust + Tauri 构建。

---

## 功能特性

- 🚀 **一键启动/停止** - 简单点击即可管理 Tunnel
- 📊 **实时日志** - 查看 cloudflared 输出日志
- 💾 **配置持久化** - 保存多个 Tunnel 配置
- 🌙 **暗色主题** - 护眼设计
- 🔄 **进程管理** - 安全管理 cloudflared 进程

---

## 环境要求

- Windows 10+ / macOS 10.15+ / Linux
- 已安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)（或由应用自动下载）

---

## 安装

### 从 Release 安装

1. 前往 [Releases](https://github.com/your-repo/cf-manager/releases) 下载对应平台的安装包
2. 运行安装程序

### 从源码构建

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/cf-manager.git
cd cf-manager

# 2. 安装 Rust (如果没有)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 3. 安装 Node.js (前端构建)
# https://nodejs.org/

# 4. 安装前端依赖
npm install

# 5. 开发模式运行
cargo tauri dev

# 6. 构建生产版本
cargo tauri build
```

---

## 快速开始

### 1. 获取 Tunnel Token

1. 登录 [Cloudflare Zero Trust Dashboard](https://dash.teams.cloudflare.com/)
2. 前往 **Access** → **Tunnels**
3. 点击 **Create a tunnel**
4. 按照向导完成配置，复制 Token

> 💡 **提示**：Token 形如 `eyJhIjoi...`，请妥善保管

### 2. 添加 Tunnel

1. 点击界面上的 **[+ New Tunnel]** 按钮
2. 输入 Tunnel 名称
3. 粘贴刚才复制的 Token
4. 点击 **保存并启动**

### 3. 查看状态

- **绿色圆点** = Tunnel 正在运行
- **灰色圆点** = Tunnel 已停止
- **红色圆点** = 发生错误

---

## 常见问题

### Q: Tunnel 启动失败怎么办？

1. 检查 Token 是否正确
2. 检查网络连接
3. 查看 **Logs** 页面的详细错误信息

### Q: 如何更新 cloudflared？

应用会自动使用 bundled 的 cloudflared 版本。如需更新，请下载新版本替换 `binaries/` 目录下的文件。

### Q: Token 存储在哪里？

Token 加密存储在本地应用的配置目录中：
- Windows: `%APPDATA%\cf-manager\`
- macOS: `~/Library/Application Support/cf-manager/`
- Linux: `~/.config/cf-manager/`

### Q: 如何开机自启动？

在 **Settings** 页面勾选 **Start with Windows** (或对应系统选项)。

---

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建 Tunnel |
| `Ctrl+,` | 打开设置 |
| `Ctrl+L` | 打开日志 |
| `Esc` | 关闭对话框 |

---

## 技术栈

- **后端**: Rust + Tauri 2.x
- **前端**: React + TypeScript + Tailwind CSS
- **存储**: tauri-plugin-store
- **进程管理**: tauri-plugin-shell (Sidecar)

---

## 贡献

欢迎提交 Issue 和 Pull Request！

---

## 许可证

MIT License
