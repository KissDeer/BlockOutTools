# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第四次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | **节点同时装几何 + 子逻辑；进复合节点分屏（左逻辑 / 右拼接）** —— 本次 | 见下 |
| 09-17 | **1-B 落地**：`LogicNode` 拿到 `blocks` / `childScopeId`，唯一裁决点在 `concept-scopes.ts` | 见下 |
| 09-17 | 需求文档回正：范围冻结为五步主流程 + 新建 `NON_GOALS.md` | `89ecd3a` |
| 09-17 | 全项目扫描（只读）：查出主流程在界面上没有入口 | `89ecd3a` |
| 09-17 | 删掉退役的构型领域件 + 模块→实例生成器（S2-1 过半） | `dbcd0e6` |
| 09-17 | 工作记录机制建立 | `edeaddd` |
| 09-17 | 删掉 4 个退役面板（拆解/构型的 Board 与 Inspector） | `25e3b8e` |
| 09-17 | 一张画布 + 层级导航：取消两个顶层页签，进入节点 = 换焦点 | `639a8ea` |
| 09-17 | 左侧栏合并：层级树成为区域清单的唯一出口 | `c2c4404` |

## 接下来干什么

**范围已冻结。现行需求只看这三份，别的别读：**

- `docs/rebuild/PRODUCT_REQUIREMENTS.md`（Draft 2，§4.1 是本次新增的"一个节点装两样东西"）
- `docs/rebuild/NON_GOALS.md`（明确不做，与上面同级）
- `docs/rebuild/FUNCTIONAL_REQUIREMENTS.md`（Draft 2，P0 八条）

**主流程是五步：上传逻辑拓扑图 → 节点 → 节点里拼模型 → 3D 预览 → 导出 UE。没有"模块"这一步。**

### 交付顺序（已定，别改顺序）

核心约束：**先把主流程在节点模型上跑通，再删模块层。** 反过来做就会重演前两次回退。

- [x] **1-A** 范围冻结
- [x] **1-B** `LogicNode` 加 `blocks` / `childScopeId`，两者可并存；读取收敛到唯一裁决点
- [ ] **1-C** **3D 预览 + UE 导出改吃展平节点几何** ← **最优先的一刀**，下一步就做这个
- [ ] **1-D** 识别入口接上（FR-02）
- [x] **1-E** 节点嵌套：接上"加一层子区域"的入口 + **进复合节点分屏**（本次完成）
- [ ] **1-F** 模块层才删

### 1-C 开工前必须知道的两件事

1. `PreviewPanel.tsx:59` 与 `ue-plan.ts:39` 现在仍从 `resolveAssembly(instances)` 出发。
   要改成从**递归展平的节点几何**取：`world = Σ(路径上每一级 node.relativePosition) + block.transform.position`。
   现在已经有可以直接用的地基：`flattenModules()` 返回的 `origin` 就是"节点原点在根坐标系里的位置"。
2. **`relativePosition` 还没有编辑入口**。它现在被检查器标注为"仅供旧资料追溯"。
   在给它一个真正的落位编辑入口之前，展平出来的几何会全部叠在原点 —— 看起来像 bug，实际是入口缺失。
   这一刀应该是 1-C 的第一步。

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**190 通过 / 24 文件**（本次 +6：新增节点级几何、共享作用域收紧、分屏相关）
- 浏览器实测：分屏 50/50 起，拖动分隔条 50 → 63，右侧画布跟着重测（346 → 256），控制台 0 错误
- 几何确实落在 `concept.nodes[].blocks` 上，`modules` 里的旧数据没被动

## 这次新查出来的东西（下次别再踩）

- **作用域池里每个作用域都自带一份 `scopes` 副本**。凡是"遍历所有作用域找某个东西"的地方都必须走 `scopesOf()`
  去重，直接写 `[topology, ...topology.scopes]` 会摸到过期副本 —— 展开操作曾经因此看起来"没生效"。
- **`collectScopeIssues` 建归属表时从来不走根层**（环检测只从子作用域出发），所以根层节点拥有的子作用域
  会被误报成"悬空"。
- **`DecompositionCanvas` 不是死代码**：`ConceptCanvas` 就是渲染它的，双击进入节点的入口一直在那儿。
  差点误删。
- **dev server 开着的时候不要用文件工具改 `app-v2/src`**：原子写会产生临时文件，Vite 的 watcher 撞上
  会直接 EBUSY 崩掉（本次实测崩了一次）。改代码前先停服务。

## 别忘的坑

- **不要在"删死代码"上顺手删领域件**。删之前查全仓库（`DecompositionCanvas` 那次教训）。
- **不要在一个回合里既删功能又换模型**。前两次回退都是这么来的。
- 新增领域文件要加进 `app-v2/tsconfig.node.json` 的 `include`，否则报 TS6307。
- 用 .NET `File.ReadAllLines`/`WriteAllLines` 做批量行列编辑（`Set-Content -Encoding UTF8` 会毁掉中文）。
- **过时文档已加横幅但没改写**：`INTERACTION_SPEC.md` 第 1 节、`DATA_UE_AI_CONTRACT.md` 多节、
  `TWO_STAGE_ARCHITECTURE.md` 全文、`WORKFLOW_UX_PROPOSAL.md` 全文。读到它们以横幅和 `NON_GOALS.md` 为准。

## 还没做但量到的问题（等主流程跑通再管）

- 参考图以 base64 存在项目 JSON 里，每次编辑防抖 350ms 序列化整份项目进 localStorage。图一多必卡。
- `scripts/export-ue-actors.mjs` 与 `ue-plan.ts` 各有一套连接求解，靠注释约定一致，没有测试锁住。
- `ConceptPane` 类型里还留着已删页签的幽灵值 `"decomposition" | "configuration"`。
- **节点几何还缺底图**：底图/解释文件目前只挂在 `ModuleDefinition` 上，节点这条路没有（属 P1 的 FR-10）。
- **`LogicModule` 现在只剩"画个框"**：`childScopeId` 移走、`moduleDefinitionId` 随模块层消失之后，
  它就是个纯视觉分组。1-F 可以一起清掉。
