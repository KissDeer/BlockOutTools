# LayoutTools Local

这是 LayoutTools `v0.0.2` 下载版的本地兼容宿主。目标是先保持参考版本的界面与行为一致，再为后续逐模块调整建立清晰边界。

## 启动

需要 Node.js 20 或更高版本。

Windows 下直接双击根目录的 `Start-LayoutTools.cmd`，脚本会在最小化的 `LayoutTools Server` 命令窗口中启动服务并打开浏览器。若服务已经启动，则只打开现有页面；若 `4173` 被其他程序占用，会显示错误而不会重复启动。运行期间保留该服务窗口，需要停止时关闭它即可。

也可以在终端中启动：

```powershell
npm install
npm start
```

首次运行或 `package-lock.json` 更新后先执行一次 `npm install`。

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

## Codex Skill

项目配套 Skill 位于 `skills/layout-tools-workflow/`，可通过 `$layout-tools-workflow` 调用。它包含网页操作、本地关卡保存、AI 积木、MYMY / UE 桥接和仓库维护说明；后续相关行为或数据契约变化时，应在同一任务中同步更新该 Skill 并运行 Skill 校验。

## 本地关卡保存

页面右下角的 `本地` 面板用于管理本机 JSON 关卡文件。编辑内容会在 800 ms 后自动保存；刷新页面或重启服务时，会恢复上次打开的文件。也可以输入文件名另存当前关卡，或从列表选择并打开已有文件。

默认保存目录是 `data/levels/`，默认文件是 `autosave.json`。该目录中的个人关卡和最后打开记录不会提交到 Git。需要把关卡库存到其他位置时，可在启动前指定绝对目录：

```powershell
$env:LAYOUT_TOOLS_DATA_DIR = "D:\LayoutToolsLevels"
npm start
```

## 楼层模块组装

启动后默认进入以无限画布为主的组装工作台。关闭工作台后，可从右下角 `模块` 再次打开。点击 `新增模块` 后在空白位置放置；双击模块或点击 `编辑内部` 会回到原 LayoutTools 画布，并只显示该模块的内部图层。此时右侧现有 `放置积木` 列表会出现 `模块出入口`：像矩形等积木一样连续放置、选择、拖动、缩放、旋转、复制和删除，名称与局部 Z 也在同一个积木检查器内编辑。点击 `返回组装` 后，内部几何和出入口会同步显示到无限画布。已有图层仍可通过 `从当前图层导入` 建立兼容模块。

模块可整体移动和复用。无限画布是关系图：模块位置只用于整理关系图，不会在建立连接时被强行吸附。选择普通门、单向门、楼梯、螺旋楼梯、普通电梯、单向电梯、普通路或单向下落路后，依次点击第一个出入口、任意数量的空白折点和第二个出入口即可绘制路线；普通楼梯使用双向箭头，不同形式使用不同箭头和线型。双击路线可增加折点，拖动折点可改道，双击折点可删除；一个模块用多个预设出入口连接不同路线时自然形成分支。

内部出入口的局部位置、Z 和朝向是最终拼接约束。只有点击 `刷新预览` 或执行导出时，工具才以每个关系分支的首个模块为锚，旋转目标模块使相连出入口面对面，再应用连接形式的水平距离和高度差。工作台提供平面和层高展开视图；预览会按 `StairsSize` 与 `NumberOfSteps` 逐级重建 Stairs Linear，标记为 `layoutRole: "floor"` 的楼板以图层高度作为行走表面并向下显示厚度。模块数据保存在关卡根级 `structureGraph`，路线折点保存在连接的 `waypoints`，沿用本地关卡库的自动保存与恢复。

UE dry-run/import 会先把模块实例展开为独立世界坐标几何；`模块出入口` 的矩形只是在内部画布上的可编辑代理，不会导入 UE。连接形式目前只作为网页组装和 JSON 元数据保存，尚不生成单独的 UE 门、楼梯或电梯 Actor。

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
