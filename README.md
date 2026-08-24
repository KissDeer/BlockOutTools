# LayoutTools Local

这是 LayoutTools `v0.0.2` 下载版的本地兼容宿主。目标是先保持参考版本的界面与行为一致，再为后续逐模块调整建立清晰边界。

## 启动

需要 Node.js 20 或更高版本。

```powershell
npm start
```

浏览器访问 `http://127.0.0.1:4173`。

如需改端口：

```powershell
$env:LAYOUT_TOOLS_PORT = "4180"
npm start
```

## 验证

```powershell
npm run check
npm test
```

## MYMY / UE 桥接

启动 `E:\Project\MYMY\MYMY.uproject` 并保持默认 MCP 监听 `http://127.0.0.1:8000/mcp`，然后打开网页右下角的 `UE` 面板。

- “放置积木”：`UE 积木`中只有插件面板对应的 15 类参数化 Blueprint Actor。选择后先在参数检查器中设置尺寸、段数、角度、形式、材质、碰撞和阴影，再点击画布连续放置；按 `Esc` 取消。
- 选中画布中已放置的 UE 积木后，同一参数检查器会编辑它的 `ueBlockout.parameters`，二维外形同步更新。
- “下载网页积木模板”：生成包含 15 类参数化积木及默认参数的 LayoutTools JSON。
- “检查导入”：只生成 Blueprint Actor、属性和 Transform 计划，不修改关卡。
- “导入 UE”：再次确认后创建对应 Blueprint Actor、设置真实编辑器属性并重跑 Construction Script。
- “从 UE 导出 JSON”：读取桥接拥有的 Blueprint Actor 及其参数，恢复网页积木。

项目连接和轴向约定在 `config/ue-project.json`；15 类参数化积木的唯一 Schema 在 `config/ue-parametric-blocks.json`。`config/ue-blockout-mapping.json` 只保留给原网页矩形、圆形、墙体和楼梯导入 UE 时的静态网格 fallback，不再作为 UE 积木库展示。

网页 AI 使用与参数检查器相同的 Schema。请求模型时会附加原有积木、15 个 `blockType`、Blueprint 类路径以及可用参数；不再向 AI 暴露底层 StaticMesh `assetId`。未知类型会移除错误的 UE 标记并按原有形状保留。API Key 仍只由原 LayoutTools 的本地配置管理，桥接层不读取或记录 Key。

## 工程边界

- `src/`：本地宿主源码，负责启动、错误处理和后续扩展入口。
- `scripts/`：零依赖本地静态服务器。
- `tests/`：宿主层自动化测试。
- `assets/blockout-icons/`：插件 15 类放置项使用的本地图标。
- `vendor/`：从用户提供的生产构建复制出的只读兼容内核。
- `layout tools by KluiYao.html` 与 `layout tools by KluiYao_files/`：原始下载件，保持不变，作为视觉与行为基线。
- `USER_MANUAL.md`：原始功能说明，保持不变。

## 后续修改原则

`vendor/layout-tools-0.0.2.js` 是压缩并混淆过的生产文件，不应直接修改。涉及功能调整时，优先在 `src/` 添加清晰的宿主能力；需要改变编辑器内部逻辑时，应按功能域重写对应模块，并用 `docs/FEATURE_PARITY.md` 持续记录替换进度与回归结果。

AI 功能仍需要在应用内配置第三方模型服务、API Key 和模型名称；本地化不会绕过这些外部服务要求。
