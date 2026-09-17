# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第七次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | **1-F 落地：模块层删干净了** —— 项目里不再有"模块"这个概念 | 见下 |
| 09-17 | 识别入口接上（随后用户叫停整条识图路线） | `f73a6bd` |
| 09-17 | 1-C 落地：3D 预览 + UE 导出改吃展平节点几何 | `65d965f` |
| 09-17 | 节点同时装几何 + 子逻辑；进复合节点分屏 | `a0a308b` |
| 09-17 | **1-B 落地**：`LogicNode` 拿到 `blocks` / `childScopeId` | `c496d18` |
| 09-17 | 需求文档回正：五步主流程 + 新建 `NON_GOALS.md` | `89ecd3a` |
| 09-17 | 删掉退役的构型领域件 + 模块→实例生成器 | `dbcd0e6` |
| 09-17 | 工作记录机制建立 | `edeaddd` |
| 09-17 | 删掉 4 个退役面板 | `25e3b8e` |
| 09-17 | 一张画布 + 层级导航 | `639a8ea` |
| 09-17 | 左侧栏合并：层级树成为区域清单的唯一出口 | `c2c4404` |

## 接下来干什么

**Phase 1 全部做完了：1-A 到 1-F。主流程五步在界面上都走得到，模块层不复存在。**

现行需求只看这三份，别的别读：

- `docs/rebuild/PRODUCT_REQUIREMENTS.md`（Draft 2）
- `docs/rebuild/NON_GOALS.md`（明确不做，与上面同级）
- `docs/rebuild/FUNCTIONAL_REQUIREMENTS.md`（Draft 2）

### 下一步的候选（没有既定顺序，看用户定）

1. **修 `scripts/` 里 4 个还在按旧模型工作的脚本**（`export-ue-actors.mjs`、`validate-blockout.mjs`、
   `generate-diagram-project.mjs`、`build-elysian-rebuild.mjs`）。**在修之前不要信任它们的输出** ——
   它们手写了一套模块/实例模型，有的连应用代码都不 import。改它们要从"节点几何"重新推一遍。
2. **识图（FR-02）换路线**。原路线（本地 agent 读图）已被用户放弃：太绕。
   新路线未定。**候选那一半可以复用**（候选模型、校验、图上叠加、逐条勾选、按指纹拒绝沿用）。
3. **P1 项**：底图跟着层级走（现在节点没有底图能力，随 `ReferenceTools` 一起删了）；
   `role-templates.ts` 也一起删了 —— 它是一个"按节点角色快速起稿"的确定性规则，
   要做就在节点上重做。
4. **拿一张真图从第二步开始搭一遍**，用起来找问题（五步都能走，但还没这样用过）。

### 开工前的三个坑（这次实测过）

- **`layouts/` 里 7 个旧项目现在读不出来**，`projectSchema` 会拒绝（它们没有 `concept`，全是模块+实例）。
  这是 1-F 的有意取舍，见 `design-log/2026-09-17-删掉模块层.md`。
- **dev server 开着时不要用文件工具改 `app-v2/src`**：原子写产生的临时文件会让 Vite 的 watcher
  直接 EBUSY 崩掉。改代码前先停服务（实测崩过三次）。
- **不要用 PowerShell 的 `.Replace()` 批量改标识符**：参数被当正则，`'c'` 会把文件里所有小写 c
  删掉（这次毁了一个文件，靠 git 恢复）。批量改名用文件工具，或先确认参数不含正则元字符。

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**113 通过 / 13 文件**（比删之前少 88 个 —— 那些锁的都是模块层行为，随模块层一起删了；
  子代理为 `validation` 与 `demo-project` 补了 13 个新测试，因为它们的旧覆盖随文件一起消失）
- 浏览器实测（删完之后）：根层 4 节点 / 4 链路、**0 个分组框**；进节点是分屏且检查器给出
  区域属性/内部/落位与朝向；3D 渲染出 32 个几何（有像素，不是空画布）；
  UE 计划 10 个 Actor、0 未落位，同步键是 `projectId/节点id/blockId`；**控制台 0 错误**

## 这次新查出来的东西（下次别再踩）

- **"没有面板引用 ≠ 没人引用"第三次生效**：`features/module-editor/` 整个目录看着是模块件，
  其实 `ModuleEditor` 是**节点几何编辑器**，一起删会把主流程弄断。同类的还有
  `module-preview-model`/`module-plan-blocks`（节点缩略图地基）、`project-merge`（通用三方合并）、
  `disk-baseline`。**删目录之前先看里面每个文件到底服务谁。**
- **批量操作的撤销粒度容易在重构里悄悄丢**：`editDecomposition` 同时管排版与归属，
  归属删了之后整个函数消失，多选拖动就变成"一个节点一条历史"。现在有 `moveNodes` 兜着。
- **3D 预览的"可选区域"要按摆放去重，不是按积木**：按积木列会让一个节点出现 N 次同名项，
  还触发 React 重复 key（这次是 30 条控制台错误）。
- **`LevelTree` 现在直接调 `nodeInterior`**，不再经过 `module-workflow` 的 `nodeInteriorPlan`。
- **`childScopeIdOf` 现在只剩一行**（读节点自己的字段），旧的 `LogicModule.childScopeId` 回落已删。

## 还没做但量到的问题

- 参考图以 base64 存在项目 JSON 里，每次编辑防抖 350ms 序列化整份项目进 localStorage。图一多必卡。
- `scripts/` 下 4 个脚本仍按旧模型工作（见上）。
- `ConceptPane` 类型里还留着已删页签的幽灵值 `"decomposition" | "configuration"`。
- **过时文档已加横幅但没改写**：`INTERACTION_SPEC.md` 第 1 节、`DATA_UE_AI_CONTRACT.md` 多节、
  `TWO_STAGE_ARCHITECTURE.md` 全文、`WORKFLOW_UX_PROPOSAL.md` 全文。读到它们以横幅和 `NON_GOALS.md` 为准。
- **CSS 里可能还有 `.module-*` 之类的死类名**（这次只清了 `decomposition-canvas.css` 与
  孤儿 `decomposition-panels.css`，其余没审）。
