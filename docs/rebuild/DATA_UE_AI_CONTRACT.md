# 数据、UE 与 AI 契约

状态：`已确认需求 · 2026-09-16 同步拓扑驱动搭建 A+B`

当前主流程、持久化扩展和 agent 桥接以第 10 节为准。UE Apply/回读以及第 8 节通用命令全集是后续目标；本轮实现不代表这些接口可用。

当前实现补充（2026-09-10）：本地库保存到 `data/projects-v2/project-<身份摘要>/`。清单引用 `modules/<内容摘要>.blockout-module.json`，旧模块版本保留，清单最后原子替换；不是下文建议的按显示名称覆盖模块文件。保存版本由清单和引用模块内容共同计算，外部变更拒绝覆盖。三方合并支持独立字段，同字段冲突仍由 Git 处理。新增可选字段 `assemblyAnchorInstanceId`、连接 `spacing`、Box `role/elevationReference`、模块 `reference/interpretation` 和积木 `provenance`；旧 V2 数据保持原有底面坐标语义。

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

当前本地库结构：

```text
data/projects-v2/project-<项目身份摘要>/
  project.blockout.json
  modules/
    <内容摘要>.blockout-module.json
```

`project.blockout.json` 保存项目设置、模块文件引用、实例、连接、拓扑和共享 `designContext`。模块文件保存内部几何、`designBrief`、`shapeConfirmation` 等定义级字段。浏览器恢复草稿使用本地存储；当前没有单独的 `drafts/` 文件夹或持久化 UE 目标。

所有正式 JSON：

- 使用 UTF-8 和稳定键顺序。
- 项目清单和完整 JSON 备份带 `schemaVersion`；模块内容由项目 Schema 校验，不重复嵌入项目版本字段。
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

UE 同步键由 `projectId / scopePath… / moduleInstanceId / blockId` 形成；扁平项目没有 `scopePath` 段。不依赖名称、数组下标、临时 Shape ID 或几何，名称只用于显示和人工诊断。当前生成本地计划，实际 UE Apply/回读另行实施。

## 4. 模块文件与合并

模块文件包含：定义身份、修订、积木、端口、局部设置和共同基线指纹。不包含项目实例和跨模块连接。

合并以稳定对象 ID 和字段为粒度：

- 单侧相对 base 的修改自动采用。
- 双方修改不同字段自动合并。
- 双方修改同一字段为冲突。
- 一侧删除、另一侧修改为冲突。
- 合并后重新计算端口引用、参数 Schema 和白盒规范。

## 5. 参数化积木 Schema

当前目录入口为 `app-v2/src/domain/block-library/README.md`。网页目录直接读取各类型 `definition.json` 的标签、默认值和 UE 类路径；硬校验仍在 `project-schema.ts`，几何仍由类型实现提供。AI 先读通用规则，再按类型读取定义与用法，最后结合项目规范。Box 只开放尺寸、变换及主体/顶面颜色，碰撞、渲染与其他材质属性不因“高级区域”而开放。新增类型不能仅靠添加规则文件启用。

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

## 8. 通用 AI 命令协议（后续目标）

当前模块初始化使用第 10 节 `ModuleDraft`；以下 patch 协议保留为后续通用编辑目标，不是当前 HTTP 接口。

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

## 10. 模块局部草案与上下文（当前 A+B 契约）

### 10.1 持久化字段与兼容

项目继续使用 `schemaVersion: 2`，新增可选字段，不改变原有局部坐标、积木 ID 或实例含义：

```ts
project.designContext?: {
  goal: string;
  constraints: string;
  materials: Array<{
    id: string;
    name: string;
    kind: "structure" | "mood" | "rules" | "note";
    text: string;
    imageData: string;
    moduleIds: string[];
  }>;
};
module.designBrief?: { purpose: string; goals: string };
module.shapeConfirmation?: { digest: string; confirmedAt: string };
```

`moduleIds` 保存稳定的 **ModuleDefinition.id**，空数组表示项目资料；一份图片正文只存一次，可关联多个定义。`imageData` 为空或 PNG/JPEG/WebP data URL。旧 `concept.inputs` / 子作用域输入保留在原处，解析时继承根输入和当前所属作用域输入，并加入模块 `reference` 底图；不复制、不按名称猜配。

新版读取缺少这些字段的旧 V2 文件，保留原几何、实例与坐标。完整 JSON 导出和分文件库均保存新字段。旧版解析器可能丢弃未知字段，**不承诺旧程序重新保存后仍保留新资料**；这次可选扩展不构成反向写入兼容。

形态确认指纹关联相关上下文与当前几何；缺几何、未确认、已确认、需重新核对分别表示状态，不替代端口对接或玩法测试。请求和待采用草案是临时编辑状态，不进入项目文件。

### 10.2 统一模块上下文与局部坐标

`resolveModuleContext(project, moduleId)` 同时服务页面和请求，包含项目目标/约束、模块目的/目标、成员区域、内部链路、跨模块链路、相关锁钥、资料及来源、缺图提示。材料携带实际 `imageData`，仅有文件名不算可看图；agent 须实际查看后才能声称参考。

`contextDigest` 覆盖相关节点、连接、备注、锁钥、资料内容、明确标高和项目规范；不包含 `graphPosition`、连线把手方向或无关模块专属资料。`geometryDigest` 覆盖当前定义积木，排版移动不让草案过期，新的手工几何会阻止旧草案覆盖。

