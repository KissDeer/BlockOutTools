# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第三次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | **需求文档回正：范围冻结为五步主流程 + 新建 `NON_GOALS.md`** | 本次 |
| 09-17 | 全项目扫描（只读）：查出主流程在界面上没有入口 | 本次 |
| 09-17 | 删掉退役的构型领域件 + 模块→实例生成器（S2-1 过半） | `dbcd0e6` |
| 09-17 | 工作记录机制建立 | `edeaddd` |
| 09-17 | 删掉 4 个退役面板（拆解/构型的 Board 与 Inspector） | `25e3b8e` |
| 09-17 | 一张画布 + 层级导航：取消两个顶层页签，进入节点 = 换焦点 | `639a8ea` |
| 09-17 | 左侧栏合并：层级树成为区域清单的唯一出口 | `c2c4404` |

## 接下来干什么

**范围已冻结。现行需求只看这三份，别的别读：**

- `docs/rebuild/PRODUCT_REQUIREMENTS.md`（Draft 2）
- `docs/rebuild/NON_GOALS.md`（明确不做，与上面同级）
- `docs/rebuild/FUNCTIONAL_REQUIREMENTS.md`（Draft 2，P0 八条）

**主流程是五步：上传逻辑拓扑图 → 节点 → 节点里拼模型 → 3D 预览 → 导出 UE。没有"模块"这一步。**

### 交付顺序（已定，别改顺序）

核心约束：**先把主流程在节点模型上跑通，再删模块层。** 反过来做就会重演前两次回退。

- [x] **1-A** 范围冻结（本次完成）
- [ ] **1-B** `LogicNode` 加 `blocks` / `childScopeId`；`childScopeId` 从 `LogicModule` 移过来
      —— 从调用方最多的文件倒着改：`concept-commands` → `workflow-context` → store → 显示层 → 最后 `concept.ts`
- [ ] **1-C** **3D 预览 + UE 导出改吃展平节点几何** ← **最优先的一刀**
      `PreviewPanel.tsx:59-61` 与 `ue-plan.ts:41-50` 现在都从 `resolveAssembly(instances)` 出发。改完，"删模块就白屏"的绑定永久解除
- [ ] **1-D** 识别入口接上（FR-02）
- [ ] **1-E** 节点嵌套导航打磨
- [ ] **1-F** 模块层才删

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**184 通过 / 24 文件**
- 工作树：见提交后同步
- 本轮**没有动任何代码**

## 别忘的坑

- **主流程在界面上没有入口**：`setConceptPane` 全仓库无调用者，`ConceptInputsBoard`（上传拓扑图）和 `ConceptRecognitionBoard`（识别候选）打不开。1-D 就是接线这件事，零件是齐的。
- **3D 预览与 UE 导出挂在模块实例上**，不是挂在节点上。这是"改不动"的结构性原因，不是手艺问题。1-C 就是解这一个扣。
- **不要在"删死代码"上顺手删领域件**。`DecompositionCanvas` 还在用 `concept-decomposition` 的领域件，删之前查全仓库。
- **不要在一个回合里既删功能又换模型**。前两次回退都是这么来的。
- **改文件前先停 dev server**，Vite 监听会锁文件（EBUSY）。
- 新增领域文件要加进 `app-v2/tsconfig.node.json` 的 `include`，否则报 TS6307。
- 用 .NET `File.ReadAllLines`/`WriteAllLines` 做批量行列编辑（`Set-Content -Encoding UTF8` 会毁掉中文）。
- **过时文档已加横幅但没改写**：`INTERACTION_SPEC.md` 第 1 节、`DATA_UE_AI_CONTRACT.md` 多节、`TWO_STAGE_ARCHITECTURE.md` 全文、`WORKFLOW_UX_PROPOSAL.md` 全文。读到它们以横幅和 `NON_GOALS.md` 为准。改写是独立一步，别和改产品混在一起。

## 还没做但量到的问题（等主流程跑通再管）

- 参考图以 base64 存在项目 JSON 里，每次编辑防抖 350ms 序列化整份项目进 localStorage。图一多必卡。
- `scripts/export-ue-actors.mjs` 与 `ue-plan.ts` 各有一套连接求解，靠注释约定一致，没有测试锁住。
- `ConceptPane` 类型里还留着已删页签的幽灵值 `"decomposition" | "configuration"`。
