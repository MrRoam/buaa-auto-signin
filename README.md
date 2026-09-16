# 北航 iClass 签到助手

自动登录北航统一认证，获取当天 iClass 课表，并在课堂签到窗口自动尝试签到；也支持在终端中手动选择课堂签到。

> 非学校官方工具。请先确认课程要求和学校规定，并自行承担自动化签到、账号保存、网络中断、接口变化等风险。本工具不能绕过位置、时间或教师设置的签到限制。

## 功能

- 只需输入学号和统一认证密码，无需手工导出课表或查找 `loginName`。
- 以 iClass 当天实时课表为准，课前 9 分钟开始尝试，成功后不重复提交。
- 支持 Windows 后台运行和登录后自启动。
- 支持交互式手动签到，以及只获取课表、不提交的检查模式。
- 账号配置、日志、课表缓存和运行状态均被 Git 忽略，不会随代码提交。

## 快速开始

需要 [Node.js 18 或更高版本](https://nodejs.org/)，并确保当前网络能访问北航 iClass；校外通常需要先连接学校 VPN。

### Windows

1. 下载本仓库并解压。
2. 双击 `run-windows.bat`。
3. 如果尚未安装 Node.js，可按提示输入 `y` 自动安装。
4. 首次运行时输入学号和统一认证密码。

窗口会保留并显示执行结果，不会因报错直接闪退。脚本会验证账号、生成本机 `config.json`，再安装并启动后台任务。以后登录当前 Windows 账户后会自动运行。

### macOS / Linux

```bash
npm run setup
npm start
```

`npm start` 需要终端保持运行。需要系统自启动时，可分别使用：

```bash
# macOS
chmod +x install-macos-launchagent.sh
./install-macos-launchagent.sh

# Linux（systemd 用户服务）
chmod +x install-linux-systemd.sh
./install-linux-systemd.sh
```

## 手动签到

```bash
npm run signin
```

程序会列出今天的 iClass 课堂。输入课堂序号并再次确认后才会提交签到。

只想确认登录和课表获取是否正常，不提交签到：

```bash
npm run dry-run
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run setup` | 配置或更换学号、密码，并验证登录 |
| `npm start` | 前台运行自动签到 |
| `npm run signin` | 手动选择一节课堂签到 |
| `npm run dry-run` | 获取课表并检查触发时间，不提交 |
| `npm run once` | 立即执行一次自动检查 |
| `npm test` | 运行测试 |

Windows 后台管理：

```powershell
./start-windows-background.ps1   # 启动
./stop-windows-background.ps1    # 停止
./pause-windows-autosignin.ps1   # 假期暂停并禁用计划任务
./resume-windows-autosignin.ps1  # 恢复计划任务和后台进程
```

## 配置

推荐通过 `npm run setup` 生成 `config.json`。需要调整行为时可编辑以下字段：

```json
{
  "studentId": "你的学号",
  "password": "你的统一认证密码",
  "triggerMinutesBeforeClass": 9,
  "pollIntervalSeconds": 20,
  "remoteRefreshSeconds": 900,
  "mode": "auto",
  "allowInsecureTls": false,
  "writeLogs": true
}
```

- `triggerMinutesBeforeClass`：课堂开始前多少分钟进入尝试窗口。
- `pollIntervalSeconds`：进入窗口但尚未成功时的重试间隔。
- `remoteRefreshSeconds`：当前没有未来课堂时，重新查询 iClass 的间隔。
- `mode`：后台自动运行固定为 `auto`；手动模式请使用 `npm run signin`。
- `iclassLoginName`：仅为旧配置兼容保留。填写密码后程序会自动获取，一般无需设置。

## 隐私与安全

- `config.json` 以明文保存在你的电脑上，因为后台任务需要无人值守登录。不要把它发送给别人，也不要移除 `.gitignore` 中对它的规则。
- 程序不会把学号、密码或 Cookie 写入日志；密码只用于向北航统一认证提交登录请求。
- 如果账号密码曾经误传到 GitHub，仅删除当前文件不够，还需要清理 Git 历史并立即修改密码、注销已有会话。
- 默认启用完整 TLS 证书校验。仅在确认是学校旧服务证书兼容问题时，才临时设置 `allowInsecureTls: true`；这会降低连接安全性。

运行日志位于 `logs/assistant.log`，已处理课堂状态位于 `state/handled.json`。两者都只保留在本机。

## 工作原理

1. 使用学号和密码完成北航统一认证。
2. 通过 iClass 官方入口取得当前账号的内部登录标识。
3. 查询 iClass 当天课表与签到状态。
4. 自动模式按课堂时间等待；手动模式由用户选择课堂。
5. 提交签到后记录本地状态，避免重复提交。

接口若被学校调整，程序可能暂时失效。欢迎提交 Issue，但请勿在 Issue、日志或截图中附带密码、Cookie、学号等个人信息。

## 许可证

[MIT](LICENSE)
