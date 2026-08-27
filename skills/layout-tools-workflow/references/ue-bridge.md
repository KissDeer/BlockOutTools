# MYMY / Unreal 桥接

## 前置条件

- Unreal 项目：`E:\Project\MYMY\MYMY.uproject`
- Blockout Tools 插件基线：`1.52`
- 默认 MCP：`http://127.0.0.1:8000/mcp`
- 网页入口：右下角 `UE` 面板

打开 UE 面板后先看连接状态。项目名和完整 `.uproject` 路径必须都匹配，不能只凭编辑器已连接就执行导入。

## 放置和编辑参数化积木

`UE 积木`对应插件面板的 15 类 Blueprint Actor：Box、Cone、Corner Curved、Corner Ramp、Cylinder、Doorway、Railing、Ramp、Skewbox、Sphere、Stairs Curved、Stairs Linear、Stairs Linear Manual、Tube、Window。

使用方式：

1. 在 `全部 / UE 积木 / 原有积木` 中选择来源并选中积木。
2. 在参数检查器设置尺寸、段数、角度、形式、材质、碰撞和阴影。
3. 点击画布连续放置；按 `Esc` 取消。
4. 取消放置后选中画布中的 UE 积木，可在同一检查器编辑参数；矩形参数化积木也可拖动八个控制柄修改平面尺寸。二维外形与 `ueBlockout.parameters` 双向同步。

参数化类型的唯一 Schema 是 `config/ue-parametric-blocks.json`。不要用插件内部的 StaticMesh 列表替代这 15 类 Blueprint，也不要向网页 AI 暴露底层 `assetId`。

原网页矩形、圆形、墙体和楼梯仍可使用；它们导入 UE 时走 `config/ue-blockout-mapping.json` 的静态网格兼容映射，不属于参数化积木目录。

### Box 盒体操作约定

Box 用于地面/平台和墙体。日常搭建与 AI 生成时，优先且通常只控制以下数据：

- Transform：网页平面位置、图层高度与平面旋转，导入时分别成为 UE 位置与 Yaw。
- `BoxSize`：`[X, Y, Z]`，分别是长度、宽度和高度，单位为网页厘米。地面/平台用 X/Y 覆盖平面、用 Z 设厚度；墙体用一条平面轴表示长度、另一轴表示墙厚、Z 表示墙高，再用旋转决定朝向。
- `blockout_material_color` 与 `blockout_material_top_color`：仅在需要区分地面、墙体或顶面视觉时设置。

`bRoundSize` 和其他材质、碰撞、阴影属性保持插件默认值，不作为日常编辑或 AI 生成的控制项。Schema 仍保留这些字段，只为保证与 UE 的完整参数读写兼容；不要因此主动修改它们。

## 网页到 UE

严格区分两个阶段：

1. `检查导入`：只生成 Actor 类、Transform、属性与警告计划，不修改关卡。
2. `导入 UE`：用户确认后创建 Blueprint Actor，并通过 `set_editor_property` 的编辑器变更通知设置真实属性和触发构造更新。不要额外调用未由当前 UE Python 暴露的 `rerun_construction_scripts()`。

在 UE 面板点 `使用当前网页` 可直接采用画布中的最新关卡和 `exportScale`；也可以用 `选择 LayoutTools JSON` 导入磁盘文件。当前网页在 dry-run 后发生变化时，旧计划会失效，必须重新点 `检查导入`。

关卡存在 `structureGraph` 时，dry-run 会先把每个模块实例展开为独立图层、形状和实体，再按实例 X/Y/Z/旋转生成 Actor 计划；模块源图层本身不会重复导入。带 `modulePort` 的矩形是网页内部的端口编辑代理，展开、三维预览和 UE 导入都必须排除它。网页中保存的连接类型和端口用于确定实例相对坐标，目前不会额外创建门、楼梯、电梯或道路 Actor。需要这些连接器进入 UE 时，应在后续明确每种连接对应的 Blockout Tools Blueprint 和参数，再扩展转换器。

Apply 前确认：

- dry-run Actor 数量和警告合理。
- 当前编辑器确实是 MYMY，且项目路径匹配。
- 替换同名桥接文件夹是否符合本次意图。
- 目标关卡、层高、坐标与旋转已检查。

桥接只处理 `BlockOutToolsBridge` 文件夹或标签拥有的 Actor，不自动保存 UE 关卡。单个 Actor 在生成或配置中失败时必须立即销毁，不能在地图中遗留未标记的半成品。

## UE 到网页

`从 UE 导出 JSON`读取桥接拥有的 Actor：

- 参数化 Actor 按 Blueprint 类路径匹配类型，并读取 Schema 声明的属性。
- 结果生成 LayoutTools JSON，可在网页打开或放入本地关卡库。
- 导出结果要核对 Actor 数、类型、参数、层高和二维位置；连接成功不等于往返完全正确。

## 坐标与单位

- 网页几何、积木参数和图层高度以网页厘米为基准；导入时读取关卡 JSON 的 `exportScale`。例如 `50 UU = 1cm` 会把位置、层高、墙体和所有标记为 `cm` 的 Blueprint 参数乘以 50，数量、角度、枚举和开关不缩放。
- UE 中 `1 UU = 1cm`。缺少或无效的 `exportScale` 按 `1cm = 1cm` 处理。
- 网页 `X` -> UE `X`。
- 网页向下 `Y` -> UE `-Y`。
- 网页旋转 -> 负 UE Yaw。
- 图层高度 -> Actor 根节点 `Z`。
- Blueprint Actor 根节点对应网页二维表现中心，具体几何由参数构造。

## 关键数据与诊断入口

- 项目、MCP、坐标：`config/ue-project.json`
- 参数化类型与参数：`config/ue-parametric-blocks.json`
- 原积木 fallback：`config/ue-blockout-mapping.json`
- 网页面板：`src/integrations/ue/bridge-panel.js`
- 数据转换：`src/integrations/ue/bridge-converter.js`
- 模块展开：`src/integrations/layout/structure-module-model.js`
- UE 服务：`src/integrations/ue/ue-service.js`
- MCP 客户端：`src/integrations/ue/mcp-client.js`
- 详细契约：`docs/UE_BRIDGE.md`

诊断连接可运行 `npm run ue:inspect`；重新盘点插件资产可运行 `npm run ue:catalog`。盘点和 dry-run 属于只读检查，apply 属于外部写入。
