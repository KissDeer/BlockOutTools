import { create } from "zustand";
import { addNodeBlock, removeNodeBlocks, renameProject, setConcept, updateNodeBlock, updateProjectSettings } from "../domain/commands";
import {
  addInput as addInputCommand, addLogicKey, addLogicLink, addLogicNode, applyCandidate as applyCandidateCommand,
  autoLayoutTopology, nextNodePosition, recordProposal as recordProposalCommand, removeInput as removeInputCommand,
  removeLogicKey, removeLogicLink, removeLogicNode, setStartNode, updateInput as updateInputCommand, updateLogicKey,
  updateLogicLink, updateLogicNode, moveNodes, type InputDraft,
} from "../domain/concept-commands";
import { pruneCandidate, type CandidateNode, type RecognitionCandidate } from "../domain/concept-candidate";
import { createEmptyTopology } from "../domain/concept";
import { collapseNodeScope as collapseNodeScopeCommand, childScopeIdOf, expandNodeScope as expandNodeScopeCommand, levelPathOfNode, resolveLevel, scopeView, scopesOf, writeScopeView, type ResolvedLevel } from "../domain/concept-scopes";
import { createEmptyInputs, type LogicInputItem } from "../domain/concept-inputs";
import type { LogicKey, LogicKind, LogicLink, LogicNode, LogicTopology } from "../domain/concept";
import { createDemoProject } from "../domain/demo-project";
import { createId } from "../domain/ids";
import { loadDraft, saveDraft } from "../domain/persistence";
import { flattenProjectGeometry } from "../domain/node-geometry";
import type { Block, BlockoutProject, BlockType, Vec2 } from "../domain/types";

/**
 * 几何编辑器要编辑的那份几何：**永远是某个节点自己的**。
 *
 * 模块层删除之后这里没有第二种可能 —— 节点是唯一的容器，
 * 它的积木坐标就是节点局部厘米。
 */
export interface EditableGeometry {
  id: string;
  name: string;
  blocks: Block[];
}

/** 现在只剩一个工作面：一张画布上的逻辑拓扑（输入与识别各自是一块辅助面板） */
export type ConceptPane = "topology" | "inputs" | "recognition";
export type TransformMode = "move" | "rotate" | "scale";
export type SaveStatus = "saved" | "saving" | "error";

