# 仓库维护与 Skill 同步

## 重做版需求来源

`docs/rebuild/`是新版本的需求单一来源。重做功能与旧宿主、`USER_MANUAL.md`、`docs/FEATURE_PARITY.md`或 vendor 行为冲突时，以经用户确认的重做文档为准；旧资料仅用于迁移和历史对照。开始重做代码前先检查产品、功能、交互、数据/UE/AI 契约、实施计划和历史需求追踪是否一致。

## V2 工程边界

- `app-v2/src/domain/`：版本化项目模型、纯命令、目录、验证、部署几何、UE dry-run 和本地 JSON 边界；不得依赖 React、Canvas、Three.js 或旧 Store。
- `app-v2/src/store/project-store.ts`：Zustand 命令历史、选择、快捷键动作、预览脏状态和浏览器草稿调度。项目深层数据只能通过 domain 命令更新。
- `app-v2/src/features/assembly/`：React Flow 无限关系画布；第三方节点与边对象不得进入项目 JSON。React Flow 署名必须保留并避免遮挡 MiniMap。
- `app-v2/src/features/module-editor/`：Konva 内部编辑器和 Schema 参数检查器。控制柄缩放必须反写类型的关键尺寸参数。
- `app-v2/src/features/preview/`：惰性加载的 Three.js 预览；只消费`buildDeploymentGeometry()`，用户点击刷新前不得重建。
- `app-v2/src/features/ue/`：Phase 0 只展示`buildLocalUEDryRun()`结果，不连接 MCP、不提供 Apply。
- `app-v2/src/domain/*.test.ts`与`src/store/*.test.ts`：纯领域和命令动作验证。浏览器证据继续覆盖真实画布、WebGL 和桌面快捷键。

V2 Phase 0 不变量：

- 当前四类对象为 Box、Doorway、Stairs Linear 和 Port；Port 使用统一积木操作，但不进入部署几何或 UE 计划。
- 无限画布模块节点的俯视缩略图必须由内部积木旋转后的二维包围盒自适应生成；端口连接命中点使用同一投影中的真实相对 XY 与精确旋转，不得恢复为固定像素偏移或仅按节点边缘均分。
- 关系图位置`graphPosition`与实际`assemblyTransform`严格分开，拖动节点不改变 3D/UE 坐标。
- UE 同步键只由`projectId/moduleInstanceId/blockId`形成；显示名称变化不能改变身份。
- `resolveAssembly()`是 3D 与 UE dry-run 的模块 Transform 单一来源。每个连通分支以第一条连接的源实例为锚，端口必须相向并应用`CONNECTION_RULES`偏移；闭环与并行边不得静默忽略残差。
- 端口占用键必须由`moduleInstanceId/portBlockId`共同形成；模块定义复用时，不能因共享 Port block ID 而锁住其他实例的对应端口。连接建立必须验证 Port 确实属于端点实例引用的模块定义；选中连接后允许修改类型和删除，但类型变化只影响组装求解，不自动生成连接器几何。
- 3D 和 UE 均从同一规范化积木参数解释派生。Doorway 和 Stairs 可展开多个预览 primitive，但一个来源积木仍只对应一个 UE Actor 计划。
- 3D 默认收起；展开后从 236px 左侧模块库右缘覆盖到窗口右缘。预览必须通过截图像素和轨道交互验证为非空。
- `W/E/R`、复制、粘贴、`Ctrl+D`、删除和撤销重做在组装与模块内部按各自选择语义工作；输入框焦点屏蔽画布快捷键。
- 浏览器草稿和整项目 JSON 只是 Phase 0 恢复能力；不得声称模块分文件、原子磁盘库或结构化合并已经完成。

## 工程边界

