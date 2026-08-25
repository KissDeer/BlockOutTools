# 仓库维护与 Skill 同步

## 工程边界

- `src/runtime/`：加载兼容内核、启动和错误呈现。
- `src/integrations/layout/`：编辑器 Store 适配、积木目录和 AI Schema 注入。
- `src/integrations/local/`、`src/server/`：本地关卡面板与磁盘库。
- `src/integrations/ue/`：参数化积木 UI、转换、MCP 和 UE 服务。
- `Start-LayoutTools.cmd`、`scripts/launch-layouttools.mjs`：Windows 一键启动、服务复用和端口冲突检查。
- `scripts/serve.mjs`：静态宿主及本地/UE HTTP API。
- `config/`：本地保存、UE 项目、参数化 Schema 与 fallback 映射。
- `tests/`：宿主、积木、AI、转换和持久化测试。
- `vendor/`：只读参考内核。
- 原始 HTML、下载目录和 `USER_MANUAL.md`：参考资料，默认保持不变。

优先在本地宿主层实现扩展。只有在明确决定替换参考内核的某个功能域时，才重写相应模块，并同步 `docs/FEATURE_PARITY.md`。

## 修改前检查

1. 运行 `git status --short`，保留用户已有改动。
2. 阅读 `README.md`、相关 `docs/`、配置和目标源码，不从旧对话猜当前实现。
3. 若服务已运行，核对 `4173` 的监听进程属于本项目，避免启动多个实例。
4. 明确本次授权只涉及网页、本地磁盘、UE dry-run 还是 UE apply。

一键启动器应在启动 Node 前确认目标页面是否已经是 LayoutTools，再检查端口是否被其他服务占用；启动后应等待页面身份可确认。服务窗口保持可见且只做最小化，不要使用 PowerShell 执行策略绕过或隐藏进程的启动方式，以免触发安全软件。

## 不变量

- `config/ue-parametric-blocks.json` 是放置器、检查器、AI、导入和导出的参数化 Schema 单一来源。
- 未知 AI `blockType` 不得伪装成 UE 积木；移除无效 UE 元数据并保留普通形状。
- 本地文件名必须防目录穿越；关卡至少校验 `shapes`、`entities`、`layers`。
- 个人关卡 JSON 和最后打开状态保持 Git ignored；测试使用临时目录。
- UE apply 必须由 dry-run、项目身份核对和用户确认保护；桥接不保存关卡。
- UE 导入脚本依赖 `set_editor_property` 的变更通知更新 Blueprint 构造结果；不要调用当前 UE Python 未暴露的 `actor.rerun_construction_scripts()`，失败 Actor 必须在异常处理内销毁。
- UE 转换器必须应用关卡 `exportScale`：空间坐标、层高、普通几何和 Schema 中 `unit: "cm"` 的参数使用同一线性比例；不得缩放角度、数量或其他无量纲参数。
- 参数化积木的画布控制柄缩放必须反写 Schema 几何参数；边缘尺寸标注只改变显示单位，不得重复缩放关卡数据。
- `src/integrations/layout/ai-block-bridge.js` 只为识别到的模型 POST 请求追加 Schema 目录，保留请求头中的认证信息而不把 API Key 复制到提示词或关卡数据。请求 JSON 无法解析时应直接透传，不能阻断原网页 AI。
- AI 积木目录由 `createUnifiedBlockCatalog()` 从 `config/ue-parametric-blocks.json` 生成；结果应用时必须按同一 Schema 规范化参数和二维几何。不得把这套提示词约束描述成模型对网页控件、MCP 或 UE Blueprint 的直接调用。
- 改动 AI 桥接时覆盖 Chat Completions、Responses、Anthropic Messages、Gemini 请求体，验证目录不会重复追加、认证信息不会进入请求体，且未知 `blockType` 会降级为原有形状。
- 静态检查不能替代浏览器呈现证明或 UE Editor 回读。

## 验证

常规修改至少运行：

```powershell
npm run check
npm test
```

前端行为变化还要通过真实页面验证：页面身份、非空首屏、无错误覆盖层、控制台健康、目标交互和截图。涉及自动保存时验证编辑后保存、刷新恢复、服务重启恢复和文件切换。

UE 转换变化要覆盖 dry-run 计划和往返测试；实际 apply 后，若用户授权，还需通过 UE MCP/Editor 回读 Actor 类型、Transform、参数和数量。不要把“API 请求成功”写成“关卡结果已验证”。

## Skill 同步规则

本 Skill 的可版本控制源文件位于 `skills/layout-tools-workflow/`。当仓库变化影响以下任一内容时，同步对应参考：

- 使用步骤、按钮名称、默认路径或端口 -> `references/tool-usage.md`
- UE 类型、参数、坐标、MCP、导入导出规则 -> `references/ue-bridge.md`
- 架构、配置、测试、工程边界或安全不变量 -> `references/maintenance.md`
- 触发范围或路由方式 -> `SKILL.md`
- UI 展示名或默认提示 -> `agents/openai.yaml`

同步时以当前代码和配置为准，避免把一次故障写成永久规则。Skill 文件应和相关代码进入同一审查范围，但只有用户要求提交时才提交。

完成后运行：

```powershell
python C:\Users\zhaowenbo\.codex\skills\.system\skill-creator\scripts\quick_validate.py D:\GameDesgin\BlockOutTools\skills\layout-tools-workflow
```

全局发现位置应是 `C:\Users\zhaowenbo\.codex\skills\layout-tools-workflow`，并链接到仓库中的 Skill 目录。若链接失效，先检查目标目录，再重新建立，不要复制出第二份需要独立维护的内容。

## Git 整理

提交前检查暂存范围和 `git diff --cached --check`。不要纳入 `data/levels/*.json`、`.library-state.json`、API Key、UE 临时导出或无关工作区改动。提交信息应描述实际功能变化；推送只在用户明确要求时执行。
