# 🐟 DSH Desktop Pet（DeepSeek Harness 桌宠）

在 DeepSeek Harness Web 界面养一只**女仆鲸娘桌宠**：跟着 Agent 的状态换表情立绘，可拖拽、可开关、点击会说话。

> 👤 作者：[@Sixlool](https://github.com/Sixlool)
> 📦 相关项目：[dsh-skill-picker（Skill 选择器）](https://github.com/Sixlool/dsh-skill-picker) · [dsh-interactive-dev-skill（AI 开发方法论 Skill）](https://github.com/Sixlool/dsh-interactive-dev-skill)

![pet-3](res/pet-3.png)

## ✨ 功能

| 功能 | 说明 |
|---|---|
| 🖼️ **状态切换立绘** | 待机 / 思考 / 完成 / 出错 四状态自动切换透明 PNG 立绘 |
| 🤖 **联动 DSH 状态** | 监听 `agent/status` / `agent/error` / `workflow/start\|end`，思考时不会误显示出错图（thinking 优先级最高） |
| 🖱️ **可拖拽** | 拖到任意位置，松手记住（刷新页面不丢）；Pointer + Mouse 双事件链 + 像素预览兜底 |
| 🔘 **Web 端开关** | 侧边栏底部 🐾 按钮随时开/关，状态记忆 |
| 💬 **点击互动** | 点击桌宠弹随机问候气泡 |
| ✨ **轻量动画** | 浮动 / 呼吸 / 跳跃 / 抖动，纯 CSS |

## 🎭 状态 → 立绘映射

| 状态 | 立绘 | 附加效果 |
|---|---|---|
| 待机 / 完成 | `res/pet-3.png` | 浮动 / 🎉 跳跃 |
| 思考中 | `res/pet-2.png` | 呼吸 + zZ |
| 出错 | `res/pet-1.png` | 抖动 + 💧 |

## 📦 这是什么

这是一个**动态 Cordis 插件源码包**：代码就是当前在 DeepSeek Harness 会话中直接运行、验证过的版本（pkg-9）。

- `lib/host.js` — Host 半源码（状态机 + RPC + 图片读取）
- `lib/client.js` — Client 半源码（SVG 立绘渲染 + 拖拽 + 开关 + 气泡）
- `res/` — 三张透明 PNG 立绘（原图来自公开的 DeepSeek 娘二创图，经去背景处理）

## 🚀 用法

### 方式一：动态插件（推荐，开箱即用）

在 DSH 会话中让 Agent 执行：

1. 把 `lib/host.js` 内容作为 `cordis_define` 的 `code.host`
2. 把 `lib/client.js` 内容作为 `code.client`
3. 用 `cordis_run` 激活（首次需在 UI 批准）
4. 把 `res/pet-1.png` / `pet-2.png` / `pet-3.png` 复制为工作区里的
   `pet-cutout-1-small.png` / `pet-cutout-2-small.png` / `pet-cutout-3-small.png`

> 图片默认从工作区根目录读取（`sandboxPolicy.workspaceRoot`，失败时回退 `D:\aiagent`）。
> 换图：同名替换即可；改文件名需同步修改 `lib/host.js` 里的 `IMG_FILES`。

### 方式二：转正式插件

代码结构已按 DSH 插件惯例组织（`package.json` 声明 host/client 入口），
可作为转正式插件（webServer / Remote 通信层）的起点。

## 🧩 技术要求

- DeepSeek Harness（Web 界面）
- 动态插件无需额外安装；无需 API Key
- 纯前端 + Host 事件监听，无外部依赖

## ⚠️ 已知限制

- 动态插件是**进程级临时**的：完整重启 DSH 后需要重新 `cordis_run`
- 开关/位置保存在 Host 内存：刷新页面保留，完整重启回到默认开启
- 立绘切换是静态图，表情不变（如需动态表情可换 SVG 渲染）

## 📄 License

[MIT](./LICENSE)
