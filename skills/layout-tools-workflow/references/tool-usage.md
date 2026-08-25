# 网页工具使用

## 启动与打开

仓库需要 Node.js 20 或更高版本。Windows 下首选双击根目录的 `Start-LayoutTools.cmd`：它会在最小化但可见的 `LayoutTools Server` 命令窗口中启动服务、等待页面可用并打开浏览器；服务已运行时只打开页面，端口被其他程序占用时会显示错误。关闭该服务窗口即可停止服务。

也可以在 `D:\GameDesgin\BlockOutTools` 中运行：

```powershell
npm start
```

打开 `http://127.0.0.1:4173/`。默认端口被占用时，先核对监听进程；需要改端口可设置 `LAYOUT_TOOLS_PORT`。不要同时启动多个本项目服务。

## 推荐工作顺序

1. 打开右下角 `本地` 面板，确认当前文件或从列表选择要编辑的 JSON。
2. 设置关卡名、网格、旋转步长、图层和各层高度。
3. 用原有积木或右下角 `UE` 面板中的参数化积木搭建布局。
4. 用 2D 检查铺面、墙线和标注，用 3D 与图层分离视图检查层高、墙体和楼梯连接。
5. 等待自动保存状态完成；阶段版本用不同文件名执行 `保存当前`。
6. 需要跨工具迁移时再使用 JSON、FBX、GLTF、OBJ 或 UE 桥接。

## 本地关卡库

- 默认目录：`D:\GameDesgin\BlockOutTools\data\levels\`
- 默认文件：`autosave.json`
- 编辑后约 800 ms 自动保存到当前文件。
- 页面刷新或服务重启后恢复最后打开的有效文件。
- `保存当前` 可另存；文件列表可刷新并选择打开。
- 可在启动前设置 `LAYOUT_TOOLS_DATA_DIR` 指向其他绝对目录。
- 个人 JSON 和 `.library-state.json` 不提交 Git。

切换文件前，页面会先保存当前文件。若打开失败，先检查 JSON 是否包含 `shapes`、`entities`、`layers` 三个数组。

## 原有 LayoutTools 能力

左侧工具包括选择、矩形、基准框、门窗、墙体/楼梯、实体、测量、Polygon、图片、切割、撤销重做和网格。右侧设置和图层面板负责：

- 关卡、网格、旋转和标签设置。
- 图层、分组、可见性、锁定、层高、3D 墙体及目标层。
- 门窗颜色与高度、3C 胶囊体、实体图标。
- 2D、3D 和图层分离视图。
- JSON、PNG、FBX、GLTF、OBJ 与单位换算。

右侧 `导出缩放 / 单位换算` 会写入关卡的 `exportScale`。画布边缘尺寸按目标单位显示，左下角状态标明倍率和单位；网页内部坐标仍以厘米保存。UE 面板的 `使用当前网页` 会直接读取这组最新设置；修改比例或画布后需要重新执行 `检查导入`。

需要具体手势、快捷键、布尔运算、路网、测量或导出字段时，查阅仓库根目录的 `USER_MANUAL.md`。它是原始功能说明，不随本地扩展改写。

## AI 助手

在右侧 `AI` 面板配置服务商、Base URL（如需要）、API Key 和模型。API Key 由原 LayoutTools 的浏览器本地配置管理，本地桥接不读取它。

网页 AI 可使用原有 LayoutTools 积木和 15 类 UE 参数化积木。提示词应写清：

- 空间和层数。
- 平台高度与连接关系。
- 房间、墙体、楼梯和实体要求。
- 是替换现有布局还是增量修改。
- 对 UE 积木有要求时给出积木类型和关键尺寸。

### AI 如何使用积木

这不是模型直接点击网页或调用 UE Blueprint 的 Tool Calling。UE 面板读到参数化 Schema 后，会在原网页发送模型请求前，把原有积木、15 个 `blockType`、Blueprint 类路径、参数键、范围和枚举值追加到该请求的 system/instructions；模型据此返回标准 LayoutTools JSON。支持原网页使用的 Chat Completions、Responses、Anthropic Messages 和 Gemini GenerateContent 请求格式。

模型返回的参数化积木必须带有 `ueBlockout: { kind: "parametric", blockType, blueprintClassPath, parameters }`；网页根据 Schema 补全和校验参数，再由参数反算二维外形。`config/ue-parametric-blocks.json` 是唯一目录来源，不能在提示词或代码中另维护一份类型清单，也不向模型提供插件内部 StaticMesh `assetId`。

此过程不会自动写入 UE。模型结果先只更新网页关卡；需要进入 MYMY 时，仍须由用户执行 `检查导入`，核对计划后再明确点击 `导入 UE`。未知 `blockType` 会撤销其 UE 标记并保留普通形状，同时给出警告。

应用 AI 结果后必须检查形状数量、图层高度、地面连续性、楼梯目标层和参数检查器。外部模型可用性不是本地工具的离线能力。

## 已知基线行为

- 原版 `v0.0.2` 在撤销一次绘制后可能无法重做；当前宿主保留该参考行为。
- 约 768 px 宽视口下，顶部缩放文字可能被挤成多行。
- 3D 视图可能输出 `THREE.Clock` 弃用警告；它不代表画布渲染失败。
- AI 结果质量和图片理解能力取决于用户所选外部模型。
