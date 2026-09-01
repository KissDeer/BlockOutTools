# 数据、UE 与 AI 契约

状态：`Draft 1`

## 1. 单一领域模型

运行时只存在一套规范化领域模型。2D、3D、文件、AI、验证和 UE 转换不得各自维护形状解释。

建议顶层对象：

- `Project`：项目身份、Schema、设置、模块索引、实例和连接。
- `ModuleDefinition`：独立文件中的积木、端口和局部元数据。
- `ModuleInstance`：定义引用、关系图位置和实际组装 Transform。
- `Block`：参数化 UE 积木或明确的非部署标注对象。
- `Port`：模块内部可编辑出入口。
- `Connection`：两个实例端口之间的类型化关系和关系图折点。
- `BlockoutProfile`：项目级尺寸与可走性规范。

## 2. 文件布局

建议项目结构：

```text
MyLevel/
  project.blockout.json
  modules/
    outer-wall.blockout-module.json
    dragon-yard.blockout-module.json
  drafts/
  imports/
```

`project.blockout.json`保存项目设置、模块文件引用、实例、连接和 UE 目标；模块内部几何只存在模块文件中。`drafts/`为本地恢复数据，默认 Git ignored。

所有正式 JSON：

- 使用 UTF-8 和稳定键顺序。
- 带 `schemaVersion`。
- 使用相对项目路径，不保存机器专属绝对路径；`.uproject`本机绑定进入用户配置。
- 保存前完整校验，写临时文件后原子替换。

## 3. 稳定身份

以下 ID 创建后不得因改名、移动、排序、保存或 AI 修改而变化：

- `projectId`
- `moduleDefinitionId`
- `moduleInstanceId`
- `blockId`
- `portId`
- `connectionId`

复制实例生成新 `moduleInstanceId`，保留定义和内部 `blockId`。复制定义生成新的定义、积木和端口 ID。

UE 同步键必须由 `projectId + moduleInstanceId + blockId`形成，不依赖名称、数组下标、临时 Shape ID 或几何。名称只用于显示和人工诊断。

## 4. 模块文件与合并

模块文件包含：定义身份、修订、积木、端口、局部设置和共同基线指纹。不包含项目实例和跨模块连接。

合并以稳定对象 ID 和字段为粒度：

- 单侧相对 base 的修改自动采用。
- 双方修改不同字段自动合并。
- 双方修改同一字段为冲突。
- 一侧删除、另一侧修改为冲突。
- 合并后重新计算端口引用、参数 Schema 和白盒规范。

## 5. 参数化积木 Schema

每种可部署类型至少声明：

- 稳定 `blockType`
- Blueprint Asset/Class 路径
- 参数名、类型、单位、默认值、范围和是否日常暴露
- 2D 投影函数
- 3D 预览函数
- UE 读写映射
- 规范检查能力
- Schema 迁移函数

材质、碰撞和渲染参数不能因为 UE 可读就全部暴露。默认界面只显示关卡设计师实际调整的关键参数；完整属性可放入高级区域。

## 6. UE 增量同步

UE Actor 至少写入以下标签或等价元数据：

- `BlockOutProject:<projectId>`
- `BlockOutInstance:<moduleInstanceId>`
- `BlockOutElement:<blockId>`
- `BlockOutSchema:<schemaVersion>`

dry-run 只扫描当前项目拥有的 Actor 和配置的目标文件夹。匹配以三段稳定身份为主；名称与几何只允许用于旧数据迁移，并且需要用户确认，不能作为日常无提示兜底。

计划行为：

- `create`：网页存在、UE 不存在。
- `update`：双方身份相同，部署属性不同。
- `unchanged`：部署属性一致。
- `retain`：UE 中存在但网页未引用，且删除未启用。
- `delete`：用户启用删除并重新检查后确认。
- `conflict`：身份重复、类型不兼容或目标状态不确定。

Apply 必须具备幂等性。新 Actor 配置失败时销毁该 Actor；更新旧 Actor 失败时报告并停止后续高风险删除。桥接从不自动保存地图。

## 7. 坐标与单位

- 领域模型统一使用厘米和角度，不再让显示比例改变数据含义。
- 网页 `X`映射 UE `X`，网页 `Y`映射 UE `-Y`，网页平面旋转映射负 UE Yaw。
- 模块内部坐标是局部坐标；实例 Transform 在组装阶段转换为世界坐标。
- 图层或模块基准高度必须有一个明确语义，不同时表示楼板底面和行走表面。
- 2D、3D 和 UE 共享同一个 pivot 定义；类型特殊 pivot 由 Schema 显式补偿。

旧文件的 `exportScale`只在导入迁移中读取。重做版新项目不允许用显示比例二次缩放真实几何。

## 8. AI 命令协议

AI 不接触 Store 内部结构，只调用版本化命令，例如：

```json
{
  "command": "updateBlock",
  "schemaVersion": 1,
  "target": {
    "moduleDefinitionId": "module-id",
    "blockId": "block-id"
  },
  "patch": {
    "transform.position": [1200, 600, 0],
    "parameters.BoxSize": [800, 40, 300]
  }
}
```

命令批次执行顺序：解析 -> 权限和 Schema 校验 -> 在副本中执行 -> 规范检查 -> 生成差异 -> 用户接受 -> 作为一个历史事务提交。

AI 必须优先 patch 现有对象。只有用户要求重建时才能批量替换，而且替换前要展示将失去的身份和连接。

## 9. 旧数据迁移

旧 LayoutTools JSON、现有 `structureGraph` 和 UE 旧标签通过显式迁移器进入新模型。迁移报告至少包含：

- 成功转换的模块、积木、端口和连接。
- 降级为 `LegacyShape` 的对象。
- 无法确定的单位、pivot、类型和同步身份。
- 需要人工确认的名称或几何匹配。

迁移始终生成新文件，不覆盖原文件。
