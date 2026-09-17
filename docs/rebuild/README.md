# BlockOutTools 重做版需求索引

状态：`Draft 2 · 2026-09-17 · 范围已冻结`
取代：`2026-09-16 拓扑驱动搭建 A+B` 基线

本目录是需求单一来源。产品范围、交互、数据结构、AI 和 UE 行为应首先在这里修改，再进入实现。

## 现行基线

主流程是**五步**：

```
上传逻辑拓扑图 → 节点 → 节点里拼模型 → 3D 预览 → 导出 UE
```

节点是唯一的容器：内部要么是一份几何（叶子），要么是一张逻辑拓扑（复合）。
**"模块"这个词在产品里不存在。** 模块定义、模块实例、拆解页、构型页整体删除。

## 文档优先级

发生冲突时按以下顺序解释：

1. [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) 与 [NON_GOALS.md](NON_GOALS.md) —— **这两份同级，冲突时以 NON_GOALS 为准**
2. [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md)、[INTERACTION_SPEC.md](INTERACTION_SPEC.md)、[DATA_UE_AI_CONTRACT.md](DATA_UE_AI_CONTRACT.md)
3. `app-v2/src/domain/block-library/` 中经 UE 实测的参数化积木定义
4. 自动测试与浏览器验收用例
5. 当前实现与已保存数据

## 文档组成

**现行**

- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)：产品定义、主流程、成功标准、核心概念口径、原则。
- [NON_GOALS.md](NON_GOALS.md)：明确不做的事，含每条"重新评估的条件"。**与产品需求同级。**
- [FUNCTIONAL_REQUIREMENTS.md](FUNCTIONAL_REQUIREMENTS.md)：P0 八条 + 后续范围，含旧 FR 的处置对照表。
- [REBUILD_PLAN.md](REBUILD_PLAN.md)：技术边界、目录边界、按节点模型重排的实施阶段、质量门槛。
- [NON_FUNCTIONAL_REQUIREMENTS.md](NON_FUNCTIONAL_REQUIREMENTS.md)：性能、可靠性、安全、兼容和可维护性。

**部分过时，改动前先对照 NON_GOALS**

- [INTERACTION_SPEC.md](INTERACTION_SPEC.md)：第 1 节仍写"两个一级工作面"，已被 09-17 决定取代（单画布 + 层级导航）。
- [DATA_UE_AI_CONTRACT.md](DATA_UE_AI_CONTRACT.md)：第 1、3、6 节按模块定义/实例写；第 10 节的草案契约锚点是模块。
- [REQUIREMENT_TRACEABILITY.md](REQUIREMENT_TRACEABILITY.md)：已加取代标注，历史结论保留供追溯。

**历史记录，不作为现行操作说明**

- [WORKFLOW_UX_PROPOSAL.md](WORKFLOW_UX_PROPOSAL.md)：2026-09-16 的 A/B/C 批次方案。A+B 实现的是"模块化搭建"，已被取代。
- [TWO_STAGE_ARCHITECTURE.md](TWO_STAGE_ARCHITECTURE.md)：两阶段架构与递归 Scope 提案。递归嵌套的思想仍在用，模块定义/实例的实现路径已废。
- [DIAGRAM_INPUT.md](DIAGRAM_INPUT.md)、[UE_PARAMETRIC_BLOCKS_CONTRACT.md](UE_PARAMETRIC_BLOCKS_CONTRACT.md)

> **待办**：上列"部分过时"的文档尚未逐份改写。范围冻结之后应作为独立一步处理，不要在改产品的同一回合里顺手改。

## 需求标记

- `P0`：完成一次可靠的"设计 → 检查 → UE 导入"闭环所必需。
- `P1`：显著提升真实白盒生产效率，P0 稳定后实现。
- `P2`：可选增强，不影响核心闭环。
- `Deferred`：方向成立，但当前信息或收益不足。
- `Removed`：不符合重做版定位，明确不重做。**具体条目见 [NON_GOALS.md](NON_GOALS.md)。**

## 变更规则

需求变化时必须同时更新相关条目、验收标准和追踪表。不得只在代码、聊天记录或旧手册中改变产品行为。

**把某件事从 NON_GOALS 拉回范围时，必须先改 NON_GOALS 并写明重新评估的条件。**

重大数据契约变化必须提供迁移，不允许静默改变旧文件含义。当前保留 `schemaVersion: 2`，采用不改变旧字段含义的可选扩展。
