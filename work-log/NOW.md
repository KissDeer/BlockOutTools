# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第八次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | **收尾：旧模型脚本清完、死 CSS 清完、README 重写、旧项目拒绝门装上** | 见下 |
| 09-17 | **1-F 落地：模块层删干净了** —— 项目里不再有"模块"这个概念 | `965ffb0` |
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

**Phase 1 全部做完了：1-A 到 1-F。主流程四步在界面上都走得到，模块层不复存在，旧模型脚本与死代码清完了。**

现行需求只看这三份，别的别读：

- `docs/rebuild/PRODUCT_REQUIREMENTS.md`（Draft 3）
- `docs/rebuild/NON_GOALS.md`（明确不做，与上面同级）
- `docs/rebuild/FUNCTIONAL_REQUIREMENTS.md`（Draft 3）

### 下一步的候选（没有既定顺序，看用户定）

1. **拿一张真图从第一步开始搭一遍**，用起来找问题。四步都走得到，但**还没有任何真实项目跑过这个工具**
   （`data/projects-v2/` 在本轮之前一直是空的 —— 连"保存到磁盘"都没人用过）。
2. **P1：参考图跟着层级走**（FR-10）。节点现在没有底图能力，随 `ReferenceTools` 一起删了；
   `referenceSchema` 还留在 `project-schema.ts` 里，是当时预留的口径。`role-templates.ts` 也一起删了。
3. **P1：旧项目迁移**（Phase 3）。`layouts/` 7 个 + `data/levels/` 3 个用户文件都还在，
   现在任何入口都读不进来（有意为之）。写迁移器时 `assertNotLegacyProject` 就是入口。
4. **P1：规范检查定位到节点与节点内积木**（Phase 2 其余部分）。

### 开工前的坑（这次实测过）

- **dev server 开着时不要用文件工具改 `app-v2/src`**：原子写产生的临时文件会让 Vite 的 watcher
  直接 EBUSY 崩掉。改代码前先停服务（实测崩过三次）。
- **不要用 PowerShell 的 `.Replace()` 批量改标识符**：参数被当正则，`'c'` 会把文件里所有小写 c
  删掉（毁过一个文件，靠 git 恢复）。批量改名用文件工具。
- **改完 schema 一定要真跑一遍 CLI 或界面**。`concept` 从 `.optional()` 改成必填之前，
  注释里已经写着"旧项目会被挡下"——**写着但没做**，代价是有人拿旧文件导出，把已提交的
  104 个 Actor 覆盖成空数组（见下）。
- **`.domain-verify/` 那类构建产物会替已删代码续命**：`npm run verify:level` 之所以"能跑"，
  只因为目录里躺着 `assembly-resolver.js` 的旧编译产物。CLI 现在编到系统临时目录，用完就删。

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**108 通过 / 13 文件**（新增 `persistence.test.ts` 6 条，锁的是"旧格式必须被拒绝"）
- 浏览器实测（本轮，`1280x720` 级别桌面视口）：
  - 冷启动是 `仅存浏览器草稿` → 点「保存到磁盘」→ `data/projects-v2/project-<摘要>/project.blockout.json` 写出 15140 字节，
    顶栏转 `已保存到磁盘`
  - **刷新后自动恢复**（"已恢复上次磁盘项目"）—— 空库时看不到的那条路
  - 导入旧项目（`sunken-sanctum.blockout.json`）→ 弹窗给出人话原因，**当前项目没被动**（仍 4 区域 / 4 链路）
  - 3D 预览渲染出楼板/墙/楼梯/门洞/端口方向（canvas 995×534 有实体像素），状态栏 `3D 已同步`
  - UE 计划 10 个 Actor、0 未落位、同步键 `project_demo_highwall/lnode_demo_tower/lnode_demo_tower_top/block_demo_tower_rail`（两级嵌套）
  - **控制台 0 错误 0 警告**
- 命令行实测：`scripts/export-ue-actors.mjs` 对同一份几何也报 **10 actors**（与界面一致）；
  两个旧格式家族都 `exit 1` + 同一句人话，**没有覆盖任何产物**
- `layouts/ue-plan/sunken-sanctum.blockout.actors.json` 仍是 **104 个 Actor**（被误覆盖后已还原）

## 这次新查出来的东西（下次别再踩）

- **`optional()` 与"被挡下"是两件事。** `concept: logicTopologySchema.optional()` 让旧项目通过校验，
  读出来是"一个区域都没有"的合法项目 —— 导 0 个 Actor 并**成功退出**。现在必填，
  旧格式由 `assertNotLegacyProject` 在 schema 之前给中文原因。见 `design-log/2026-09-17-旧项目读不出来.md`。
- **判据要按实际文件写。** 第一版旧格式判据只认 `structureGraph` / `shapes`，而 `shapes` 在仓库里
  **没有任何真文件走得到**（不在顶层），`souls-starter-floor-wall.blockout.json` 只带 `modules/instances/connections`，
  两道门都漏。**没有真文件覆盖的判据不算数。**
- **过时文档会骗人**：README 整篇在讲模块、拆解、AI 初始化参考、图纸底图 —— `diagram-import`、
  `interpretDiagram`、`ReferenceTools`、`图纸底图`、`模块隔离` 在 `src/` 里全是 0 命中。已重写。
- **`data/levels/` 与 `layouts/` 是两种不同的旧格式**：前者是更早的 LayoutTools 画布（`structureGraph` + `shapes` 顶层无），
  后者大部分是模块层模型。`data/levels/.library-state.json` / `autosave.json` 是旧工具的状态文件。
- `App.tsx` 的注释里那句"曾经还有第三格识别候选"是**有意保留的历史说明**，不是漏改。

## 还没做但量到的问题

- 参考图以 base64 存在项目 JSON 里，每次编辑防抖 350ms 序列化整份项目进 localStorage。图一多必卡。
- **过时文档已加横幅但没改全文**：`INTERACTION_SPEC.md`、`DATA_UE_AI_CONTRACT.md`、
  `TWO_STAGE_ARCHITECTURE.md`、`WORKFLOW_UX_PROPOSAL.md`、`REQUIREMENT_TRACEABILITY.md`；
  另有 `docs/skills/souls-level-builder/SKILL.md`、`docs/UE_IMPORT_GUIDE.md`、
  `skills/layout-tools-workflow/references/*` 仍指向**已删除的脚本**。读到它们以横幅和 `NON_GOALS.md` 为准。
- 模块时代遗留的类名/字段名仍在用，只是名字不准：`.module-reference-sidebar`、`.module-editor`、
  `.module-plan-preview`（CSS 与 `NodeEditor.tsx`）、`LogicNode.moduleId`（**无读取方**，
  留着因为已写进磁盘与草稿，删它要迁移）。改名要动 `App.tsx`，没做。
- `ConceptInputsBoard.tsx` 的「先看差异」按钮实际只是回到材料总览，**不显示差异**。产品决策，没动。
- 还没测过三层以上嵌套，也没量过性能。
