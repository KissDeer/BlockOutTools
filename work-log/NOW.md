# 现在到哪儿了

> 每次开工先读这一页。每次收工前更新它。
> 设计决策与理由在 `design-log/`，这里只记进度。

**更新：2026-09-17（第六次）**

---

## 上次做到哪

| 日期 | 做了什么 | 提交 |
|---|---|---|
| 09-17 | 修：进叶子节点自动选中，检查器才给得出它的落位 | `a16a523` |
| 09-17 | 1-D 落地：识别入口接上，主流程五步全部走得到（**用户随后叫停 1-D**） | `f73a6bd` |
| 09-17 | 1-C 落地：3D 预览 + UE 导出改吃展平节点几何（承重墙换完） | `65d965f` |
| 09-17 | 节点同时装几何 + 子逻辑；进复合节点分屏（左逻辑 / 右拼接） | `a0a308b` |
| 09-17 | **1-B 落地**：`LogicNode` 拿到 `blocks` / `childScopeId`，唯一裁决点在 `concept-scopes.ts` | `c496d18` |
| 09-17 | 需求文档回正：范围冻结为五步主流程 + 新建 `NON_GOALS.md` | `89ecd3a` |
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
- [x] **1-C** 3D 预览 + UE 导出改吃展平节点几何 —— "删模块就白屏"的绑定解除
- [x] **1-D** 识别入口接上（FR-02）—— 工作面入口栏
- [x] **1-E** 节点嵌套：接上"加一层子区域"的入口 + 进复合节点分屏
- [x] **1-F** 模块层才删 ← **下一步。用户已确认 1-D 先不做，本轮到此为止**

### 这一轮（用户叫停时）停在哪儿

用户看了主流程之后说"**1-D就先不做了**"，所以**没有继续往下做任何新功能**。
停手前把两件事收尾了：

- `a16a523` 修掉一个实测发现的小毛病：进叶子节点不自动选中它，导致右侧检查器显示的是
  "这一层的逻辑"概览，**人没法在里面给这个区域填落位** —— 而落位正是 3D 与 UE 认的位置。
  现在进叶子节点顺手选中它；复合节点不这么做（那一层还有别的区域要选）。
- 工作台已清空、类型干净、测试全绿。

**没有做完的验证**：修完之后在浏览器里走到"选中区域 → 看到落位字段"这一步就停了，
后面"填落位 → 拼积木 → 刷新 3D → UE 计划"这一串**这次没有重跑**。
下次开工如果要碰这条链，先补跑一遍。

### 1-F 开工前必须知道的事

**现在模块层已经没有承重了**，所以它是"隔墙"而不是"承重墙"——这正是前两次回退想达到的状态。

- `node-geometry.ts` 里有一条**实例回落**（整张图一个节点几何都没有时才走旧实例）。
  1-F 要把它一起删掉，`layouts/` 里那 7 个旧项目就退化为只读。
- `LogicModule` 现在只剩"画个框"：`childScopeId` 移走了、`moduleDefinitionId` 将随模块层消失。
  但 **`DecompositionCanvas` 还在用它画分组框**，删之前查全仓库。
- 要删的清单：`LogicModule` / `ModuleDefinition` / `ModuleInstance` / `Connection` /
  `assembly-resolver` / `AssemblyCanvas` / `InstanceInspector` / `ConnectionInspector` /
  `ModuleEditor` 的旧模块分支 / `module-workflow` 的实例路径。
- `resolveAssembly` 目前还给 3D 面板数端口残差，删的时候要一起处理这个检查。

## 当前状态

- 类型：干净（`npx tsc -b` 0 错误）
- 测试：**201 通过 / 25 文件**
- **主流程五步在界面上全部走得到**（上传图 → 节点 → 拼模型 → 3D → UE）
- 浏览器实测：上传 1265×805 图 → 同步落盘（合法 PNG）→ 拉候选（3 区域 / 2 链路 / 4 警告）
  → 排除一条 → 采用 → 节点带角色与标高进画布；指纹不符时**拒绝采用**并说明原因
- dev server 已停（用户叫停，没有留着跑）

## 这次新查出来的东西（下次别再踩）

- **"有零件、没入口"这个毛病出现了两次**：`expandLogicModule`（上午）与 `setConceptPane`（本次）
  都是全仓库无调用者。删/加面板之后，**顺手 grep 一下它的入口有没有调用者**。
  这两次都只靠浏览器实测发现，没有自动测试兜住（当前测试环境是 node，没有 jsdom）。
- **作用域池里每个作用域都自带一份 `scopes` 副本**。凡是"遍历所有作用域找某个东西"的地方都必须走 `scopesOf()`
  去重，直接写 `[topology, ...topology.scopes]` 会摸到过期副本 —— 展开操作曾经因此看起来"没生效"。
- **`collectScopeIssues` 建归属表时从来不走根层**（环检测只从子作用域出发），所以根层节点拥有的子作用域
  会被误报成"悬空"。
- **`DecompositionCanvas` 不是死代码**：`ConceptCanvas` 就是渲染它的，双击进入节点的入口一直在那儿。
  差点误删。
- **`PlacedBlock.position` 的 Z 是底面标高，XY 是中心**。`blockBaseZ` 已经含了积木自己的 Z，
  消费者**不要**再叠加一次（这个坑实际踩到了，Z 被算了两次）。
- **dev server 开着的时候不要用文件工具改 `app-v2/src`**：原子写会产生临时文件，Vite 的 watcher 撞上
  会直接 EBUSY 崩掉（实测崩过两次）。改代码前先停服务。
- **`data/concept/inputs/` 是暂存区**，每次同步整目录重建，不是用户数据，不用管它的内容。
- **`layouts/krat-station-draft.png` 是 `data/concept/sample-candidate.json` 依据的那张图**，
  想复现识别流程就用它，不然候选的 digest 对不上、会被指纹守卫拒绝。

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
- **预览面板与层级变更**：现在换层只把预览标记为过期，不自动刷新（符合"只有显式点击才重建场景"）。
  如果实际用起来觉得别扭，再考虑自动跟随。