草案位姿统一为模块局部厘米坐标与角度；不能把拓扑排版当空间坐标。明确标高保留相对高差，楼层编号本身不自动换算厘米。快速模板按角色尺寸沿局部 X 排列并留 600cm 间隔，外部端口暂朝右；这些假设需人工核对，不是 AI 结论。

### 10.3 HTTP 请求与返回

本地服务提供以下端点，不主动调用模型，不写项目文件：

| 方法与路径 | 输入 | 返回/行为 |
| --- | --- | --- |
| `POST /api/module-drafts/requests` | `ModuleDraftRequest` 完整 JSON | `{requestId, status: "waiting"或"ready"}`；首次为 waiting，相同请求重复提交保留原状态，不同内容不能占用同一 ID |
| `GET /api/module-drafts/requests?projectId=<id>` | 可选项目过滤 | `{requests: [{requestId,projectId,moduleId,moduleName,createdAt,status}]}`；列表不重复返回全部图片 |
| `GET /api/module-drafts/<requestId>` | 请求 ID | `{request, candidate: null或ModuleDraft, status: "waiting"或"ready"}`；`request.context.materials` 包含原图 data URL |
| `POST /api/module-drafts/<requestId>/result` | `ModuleDraft` 完整 JSON，`source: "agent"` | 身份和两基线匹配后返回 `{ok:true,requestId,status:"ready"}` |

桥接暂存最近 8 个请求，单次请求体上限 64MB；服务重启或旧请求被淘汰后需重新准备材料。结果的 `requestId`、`projectId`、`moduleId`、`contextDigest`、`geometryDigest` 必须逐项匹配；别的请求不能覆盖当前候选。网页读取后再次以当前项目校验，桥接的 ready 只表示收到结构合法结果，不表示已采用或设计通过。

请求字段：

```ts
ModuleDraftRequest = {
  version: 1;
  requestId: string;
  projectId: string;
  moduleId: string;           // 模块定义 ID
  contextDigest: string;
  geometryDigest: string;
  intent: string;
  context: ModuleContext;    // 含 sourceId、区域、内外链路、规则、图片、警告
  existingBlocks: Block[];
  createdAt: string;
  instructions: string[];
};
```

例如请求的定义 ID 是 `module_church`，其拓扑分组 ID 是 `logicmodule_church`，成员区域是 `node_hall`，对外链路是 `link_roof`。返回的 `moduleId` 用前者，积木来源的 `sourceId` 必须用请求 `context.sourceId`（此例 `logicmodule_church`），不能混用：

```json
{
  "version": 1,
  "requestId": "原样复制请求 requestId",
  "projectId": "原样复制请求 projectId",
  "moduleId": "module_church",
  "contextDigest": "原样复制请求 contextDigest",
  "geometryDigest": "原样复制请求 geometryDigest",
  "source": "agent",
  "blocks": [
    {
      "id": "block_hall_draft",
      "name": "大厅体块",
      "type": "box",
      "transform": { "position": [1800, 1500, 0], "rotation": 0 },
      "parameters": {
        "BoxSize": [3600, 3000, 600],
        "blockout_material_color": [0.2, 0.48, 0.4, 1],
        "blockout_material_top_color": [0.64, 0.8, 0.72, 1]
      },
      "provenance": { "sourceId": "logicmodule_church", "featureId": "node_hall", "status": "estimated", "note": "默认尺度待核对" }
    },
    {
      "id": "port_roof_draft",
      "name": "屋顶接口",
      "type": "port",
      "transform": { "position": [3600, 1500, 0], "rotation": 0 },
      "parameters": { "width": 180, "depth": 80 },
      "provenance": { "sourceId": "logicmodule_church", "featureId": "link_roof", "status": "estimated", "note": "朝向及高差待确认" }
    }
  ],
  "assumptions": ["示例默认尺寸，需根据实际参考修订；接口尚未完成空间对接。"]
}
```

这只是单区域/单外链的格式例子。实际结果须覆盖请求中的所有成员区域和跨模块链路；每个区域至少一个非 port 主体，每条外链恰好一个来源 port，内部链路不产生对外 port。每种积木类型对同一来源特征只有一个主要积木，辅助几何可不带 provenance。不得伪造来源或复用其他语义的已有积木 ID。

### 10.4 预览、采用与边界

`ModuleDraft` 顶层只允许上述字段；不接受夹带拓扑修改。用户可以导出请求给 agent，或按同一契约导入结果。当前待请求、结果错误、等待和重试状态如实显示，不模拟自动生成进度；确定性模板用 `source: "template"`，不能冒充 agent 返回。

校验通过才能预览/采用；采用前重验项目/模块身份、两指纹、块 Schema、来源、重复 ID、区域与端口覆盖，并验证替换后的完整项目。替换仅影响当前模块几何；资料、原拓扑和实例 Transform 保留。同源类型/特征保留旧 ID，移除的端口对应实际对接列入差异并清理。已有体块时先显示替换影响并明确确认；采用一次历史提交，取消零写入。

本轮不做隐式追加、任意局部几何自动合并、自动模型调用或全局重排。整体按拓扑自动匹配接口、完整跨层边界和更完整回改属于 C；当前显式实例位置/旋转、手动端口连接与 3D 沿用已有能力。
