# `config/ue-parametric-blocks.json` 契约（待填模板）

2026-09-11 更新：当前网页实际使用的积木目录为 [block-library](../../app-v2/src/domain/block-library/README.md)。名称、默认参数和类路径已从 catalog.ts 移入各类型 definition.json；下文硬编码说明仅为历史描述。下文 pivot=center 也是未验证示意值，不是网页或 UE 实测结论。网页 Box 的 XY 为中心，Z 默认底面，也支持行走表面基准。新增定义以规则库为入口，UE 实测证据补充到对应类型，不再另外维护一套默认值。

仓库 `docs/rebuild/README.md` 把 `config/ue-parametric-blocks.json` 列为“经过 UE 实测的 Blockout Tools 蓝图 Schema”的权威来源，但该文件当前**不存在于仓库**。本文件只定义它应有的字段结构（契约），**不伪造 UE 实测值**，等你提供真实文件后替换。

> 用途：`app-v2/src/domain/catalog.ts` 与 `ue-plan.ts` 目前把积木参数、默认值与 Blueprint 类路径**硬编码**在源码里。把本契约落到 `config/ue-parametric-blocks.json` 后，可改成“从该文件读取”并按官方参数精确构造积木。

## 顶层结构

```jsonc
{
  "schemaVersion": 1,
  "source": "UE Blockout Tools 插件实测（请填写 UE 版本与插件版本）",
  "units": { "length": "centimeters", "rotation": "degrees" },
  "types": {
    "box": { "…": "见下" },
    "doorway": { "…": "见下" },
    "stairs-linear": { "…": "见下" }
  },
  "connections": {
    "door": { "forward": 0, "vertical": 0 },
    "one-way-door": { "forward": 0, "vertical": 0 },
    "stairs": { "forward": 400, "vertical": 300 },
    "spiral-stairs": { "forward": 0, "vertical": 300 },
    "elevator": { "forward": 0, "vertical": 300 },
    "one-way-elevator": { "forward": 0, "vertical": 300 },
    "road": { "forward": 500, "vertical": 0 },
    "drop": { "forward": 250, "vertical": -300 }
  }
}
```

## 每种类型的字段契约

```jsonc
"box": {
  "label": "Box 盒体",
  "blueprintClassPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
  "defaults": {
    "BoxSize": { "value": [600, 400, 40], "units": "cm", "range": "—" },
    "blockout_material_color": { "value": [0.22, 0.57, 0.48, 1], "units": "rgba" },
    "blockout_material_top_color": { "value": [0.72, 0.86, 0.8, 1], "units": "rgba" }
  },
  "exposed": ["BoxSize", "blockout_material_color", "blockout_material_top_color"],
  "pivot": "center"
},
"doorway": {
  "label": "Doorway 门洞",
  "blueprintClassPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Doorway.Blockout_Doorway_C",
  "defaults": {
    "DoorwaySize": { "value": [40, 140, 240], "units": "cm" },
    "TopThickness": { "value": 40, "units": "cm" },
    "SideThickness": { "value": 40, "units": "cm" },
    "blockout_material_color": { "value": [0.22, 0.57, 0.48, 1] },
    "blockout_material_top_color": { "value": [0.72, 0.86, 0.8, 1] }
  },
  "exposed": ["DoorwaySize", "TopThickness", "SideThickness", "blockout_material_color", "blockout_material_top_color"],
  "pivot": "center"
},
"stairs-linear": {
  "label": "Stairs Linear 线性楼梯",
  "blueprintClassPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Stairs_Linear.Blockout_Stairs_Linear_C",
  "defaults": {
    "StairsSize": { "value": [180, 360, 180], "units": "cm" },
    "NumberOfSteps": { "value": 10 },
    "StairsType": { "value": "BOX", "enum": ["BOX", "CLOSED", "SLOPED"] },
    "blockout_material_color": { "value": [0.22, 0.57, 0.48, 1] },
    "blockout_material_top_color": { "value": [0.72, 0.86, 0.8, 1] }
  },
  "exposed": ["StairsSize", "NumberOfSteps", "StairsType", "blockout_material_color", "blockout_material_top_color"],
  "pivot": "center"
}
```

## 与现有硬编码的差异点（拿到真实文件后需要对齐）

- 当前 `catalog.ts`/`ue-plan.ts` 硬编码的默认值与类路径应改为读本文件。
- UI 只暴露 `exposed` 字段；其余参数保持插件默认（FR-05）。
- 若真实 UE 返回值与仓库硬编码不同，以本文件为准，并同步更新参考关卡与测试。
- 若你的 UE 工程未装 Blockout Tools 插件，`blueprintClassPath` 无效 —— 需在 `.uproject` 里确认插件。

> 你上轮勾选“稍后提供，先继续”。拿到真实文件后放到 `config/ue-parametric-blocks.json`，我即可把积木从默认值切换到按官方参数精确构造，并补 UE 侧核查。