- `src/runtime/`：加载兼容内核、启动和错误呈现。
- `src/integrations/layout/`：编辑器 Store 适配、积木目录和 AI Schema 注入。
- `src/integrations/layout/structure-module-model.js`、`structure-module-panel.js`：自有源图层、内部编辑会话、实例、端口、连接约束和无限组装画布。
- `src/integrations/layout/blockout-rules*.js`：关卡内白盒规范、识别规则和规范面板。
- `src/integrations/layout/module-package.js`：独立模块包、修订指纹、三方合并与冲突。
- `src/integrations/layout/editor-workflow-*.js`：模块内部的简化 UE 编辑工作条和纯几何变换。
- `src/integrations/layout/structure-preview-3d.js`：手动刷新的 Three.js 组装预览和轨道控制。
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
- 仓库内`data/levels/`的共享关卡 JSON 和最后打开状态进入 Git；个人关卡通过`LAYOUT_TOOLS_DATA_DIR`放在仓库外。测试必须继续使用临时目录，不得改写已跟踪关卡。
- 白盒规范保存在关卡根级`blockoutProfile`。只有显式识别的 Doorway、Stairs、Ramp 和带 corridor/landing 语义的形状参与检查；规范关闭时不得产生错误，`enforceUeImport`关闭时错误只提示不阻止 Apply。
- 模块包必须包含共同基线、当前内容和确定性修订值；相同稳定 ID 的对象进行三方合并，同字段冲突不得静默覆盖。模块包只管理模块定义及内部内容，不携带实例和外部连接。
- 简化编辑工作条只在模块内部显示，必须复用原画布选择与历史。`W/E/R`可配置但不区分世界/局部轴；锁定、隔离和搜索属于`editorWorkflow`元数据，不得改变 UE 导出几何。Box、Stairs Linear 和 Ramp 的数值缩放必须保持二维尺寸与关键参数同步；其他参数化类型继续用原检查器或控制柄编辑。
- UE apply 必须由 dry-run、项目身份核对和用户确认保护；桥接不保存关卡。
- UE 导入脚本依赖 `set_editor_property` 的变更通知更新 Blueprint 构造结果；不要调用当前 UE Python 未暴露的 `actor.rerun_construction_scripts()`，失败 Actor 必须在异常处理内销毁。
- UE 增量同步按`LayoutToolsSync`、`LayoutToolsId`、唯一类型名称、几何逐级匹配；歧义必须阻止 Apply。匹配 Actor 原地更新，未匹配旧 Actor默认保留，删除必须由用户勾选并重新 dry-run。同步标记不得只依赖容易被 AI 重建的临时 shape ID。
- UE 转换器必须应用关卡 `exportScale`：空间坐标、层高、普通几何和 Schema 中 `unit: "cm"` 的参数使用同一线性比例；不得缩放角度、数量或其他无量纲参数。
- 参数化积木的画布控制柄缩放必须反写 Schema 几何参数；边缘尺寸标注只改变显示单位，不得重复缩放关卡数据。
- `src/integrations/layout/ai-block-bridge.js` 只为识别到的模型 POST 请求追加 Schema 目录，保留请求头中的认证信息而不把 API Key 复制到提示词或关卡数据。请求 JSON 无法解析时应直接透传，不能阻断原网页 AI。
- AI 积木目录由 `createUnifiedBlockCatalog()` 从 `config/ue-parametric-blocks.json` 生成；结果应用时必须按同一 Schema 规范化参数和二维几何。不得把这套提示词约束描述成模型对网页控件、MCP 或 UE Blueprint 的直接调用。
- 无限画布直接创建的楼层模块必须建立 `ownsSourceLayer:true` 的私有源图层；从已有图层导入的兼容模块为 `false`。复用操作不得复制源 shapes/entities；删除模块只能清理自有源图层，不能删除导入的原图层。
- `模块出入口`必须复用统一积木目录、原画布选择/变换/复制/删除和现有积木检查器，不能另建专用放置或参数栏。内部数据仍是普通矩形，视觉层将其绘制为指向局部 `+X` 的箭头；无限画布的公布端口必须按 `facing` 显示同一正方向。内部形状的 `modulePort:{id,name,z}`、中心点和旋转是编辑来源，`module.ports`是外部组装镜像；旧 graph-only 端口进入内部时自动形状化。删除端口形状要清理相关连接，端口代理不得进入三维预览或 UE 导入。端口没有进出属性，一个实例端口最多连接一条路线；分支通过模块预设的多个端口形成。
- 无限画布的 `instance.transform` 只负责关系图排版，不得在建立连接或拖动节点时立即改写整个连接网络。`connection.waypoints`保存可增删和拖动的折线点；普通楼梯使用双向箭头，各连接类型维护自己的箭头和线型。不同端口之间允许分支、闭环以及同一对实例的并行路线；同一端口仍只能连接一次。`resolveStructureAssemblyGraph()`只在三维刷新、UE dry-run 或导出解析阶段以连通分支首个实例为锚，使端口面对面并应用 `CONNECTION_TYPES` 偏移；第一次到达实例的路线负责定位，后续闭合路线不得重复移动实例。图片生成脚本应验证闭合路线端点符合预期偏移。
- 无限画布打开时必须覆盖原编辑器左侧工具栏；进入模块内部或关闭组装工作台后恢复原编辑器界面。三维预览默认折叠，不应在折叠状态初始化渲染器；展开后必须覆盖左侧模块列表以外的整个主工作区，才允许刷新或调整 Three.js 视口。选中实例后，顶部删除命令和 `Delete` 键必须复用 `removeModuleInstance()`，同时清理连接但保留模块定义与内部内容；删除模块定义是独立的更强操作。无限画布的 `Ctrl+C`/`Ctrl+V`使用进程内实例剪贴板，粘贴只创建共享模块定义的新实例，不复制连接；`Ctrl+D`直接调用 `duplicateModuleInstance()`。输入控件、交互模式和三维预览必须屏蔽这些快捷键。
- 三维预览必须由用户点击刷新后才用 `resolveStructureGraphLevel()`重建；普通编辑只标记待刷新。重建时释放旧 Three.js 几何和材质，并保留轨道交互。参数化 Stairs Linear 必须从 `StairsSize`、`NumberOfSteps`和网页旋转逐级生成，不能退化为单个矩形 Box；`layoutRole:"floor"` 的图层高度代表行走表面，楼板厚度在预览中向下延伸。
- V2 三维预览的相机远裁面、雾范围、轨道最大距离和地面网格必须随部署几何包围盒缩放；完整地图不得因固定雾范围在刷新后显示为空场景。
- `structureGraph` 必须随关卡 JSON 保存并对旧文件保持可选；没有该字段时原编辑器、AI、保存和 UE 导入行为不变。UE 导入前用 `resolveStructureGraphLevel()` 展开实例，不能把源模板和实例重复导入。
- AI 模块契约必须列出固定连接类型，并明确禁止擅自增加用户未指定的端口。当前连接默认距离由 `CONNECTION_TYPES` 单一来源维护，UI、AI 提示和测试必须同步。
- 改动 AI 桥接时覆盖 Chat Completions、Responses、Anthropic Messages、Gemini 请求体，验证目录不会重复追加、认证信息不会进入请求体，且未知 `blockType` 会降级为原有形状。
- 静态检查不能替代浏览器呈现证明或 UE Editor 回读。