interface ProjectStore {
  project: BlockoutProject;
  /**
   * 当前层级：一张画布上的焦点路径（节点 id 链）。[] = 整图。
   * 层级不另存"我在逻辑层还是几何层"——那由拓扑推导（见 `resolveLevel`），
   * 拓扑一变，层级自己跟上。
   */
  levelPath: string[];
  /** 跳到指定层级（面包屑、层级树、双击节点都走它） */
  setLevelPath: (path: string[]) => void;
  /** 退回上一层 */
  returnFromModule: () => void;
  /** 查看整体 = 回到根层 */
  showAssembly: () => void;
  /** 进入一个节点的内部（层级树、检查器都走它） */
  enterNode: (nodeId: string) => void;
  /**
   * 正在编辑内部几何的那个**节点**。
   *
   * 节点可以同时有子逻辑和自己的几何，所以"我在哪个节点的几何里"独立于层级路径：
   * 进复合节点后层级跳到它的子层，但几何编辑的仍是这个节点自己 —— 两边是同一个坐标系。
   */
  activeNodeId: string | null;
  /** 分屏比例：左（逻辑图）占的宽度比例，进复合节点时用它 */
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  /**
   * 当前节点的积木、名字与几何对象。
   *
   * 由 store 在每次提交与切换层级时算好，**不是** `get()` 现算——现算不会触发重渲染，
   * 几何编辑器与检查器就看不到改动。放在 store 里只有一个写入口，也就不会漂移。
   */
  currentBlocks: Block[];
  currentGeometryName: string;
  currentGeometry: EditableGeometry | null;
  selectedBlockIds: string[];
  selectedLogicNodeId: string | null;
  selectedLogicLinkId: string | null;
  selectedInputId: string | null;
  conceptPane: ConceptPane;
  setConceptPane: (pane: ConceptPane) => void;
  /** 识别候选：只存在于会话内，不写进项目文件 */
  candidate: RecognitionCandidate | null;
  selectedCandidateNodeId: string | null;
  /** 人工从候选里排除的条目（tempId）；排除节点会连带排除挂它的链路 */
  candidateExcluded: string[];
  setCandidate: (candidate: RecognitionCandidate | null) => void;
  setSelectedCandidateNode: (tempId: string | null) => void;
  updateCandidateNode: (tempId: string, patch: Partial<CandidateNode>) => void;
  toggleCandidateItem: (tempId: string) => void;
  applyRecognitionCandidate: () => void;
  /** 当前编辑的作用域（null = 根）。所有拓扑命令都作用在它上面 */
  conceptScopeId: string | null;
  setConceptScope: (scopeId: string | null) => void;
  expandSubLevel: (nodeId: string, scopeName?: string) => void;
  collapseSubLevel: (nodeId: string) => void;
  /** 给一个节点建子逻辑层：这一层从"只有几何"变成"几何 + 子区域" */
  addNodeSubLevel: (nodeId: string, scopeName?: string) => void;
  transformMode: TransformMode;
  logicKind: LogicKind;
  setLogicKind: (kind: LogicKind) => void;
  previewOpen: boolean;
  previewDirty: boolean;
  previewRevision: number;
  /**
   * 刷新那一刻展开的几何，供预览按区域过滤。
   * 不存整份项目 —— 几何由 `flattenProjectGeometry` 现算，这里只是快照。
   */
  previewScope: { id: string; name: string }[];
  saveStatus: SaveStatus;
  past: BlockoutProject[];
  future: BlockoutProject[];
  blockClipboard: Block[];
  setSelectedBlocks: (blockIds: string[]) => void;
  setSelectedLogicNode: (nodeId: string | null) => void;
  setSelectedLogicLink: (linkId: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  togglePreview: () => void;
  refreshPreview: () => void;
  renameProject: (name: string) => void;
  addBlock: (type: BlockType, position?: [number, number, number]) => void;
  updateBlock: (block: Block) => void;
  deleteSelectedBlocks: () => void;
  copySelectedBlocks: () => void;
  pasteBlocks: () => void;
  duplicateSelectedBlocks: () => void;
  updateSettings: (patch: Partial<Pick<BlockoutProject, "blockoutProfile">>) => void;
  addLogicNode: (position?: Vec2) => void;
  updateLogicNode: (nodeId: string, patch: Partial<Omit<LogicNode, "id">>) => void;
  /**
   * 一次提交多个节点的画布排版。
   *
   * 拖动多个选中节点时**必须**走这里：一个一个调 `updateLogicNode` 会把一次拖动
   * 拆成 N 条历史，撤销一次只退回一个节点，看着像撤销坏了。
   */
  moveLogicNodes: (moved: { nodeId: string; position: Vec2 }[]) => void;
  removeLogicNode: (nodeId: string) => void;
  addLogicLink: (from: string, to: string, logic: LogicKind, handles?: Pick<LogicLink, "sourceHandle" | "targetHandle">) => void;
  updateLogicLink: (linkId: string, patch: Partial<Omit<LogicLink, "id">>) => void;
  removeLogicLink: (linkId: string) => void;
  addLogicKey: (foundAt: string, linkId: string, name?: string) => void;
  updateLogicKey: (keyId: string, patch: Partial<Omit<LogicKey, "id">>) => void;
  removeLogicKey: (keyId: string) => void;
  setLogicStartNode: (nodeId: string | null) => void;
  autoLayoutLogic: () => void;
  setSelectedInput: (inputId: string | null) => void;
  addLogicInput: (draft: InputDraft) => void;
  updateLogicInput: (inputId: string, patch: Partial<Omit<LogicInputItem, "id">>) => void;
  removeLogicInput: (inputId: string) => void;
  recordProposal: (note?: string) => void;
  acceptProject: (project: BlockoutProject) => void;
  undo: () => void;
  redo: () => void;
  replaceProject: (project: BlockoutProject) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** 分屏默认对半；限制范围是为了让两侧都留着能干活的最小宽度 */
export const DEFAULT_SPLIT_RATIO = 0.5;
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(0.8, Math.max(0.2, ratio));
}

function scheduleSave(project: BlockoutProject, set: (partial: Partial<ProjectStore>) => void): void {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: "saving" });
  saveTimer = setTimeout(() => {
    try {
      saveDraft(project);
      set({ saveStatus: "saved" });
    } catch {
      set({ saveStatus: "error" });
    }
  }, 350);
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  const initialProject = loadDraft() ?? createDemoProject();

  function commit(nextProject: BlockoutProject): void {
    const current = get().project;
    if (nextProject === current) return;
    set((state) => ({
      project: nextProject,
      past: [...state.past.slice(-99), current],
      future: [],
      previewDirty: true,
      ...geometrySnapshot(nextProject),
    }));
    scheduleSave(nextProject, set);
  }

  /** 拓扑里按 id 找节点，连同它哪些积木 */
  function nodeIn(project: BlockoutProject, nodeId: string): LogicNode | null {
    const topology = project.concept;
    if (!topology) return null;
    for (const scope of scopesOf(topology)) {
      const node = scope.nodes.find((item) => item.id === nodeId);
      if (node) return node;
    }
    return null;
  }

  /**
   * 当前该编辑哪个节点的几何。
   *
   * - 走进一个复合节点：层级落在它的子层，几何编辑器盯着**这个节点**，界面分屏。
   * - 走进一个叶子节点：这一层就是它的几何，几何编辑器同样盯着**这个节点**。
   *
   * 两种情况答案都是"路径上最后一个属于节点内部的节点"。根层没有节点几何可编辑。
   */
  function activeNodeIdOf(topology: LogicTopology | undefined, path: string[]): string | null {
    if (!topology || path.length === 0) return null;
    const nodes = scopesOf(topology).flatMap((scope) => scope.nodes);
    let id: string | null = null;
    for (const step of path) {
      const node = nodes.find((item) => item.id === step);
      if (!node) break;
      // 这个节点自己有子层，说明几何编辑器该盯着它；否则它就是一个叶子区域
      id = childScopeIdOf(topology, node.id) || step === path.at(-1) ? node.id : id;
    }
    return id;
  }

  /**
   * 走进一个**叶子节点**时，顺手把它选中。
   *
   * 那时画布只看得到这一个区域，选中它不会挡住任何别的东西；而不选中的话，
   * 右侧检查器会显示"这一层的逻辑"概览，人就没法给它填落位与朝向 ——
   * 而落位正是 3D 与 UE 认的位置。复合节点不这么做：那一层还有别的区域要选。
   */
  function selectionForLevel(level: ResolvedLevel | null, settled: ResolvedLevel | null): Partial<ProjectStore> {
    const nodeId = settled?.kind === "geometry" ? settled.nodeId : level?.kind === "geometry" ? level.nodeId : null;
    return nodeId ? { selectedLogicNodeId: nodeId, selectedLogicLinkId: null } : { selectedLogicNodeId: null, selectedLogicLinkId: null };
  }

  function currentTopology(): LogicTopology {
    const root = get().project.concept ?? createEmptyTopology();
    // 旧草稿可能缺字段（zod 已兜底，这里再防一手运行时）
    const base: LogicTopology = {
      ...root,
      inputs: root.inputs ?? createEmptyInputs(),
      proposals: root.proposals ?? [],
      scopes: root.scopes ?? [],
    };
    return scopeView(base, get().conceptScopeId);
  }

  function enterNodeOwning(topology: LogicTopology, nodeId: string): void {
    const path = levelPathOfNode(topology, nodeId);
    if (path) get().setLevelPath([...path, nodeId]);
  }

  /**
   * 切换层级。这是唯一的层级写入口：作用域、正在编辑的节点、各类选中项
   * 全部由它一处推导，避免多处状态各自漂移。
   */
  function applyLevel(path: string[]): void {
    const state = get();
    const topology = state.project.concept;
    const level = topology ? resolveLevel(topology, path) : null;
    // 拓扑被改过之后路径可能失效，退到还能对上的那一段
    const safePath = level && level.brokenAt !== null ? path.slice(0, level.brokenAt) : path;
    const settled = topology && safePath !== path ? resolveLevel(topology, safePath) : level;
    set({
      levelPath: safePath,
      conceptScopeId: settled?.kind === "logic" ? settled.scopeId : settled?.scopeId ?? null,
      activeNodeId: activeNodeIdOf(topology, safePath),
      selectedBlockIds: [],
      ...selectionForLevel(level, settled),
    });
    // 层级变了，当前几何目标也跟着变；在同一个 set 之后再算一次快照
    set(geometrySnapshot(state.project));
    // 预览面板停在原地会显示上一次刷新的内容（上一层的几何），所以换层就标记需要刷新。
    // 面板上写着"3D 需要刷新"，比悄悄给人看上一层的几何诚实。
    set({ previewDirty: true, previewScope: [] });
  }

  function historySelection(project: BlockoutProject): Partial<ProjectStore> {
    const state = get();
    const conceptScopeId = state.conceptScopeId && project.concept?.scopes.some((scope) => scope.id === state.conceptScopeId) ? state.conceptScopeId : null;
    const topology = project.concept ? scopeView(project.concept, conceptScopeId) : null;
    const nodeExists = state.activeNodeId !== null && project.concept !== undefined && scopesOf(project.concept).some((scope) => scope.nodes.some((node) => node.id === state.activeNodeId));
    return {
      conceptScopeId, selectedBlockIds: [],
      selectedLogicNodeId: topology?.nodes.some((node) => node.id === state.selectedLogicNodeId) ? state.selectedLogicNodeId : null,
      selectedLogicLinkId: topology?.links.some((link) => link.id === state.selectedLogicLinkId) ? state.selectedLogicLinkId : null,
      ...(nodeExists ? {} : { activeNodeId: null }),
    };
  }

  /** 撤销/重做之后层级可能对不上拓扑了，退到仍然成立的那一段 */
  function reconcileLevel(project: BlockoutProject): void {
    const state = get();
    if (!project.concept || state.levelPath.length === 0) return;
    const level = resolveLevel(project.concept, state.levelPath);
    if (level.brokenAt === null) return;
    applyLevel(state.levelPath.slice(0, level.brokenAt));
  }

  /** 拓扑改动一律：先算出新的**当前作用域**，再写回它在树里的位置 */
  function commitTopology(next: LogicTopology): void {
    const root = get().project.concept ?? createEmptyTopology();
    commit(setConcept(get().project, writeScopeView(root, get().conceptScopeId, next)));
  }

  /**
   * 每次提交后重算"当前几何目标长什么样"。
   * 直接在这里算，组件就不用各自去找节点，也就不会有一处忘了跟着改。
   */
  function geometrySnapshot(project: BlockoutProject): Pick<ProjectStore, "currentBlocks" | "currentGeometryName" | "currentGeometry"> {
    const nodeId = get().activeNodeId;
    const node = nodeId ? nodeIn(project, nodeId) : null;
    if (!node) return { currentBlocks: [], currentGeometryName: "", currentGeometry: null };
    return {
      currentBlocks: node.blocks ?? [],
      currentGeometryName: node.name,
      currentGeometry: { id: node.id, name: node.name, blocks: node.blocks ?? [] },
    };
  }

  /** 当前节点的积木，复制与统计都走它 */
  function currentBlocks(): Block[] {
    const nodeId = get().activeNodeId;
    const node = nodeId ? nodeIn(get().project, nodeId) : null;
    return node?.blocks ?? [];
  }

  const initialGeometry = { currentBlocks: [] as Block[], currentGeometryName: "", currentGeometry: null as EditableGeometry | null };

  return {
    project: initialProject,
    levelPath: [],
    activeNodeId: null,
    splitRatio: DEFAULT_SPLIT_RATIO,
    setSplitRatio: (ratio) => set({ splitRatio: clampSplitRatio(ratio) }),
    ...initialGeometry,
    selectedBlockIds: [],
    selectedLogicNodeId: initialProject.concept?.nodes[0]?.id ?? null,
    selectedLogicLinkId: null,
    selectedInputId: null,
    conceptPane: "topology",
    conceptScopeId: null,
    candidate: null,
    selectedCandidateNodeId: null,
    candidateExcluded: [],
    transformMode: "move",
    logicKind: "normal",
    setLogicKind: (logicKind) => set({ logicKind }),
    previewOpen: false,
    previewDirty: true,
    previewRevision: 0,
    previewScope: [],
    saveStatus: "saved",
    past: [],
    future: [],
    blockClipboard: [],

    setLevelPath: (path) => {
      // 进入节点不需要先给它准备任何东西：几何直接挂在节点上，
      // 第一次进去就是"还没有积木"。
      applyLevel(path);
    },
    returnFromModule: () => {
      const path = get().levelPath;
      if (path.length === 0) return;
      get().setLevelPath(path.slice(0, -1));
    },
    showAssembly: () => get().setLevelPath([]),
    enterNode: (nodeId) => get().setLevelPath([...(levelPathOfNode(currentTopology(), nodeId) ?? []), nodeId]),

    setSelectedBlocks: (selectedBlockIds) => set({ selectedBlockIds }),
    setSelectedLogicNode: (selectedLogicNodeId) => set({ selectedLogicNodeId, selectedLogicLinkId: null }),
    setSelectedLogicLink: (selectedLogicLinkId) => set({ selectedLogicLinkId, selectedLogicNodeId: null }),
    setTransformMode: (transformMode) => set({ transformMode }),
    setConceptPane: (conceptPane) => set({ conceptPane }),
    setConceptScope: (conceptScopeId) => set({ conceptScopeId, selectedLogicNodeId: null, selectedLogicLinkId: null }),
    setSelectedInput: (selectedInputId) => set({ selectedInputId }),
    setCandidate: (candidate) => set({ candidate, selectedCandidateNodeId: null, candidateExcluded: [] }),
    setSelectedCandidateNode: (selectedCandidateNodeId) => set({ selectedCandidateNodeId }),
    toggleCandidateItem: (tempId) => set((state) => ({
      candidateExcluded: state.candidateExcluded.includes(tempId)
        ? state.candidateExcluded.filter((id) => id !== tempId)
        : [...state.candidateExcluded, tempId],
    })),
    updateCandidateNode: (tempId, patch) => set((state) => {
      if (!state.candidate) return {};
      return {
        candidate: {
          ...state.candidate,
          nodes: state.candidate.nodes.map((node) => (node.tempId === tempId ? { ...node, ...structuredClone(patch) } : node)),
        },
      };
    }),

    expandSubLevel: (nodeId, scopeName) => {
      const result = expandNodeScopeCommand(currentTopology(), nodeId, scopeName);
      if (!result) return;
      commitTopology(result.topology);
      // 建完直接进入这个节点：进去就是分屏，左边新子层右边它自己的几何
      get().enterNode(nodeId);
    },
    collapseSubLevel: (nodeId) => {
      commitTopology(collapseNodeScopeCommand(currentTopology(), nodeId));
    },
    addNodeSubLevel: (nodeId, scopeName) => {
      const topology = currentTopology();
      if (childScopeIdOf(topology, nodeId)) return;
      get().expandSubLevel(nodeId, scopeName);
    },

    togglePreview: () => set((state) => ({ previewOpen: !state.previewOpen })),
    refreshPreview: () => {
      const state = get();
      // 站在某个节点里就看这个节点自己的几何；站在逻辑层就看整体
      const nodeId = state.activeNodeId;
      // 可选区域来自 `placements`（一个摆放一条），**不是**按积木去列 ——
      // 一个节点有几块积木就会被列几次，既选重了、界面上也多出一串同名项。
      const placements = flattenProjectGeometry(state.project).placements
        .filter((placed) => !nodeId || placed.id === nodeId);
      set({
        previewRevision: state.previewRevision + 1,
        previewScope: placements.map((placed) => ({ id: placed.id, name: placed.namePath.at(-1) ?? placed.id })),
        previewDirty: false,
        previewOpen: true,
      });
    },

    renameProject: (name) => commit(renameProject(get().project, name)),
    updateSettings: (patch) => commit(updateProjectSettings(get().project, patch)),
    acceptProject: (project) => commit(project),

    addBlock: (type, position) => {
      const nodeId = get().activeNodeId;
      if (!nodeId) return;
      const result = addNodeBlock(get().project, nodeId, type, position);
      if (!result.block) return;
      commit(result.project);
      set({ selectedBlockIds: [result.block.id] });
    },
    updateBlock: (block) => {
      const nodeId = get().activeNodeId;
      if (!nodeId) return;
      commit(updateNodeBlock(get().project, nodeId, block));
    },
    deleteSelectedBlocks: () => {
      const nodeId = get().activeNodeId;
      const ids = get().selectedBlockIds;
      if (!nodeId || ids.length === 0) return;
      commit(removeNodeBlocks(get().project, nodeId, ids));
      set({ selectedBlockIds: [] });
    },
    copySelectedBlocks: () => {
      const ids = new Set(get().selectedBlockIds);
      set({ blockClipboard: currentBlocks().filter((item) => ids.has(item.id)).map((item) => structuredClone(item)) });
    },
    pasteBlocks: () => {
      const nodeId = get().activeNodeId;
      const clipboard = get().blockClipboard;
      if (!nodeId || clipboard.length === 0) return;
      let nextProject = get().project;
      const newIds: string[] = [];
      for (const source of clipboard) {
        const copied = structuredClone(source);
        copied.id = createId(source.type === "port" ? "port" : "block");
        copied.name = `${source.name} 副本`;
        copied.transform.position = [source.transform.position[0] + 50, source.transform.position[1] + 50, source.transform.position[2]];
        const result = addNodeBlock(nextProject, nodeId, copied.type, copied.transform.position);
        if (!result.block) continue;
        copied.id = result.block.id;
        nextProject = updateNodeBlock(result.project, nodeId, copied);
        newIds.push(copied.id);
      }
      commit(nextProject);
      set({ selectedBlockIds: newIds });
    },
    duplicateSelectedBlocks: () => {
      const ids = new Set(get().selectedBlockIds);
      const selected = currentBlocks().filter((item) => ids.has(item.id)).map((item) => structuredClone(item));
      if (selected.length === 0) return;
      set({ blockClipboard: selected });
      get().pasteBlocks();
    },

    addLogicNode: (position) => {
      const topology = currentTopology();
      const result = addLogicNode(topology, position ?? nextNodePosition(topology));
      commitTopology(result.topology);
      set({ selectedLogicNodeId: result.node.id, selectedLogicLinkId: null });
    },
    updateLogicNode: (nodeId, patch) => {
      const next = updateLogicNode(currentTopology(), nodeId, patch);
      commitTopology(next);
      // 改的可能是名字或落位，当前几何快照要跟上（检查器与几何编辑器都读它）
      set(geometrySnapshot(get().project));
    },
    moveLogicNodes: (moved) => {
      if (moved.length === 0) return;
      const current = currentTopology();
      const next = moveNodes(current, moved.map(({ nodeId, position }) => ({ nodeId, position })));
      if (next === current) return;
      commitTopology(next);
    },
    removeLogicNode: (nodeId) => {
      commitTopology(removeLogicNode(currentTopology(), nodeId));
      set((state) => (state.selectedLogicNodeId === nodeId ? { selectedLogicNodeId: null } : {}));
    },
    addLogicLink: (from, to, logic, handles) => {
      const result = addLogicLink(currentTopology(), from, to, logic, handles);
      if (!result) return;
      commitTopology(result.topology);
      set({ selectedLogicLinkId: result.link.id, selectedLogicNodeId: null });
    },
    updateLogicLink: (linkId, patch) => commitTopology(updateLogicLink(currentTopology(), linkId, patch)),
    removeLogicLink: (linkId) => {
      commitTopology(removeLogicLink(currentTopology(), linkId));
      set((state) => (state.selectedLogicLinkId === linkId ? { selectedLogicLinkId: null } : {}));
    },
    addLogicKey: (foundAt, linkId, name) => {
      const result = addLogicKey(currentTopology(), foundAt, linkId, name);
      if (result) commitTopology(result.topology);
    },
    updateLogicKey: (keyId, patch) => commitTopology(updateLogicKey(currentTopology(), keyId, patch)),
    removeLogicKey: (keyId) => commitTopology(removeLogicKey(currentTopology(), keyId)),
    setLogicStartNode: (nodeId) => commitTopology(setStartNode(currentTopology(), nodeId)),
    autoLayoutLogic: () => commitTopology(autoLayoutTopology(currentTopology())),

    addLogicInput: (draft) => {
      const result = addInputCommand(currentTopology(), draft);
      commitTopology(result.topology);
      set({ selectedInputId: result.item.id });
    },
    updateLogicInput: (inputId, patch) => commitTopology(updateInputCommand(currentTopology(), inputId, patch)),
    removeLogicInput: (inputId) => {
      commitTopology(removeInputCommand(currentTopology(), inputId));
      set((state) => (state.selectedInputId === inputId ? { selectedInputId: null } : {}));
    },
    recordProposal: (note) => {
      const result = recordProposalCommand(currentTopology(), note ?? "");
      commitTopology(result.topology);
    },
    applyRecognitionCandidate: () => {
      const state = get();
      const candidate = state.candidate;
      if (!candidate) return;
      // 先按人工排除裁剪，再把"套用 + 登记"合并成一次提交，撤销时一起回退
      const pruned = pruneCandidate(candidate, state.candidateExcluded);
      const applied = applyCandidateCommand(currentTopology(), pruned);
      const recorded = recordProposalCommand(applied.topology, `套用候选：${pruned.name}`);
      commitTopology(recorded.topology);
      set({ candidate: null, selectedCandidateNodeId: null, candidateExcluded: [], conceptPane: "topology" });
    },

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;
      set({ ...historySelection(previous), project: previous, past: state.past.slice(0, -1), future: [state.project, ...state.future].slice(0, 100), previewDirty: true, ...geometrySnapshot(previous) });
      scheduleSave(previous, set);
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      set({ ...historySelection(next), project: next, past: [...state.past, state.project].slice(-100), future: state.future.slice(1), previewDirty: true, ...geometrySnapshot(next) });
      scheduleSave(next, set);
    },
    replaceProject: (project) => {
      set({
        project, levelPath: [], activeNodeId: null, ...initialGeometry,
        selectedBlockIds: [],
        selectedLogicNodeId: project.concept?.nodes[0]?.id ?? null, selectedLogicLinkId: null, selectedInputId: null,
        conceptPane: "topology", conceptScopeId: null, candidate: null, candidateExcluded: [], selectedCandidateNodeId: null,
        past: [], future: [], previewDirty: true, previewScope: [], previewRevision: 0, previewOpen: false,
      });
      scheduleSave(project, set);
    },
  };
});
