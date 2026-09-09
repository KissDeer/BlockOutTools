# 《沉没圣所》UE 落地说明（导入清单）

适用：把 `layouts/sunken-sanctum-spine.blockout.json`（干净主轴，0 残差）导入 Unreal Engine 做白盒。
> 推荐用 **spine 版**（0 残差、可确定性重复导入）；`sunken-sanctum.blockout.json`（含捷径闭环）会在 2 条闭环捷径边报告残差，需人工核对（见第 7 节）。

## 0. 前置条件

- 一个 UE 工程（`.uproject`），且已启用 **Blockout Tools 插件**（Blueprint 类在 `/BlockoutToolsPlugin/Blueprints/`）。
- 目标关卡地图，把各 Actor 放进去；工具本身不自动保存地图（FR-10）。

## 1. 数据来源

本项目工具只产出 **dry-run 计划**，不自动 Apply。已由离线脚本生成好你要用的一组数据：

```
layouts/ue-plan/sunken-sanctum-spine.blockout.actors.json
layouts/ue-plan/sunken-sanctum.blockout.actors.json
```

每个 Actor 条目含：`syncKey`、`label`、`blockType`、`blueprintClassPath`、`location`、`rotation`、`parameters`。

```jsonc
{
  "syncKey": "project_sunken_sanctum/instance_plaza/box_plaza_001",
  "label": "① 沉没庭院 · 篝火 / 沉没庭院楼板",
  "blockType": "box",
  "blueprintClassPath": "/BlockoutToolsPlugin/Blueprints/Blockout_Box.Blockout_Box_C",
  "location": [0, 0, 0],
  "rotation": [0, 0, 0],
  "parameters": { "BoxSize": [1200, 900, 40], "blockout_material_color": [0.46,0.49,0.51,1], "blockout_material_top_color": [0.66,0.69,0.7,1] }
}
```

## 2. 坐标与旋转映射（已应用）

导出即已换算好世界坐标与 UE 朝向（脚本 `scripts/export-ue-actors.mjs`，语义与 `app-v2/src/domain/ue-plan.ts` 一致）：

- 网页 `X` → UE `X`
- 网页 `Y` → UE **`-Y`**（取负）
- 网页平面旋转 → UE **`-Yaw`**（`rotation` 已存为 `[0,0,-(rot)]`）
- `location` 与 `rotation` 为 **UE 世界坐标/Euler**，直接可用。

> 所以不必再手动乘 `exportScale` 或再做镜像；直接按导出数值放置即可。

## 3. 逐 Actor 放置步骤

1. 在目标地图打开 **Place Actors**，搜索 `Blockout`，找到对应蓝图（`Blockout_Box` / `Blockout_Doorway` / `Blockout_Stairs_Linear`）。
2. 按导出的 `blueprintClassPath` 放置对应 Actor。
3. 设置 `location` 与 `rotation`（`rotation` 为 `[0,0,yaw]`）。
4. 在 Details 面板设置 `parameters`（`BoxSize`、`DoorwaySize`、`StairsSize`、`NumberOfSteps`、`StairsType`、材质颜色等）。
5. 按 `label` 命名（或保留；身份靠 `syncKey` 不影响）。

## 4. 稳定身份与重复导入（幂等）

`syncKey = projectId/instanceId/blockId`（与 `ids.ts` 的 `actorSyncKey` 一致）。为了重复导入不叠加/不改变身份，给每个 Actor 写入标签或部件元数据（`DATA_UE_AI_CONTRACT` 建议）：

- `BlockOutProject:<projectId>` → `project_sunken_sanctum`
- `BlockOutInstance:<instanceId>`（如 `instance_plaza`）
- `BlockOutElement:<blockId>`（如 `box_plaza_001`）
- `BlockOutSchema:2`

标签只读辅助；**身份匹配以三段稳定身份为主**，不依赖名称/数组下标。

## 5. 重复导入核对

- 连续第二次导入，同一 `syncKey` 的 Actor 应**身份不变**（同名同参数 → `unchanged`），不会新增叠加重叠 Actor。
- 复制模块实例 → 只有该实例新增一个 Actor 集（新 `instanceId`）。

## 6. 材质色约定（一致性）

- 地板：体色 `[0.46,0.49,0.51]`、顶色 `[0.66,0.69,0.7]`
- 墙体：体色 `[0.055,0.06,0.058]`、顶色 `[0.16,0.17,0.165]`
- 楼梯/门洞：金色系（体色 `[0.77,0.59,0.13]`、顶色 `[0.94,0.78,0.28]`）
  —— 仅用于白盒可读性，可随意换。

## 7. 已知限制（务必注意）

1. **只支持 3 类可部署 Actor**：Box / Doorway / Stairs Linear。螺旋梯、电梯、坡道、路、暗坑在 UE 侧**无对应积木**，只能用 Box 或 Stairs 近似表达。
2. **捷径闭环残差**：`sunken-sanctum.blockout.json` 的两个闭环捷径边（`connection_3`/`connection_4`，`posErr≈3014/1262`）说明工具按“±300cm 单跳”规则求解，大落差捷径无法零残差。**落地时以 spine 版为准**，或用实体多跳捷径重构。
3. **参数为默认/参考值**：`config/ue-parametric-blocks.json`（UE 实测蓝图 Schema）尚未提供，因此参数用的是仓库默认/参考约定，非实测值；拿到该文件后可切换为按官方参数精确构造。
4. **工具不自动 Apply**：以上均为手工按 dry-run 放置步骤；如需自动化，可用参考脚本 `scripts/ue_unreal_spawn.py`（UE Python/unreal 模块）按 `actors.json` 批量生成 Actor 并写入稳定身份标签。**该脚本为未在本机验证的参考模板**，需按你的 UE 版本 + Blockout Tools 插件核对蓝图类路径、属性名与标签 API 后运行。

## 8. 快速命令

```bash
# 重新导出 Actor 计划
node scripts/export-ue-actors.mjs layouts/sunken-sanctum-spine.blockout.json
# 校验 + 装配残差 + UE dry-run 计数
node scripts/validate-blockout.mjs layouts/sunken-sanctum-spine.blockout.json
# 确认可被 app 的 projectSchema 加载
node scripts/validate-schema.mjs layouts/sunken-sanctum-spine.blockout.json
```
