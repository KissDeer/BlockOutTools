# MYMY / Unreal 参数化积木桥接

> Current Host Reference：本文描述当前兼容宿主的 UE 桥接实现。重做版的目标契约以 [`rebuild/DATA_UE_AI_CONTRACT.md`](rebuild/DATA_UE_AI_CONTRACT.md) 为准。

## 范围

桥接目标是 `E:/Project/MYMY/MYMY.uproject` 与 Blockout Tools `1.52`。网页中的“UE 积木”严格对应插件面板的 15 类 Blueprint Actor，不包含蓝图内部使用的 53 个 StaticMesh。原 LayoutTools 积木继续保留；其导入 UE 的静态网格 fallback 属于兼容层，不属于参数化积木目录。

## 稳定数据契约

```json
{
  "ueBlockout": {
    "kind": "parametric",
    "blockType": "doorway",
    "blueprintAssetPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway",
    "blueprintClassPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway_C",
    "parameters": {
      "DoorwaySize": [50, 200, 250],
      "TopThickness": 50,
      "SideThickness": 50,
      "bRoundSize": true,
      "blockout_enable_collisions": true,
      "blockout_cast_shadows": true
    }
  }
}
```

`blockType` 是网页稳定键；`blueprintClassPath` 用于核对 UE 类型；`parameters` 使用 UE Python 可直接读写的真实属性名。唯一 Schema 位于 `config/ue-parametric-blocks.json`，放置器、检查器、AI、dry-run、UE 导入和 UE 导出都读取这份文件。

## 15 类与关键参数

| 类型 | 关键几何参数 |
| --- | --- |
| Box | `BoxSize`, `bRoundSize` |
| Cone | `ConeRadius`, `ConeHeight`, `ConeQuality` |
| Corner Curved | `CornerCurvedRadius`, `CornerCurvedHeight`, `bIsInner`, `CornerCurvedQuality` |
| Corner Ramp | `CornerRampSize` |
| Cylinder | `CylinderRadius`, `CylinderHeight`, `CylinderQuality` |
| Doorway | `DoorwaySize`, `TopThickness`, `SideThickness` |
| Railing | `RailingSections`, `SectionLenght`, `SkewElevation`, `bHasEndPole`, `RailingType` |
| Ramp | `RampSize` |
| Skewbox | `SkewboxLenght`, `StartSize`, `EndSize`, `Alignment` |
| Sphere | `SphereRadius`, `bIsHemisphere`, `SphereQuality` |
| Stairs Curved | `NumberOfSteps`, `StairsAngle`, `bCounterClockwise`, `StairsHeight`, `InnerRadius`, `StepWidth`, `StairsType` |
| Stairs Linear | `StairsSize`, `NumberOfSteps`, `StairsType` |
| Stairs Linear Manual | `NumberOfSteps`, `StepWidth`, `StepDepth`, `StepHeight`, 两个 Spacing, `StairsType` |
| Tube | `Sections`, `Angle`, `Radius`, `Height`, `Thickness`, `Alignment` |
| Window | `WindowSize`, `TopThickness`, `SideThickness`, `BottomThickness` |

所有类型还共享材质类型、主体/顶面颜色、网格、世界对齐、网格尺寸、亮度、粗糙度、自定义材质、碰撞预设和投射阴影参数。插件不支持布尔减法模式，因此 Schema 不提供该选项。

## 网页放置、编辑与 AI

右下角 `UE` 面板提供“全部 / UE 积木 / 原有积木”。选择 UE 类型后，参数检查器编辑待放置模板；点击画布可连续放置。取消放置后，在画布中选择参数化积木，检查器会转为编辑该对象。矩形参数化积木的画布控制柄与检查器参数双向同步。

支持的 AI 请求格式会追加相同的参数化 Schema。AI 必须输出 `blockType`、Blueprint 类路径和合法参数；未知类型会移除无效 `ueBlockout`，保留普通 LayoutTools 形状。底层 StaticMesh ID 不进入 AI 目录。

## UE 导入与导出

- UE 面板可用 `使用当前网页` 直接读取画布的最新关卡和换算设置，也可以选择磁盘 JSON。
- dry-run 读取现有桥接 Actor，生成新增、原地更新、不变、删除、保留和冲突计划。
- apply 需要项目名和完整 `.uproject` 路径同时匹配，并经过网页确认。
- 匹配优先使用`LayoutToolsSync`稳定标记，其次是原始 ID、同类型唯一名称和完全一致几何；歧义会阻止 apply，避免 ID 变化时重复生成。
- 未匹配的 UE Actor 默认保留；勾选删除选项并重新 dry-run 后才进入删除计划。
- 白盒规范启用强制导入检查时，门洞、楼梯、坡道等错误会阻止 apply。
- 参数化项通过 Blueprint Asset 加载类、生成 Actor，并用 `set_editor_property` 的编辑器变更通知设置属性和更新构造结果。
- 原 LayoutTools 形状仍使用 `config/ue-blockout-mapping.json` 的静态网格 fallback。
- 导出只读取 `BlockOutToolsBridge` 文件夹或标签拥有的 Actor；参数化 Actor 按类路径读取 Schema 中列出的属性。
- 桥接不会自动保存 UE 关卡。

## 坐标与单位约定

- 网页尺寸以网页厘米为基准，导入时读取 JSON 的 `exportScale`。例如 `50 UU = 1cm` 会把坐标、层高、普通几何，以及参数 Schema 中标为 `cm` 的 Blueprint 参数乘以 50；角度、数量、枚举和开关不缩放。
- 画布边缘尺寸标注显示 `unitsPerPixel` 换算后的目标单位数值；这只是显示适配，不修改网页几何，导入时不会重复缩放。
- UE 中 `1 UU = 1cm`；缺少或无效的 `exportScale` 时按 `1cm = 1cm` 导入。
- 网页 `X` 映射 UE `X`，网页向下的 `Y` 映射 UE `-Y`。
- 网页旋转映射为负 UE Yaw。
- 图层高度映射 Actor 根节点 `Z`。
- Blueprint Actor 根节点位于网页二维表现中心；参数决定实际构造形状。

## HTTP API

| Endpoint | Method | 作用 |
| --- | --- | --- |
| `/api/ue/status` | GET | 读取 MCP 与 Editor 身份 |
| `/api/ue/catalog` | GET | 读取原网页积木 fallback 所需的静态网格边界 |
| `/api/ue/mapping` | GET | 返回项目配置、fallback 映射和 15 类参数化 Schema |
| `/api/ue/palette` | GET | 生成 15 类参数化积木模板 |
| `/api/ue/import` | POST | 默认 dry-run；显式模式和项目确认后才 apply |
| `/api/ue/export` | GET | 读取桥接 Actor 并生成 LayoutTools JSON |

网页必须先完成 dry-run 才会启用 apply 按钮；当前网页或删除策略在检查后变化时，旧计划会失效。同步冲突和启用强制检查的规范错误都会保持 apply 禁用。