## 验证

常规修改至少运行：

```powershell
npm run check
npm test
```

V2 修改在 `app-v2/`中至少运行：

```powershell
npm test
npm run check
npm run build
```

当前 Phase 0 自动基线为 8 个 Vitest 测试。构建应保留 AssemblyCanvas、ModuleEditor 和 PreviewPanel 的惰性分包；第三方依赖本身的 Rollup 注释警告可以记录，但应用控制台必须无 error/warn。

前端行为变化还要通过真实桌面页面验证：页面身份、非空首屏、无错误覆盖层、控制台健康、目标交互和截图。涉及模块工作台时至少验证无限画布放置、两个模块的内部缩略形态可区分、端口在缩略图中的位置/朝向与内部数据对应、从缩略图箭头建立连接、双击/按钮进入内部、统一目录放置端口、原画布选择与变换、检查器名称/Z、删除同步、端口公布、返回、复用、一种连接、手动三维刷新、非空像素和轨道交互。本工具按桌面关卡编辑器维护，不要求移动端布局或移动视口回归。涉及自动保存时验证编辑后保存、刷新恢复、服务重启恢复和文件切换。

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

提交前检查暂存范围和 `git diff --cached --check`。完整仓库提交应纳入`data/levels/*.json`和`.library-state.json`的当前变更，但仍不得纳入 API Key、UE 临时导出或无关工作区改动。提交信息应描述实际功能变化；推送只在用户明确要求时执行。
