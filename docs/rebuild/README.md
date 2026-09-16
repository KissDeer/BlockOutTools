# BlockOutTools 重做版需求索引

状态：`需求基线已确认 · 拓扑驱动搭建 A+B 实现同步`
更新日期：2026-09-16

本目录是 BlockOutTools 重做版的需求单一来源。重做开始后，产品范围、交互、数据结构、AI 和 UE 行为应首先在这里修改，再进入实现。

当前主流程依据用户确认的 [WORKFLOW_UX_PROPOSAL.md](WORKFLOW_UX_PROPOSAL.md)：**逻辑拓扑 ⇄ 拼接搭建**。分组在拓扑完成，形态在模块内部编辑中形成，上下文常驻；独立拆解/构型页不再是主流程。A+B 的实现与当前接口见交互规格和数据契约，自动整体对接等 C 批次仍为后续范围。文档中的 P0/P1 是需求优先级，不等于全部已实现或完成 UE/浏览器验收。

## 文档优先级

发生冲突时按以下顺序解释：

1. 本目录中经用户确认的重做版文档。
2. `config/ue-parametric-blocks.json` 中经过 UE 实测的 Blockout Tools Blueprint Schema。
3. 重做版自动测试和用户验收用例。
4. 当前本地工具的实现与保存数据。
5. `USER_MANUAL.md`、`docs/FEATURE_PARITY.md`、vendor 构建和外部网页。

第 5 类资料只是历史参考，不再构成“一比一复刻”的要求。

## 文档组成

- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)：产品目标、用户、核心工作流、范围和非目标。
- [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md)：按优先级拆分的可验收功能需求。
- [NON_FUNCTIONAL_REQUIREMENTS.md](NON_FUNCTIONAL_REQUIREMENTS.md)：性能、可靠性、安全、兼容和可维护性要求。
- [INTERACTION_SPEC.md](INTERACTION_SPEC.md)：无限画布、模块内部编辑、预览和快捷键交互。
- [DATA_UE_AI_CONTRACT.md](DATA_UE_AI_CONTRACT.md)：项目文件、稳定 ID、模块文件、AI 命令与 UE 增量同步契约。
- [REBUILD_PLAN.md](REBUILD_PLAN.md)：重做策略、技术边界、阶段和质量门槛。
- [REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md)：历次需求在重做版中的保留、调整、延期或移除结论。
- [WORKFLOW_UX_PROPOSAL.md](WORKFLOW_UX_PROPOSAL.md)：2026-09-16 确认的两工作面流程及 A/B/C 边界。
- [TWO_STAGE_ARCHITECTURE.md](TWO_STAGE_ARCHITECTURE.md)：当前实现摘要与历史递归架构/规划；历史五页流程不作为现行操作说明。

## 需求标记

- `P0`：完成一次可靠的“设计 -> 检查 -> UE 导入”闭环所必需。
- `P1`：显著提升真实白盒生产效率，P0 稳定后实现。
- `P2`：可选增强，不影响核心闭环。
- `Deferred`：方向成立，但当前信息或收益不足，不进入近期实现。
- `Removed`：不符合重做版定位，明确不重做。

## 变更规则

需求变化时必须同时更新相关条目、验收标准和追踪表。不得只在代码、聊天记录或旧手册中改变产品行为。重大数据契约变化必须提高 Schema 版本并提供迁移，不允许静默改变旧文件含义。

本轮保留 `schemaVersion: 2`，采用不改变旧字段含义的可选扩展：`designContext`、模块 `designBrief`、`shapeConfirmation`。旧 V2 文件由新版直接读取；这不是对旧程序保留新字段的承诺。新增字段的保存/重开回归随领域契约维护。
