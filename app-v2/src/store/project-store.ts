import { create } from "zustand";
import { addBlockTo, addConnection, addModule, createModuleForNode, duplicateInstance, removeBlocksFrom, removeConnection, removeInstance, renameProject, setConcept, updateBlockIn, updateConnection, updateInstanceGraph, updateInstanceTransform, updateModule, updateProjectSettings, type GeometryTarget } from "../domain/commands";
import { addInput as addInputCommand, addLogicKey, addLogicLink, addLogicNode, applyCandidate as applyCandidateCommand, applyDecomposition as applyDecompositionCommand, autoLayoutTopology, bindNodeModule, createLogicModule as createLogicModuleCommand, nextNodePosition, recordProposal as recordProposalCommand, removeInput as removeInputCommand, removeLogicKey, removeLogicLink, removeLogicModule as removeLogicModuleCommand, removeLogicNode, seedModulesFromNodes, setNodeModule as setNodeModuleCommand, setStartNode, updateInput as updateInputCommand, updateLogicKey, updateLogicLink, updateLogicModule as updateLogicModuleCommand, updateLogicNode, type InputDraft } from "../domain/concept-commands";
import { pruneCandidate, type CandidateNode, type RecognitionCandidate } from "../domain/concept-candidate";
import { editDecomposition as editDecompositionCommand, type DecompositionEdit } from "../domain/concept-commands";
import type { DecompositionCandidate } from "../domain/concept-decomposition";
import { createEmptyTopology } from "../domain/concept";
import { expandModule as expandModuleCommand, childScopeIdOf, collapseModule as collapseModuleCommand, allModules, levelPathOfNode, resolveLevel, scopeView, scopesOf, writeScopeView } from "../domain/concept-scopes";
import { createEmptyInputs, type LogicInputItem } from "../domain/concept-inputs";
import type { LogicKey, LogicKind, LogicLink, LogicModule, LogicNode, LogicTopology } from "../domain/concept";
import { createDemoProject } from "../domain/demo-project";
import { createId } from "../domain/ids";
import { loadDraft, saveDraft } from "../domain/persistence";
import type { Block, BlockoutProject, BlockType, Connection, ConnectionType, DiagramReference, ModuleDefinition, Transform, Vec2 } from "../domain/types";
import { ensureLogicModule, placeModuleDefinition } from "../domain/module-workflow";
import { createModulePreviewProject } from "../domain/module-preview-project";
import { applyModuleDraft as applyModuleDraftCommand, validateModuleDraft, type ModuleDraft } from "../domain/module-draft";

/** concept = 阶段一 构想工作台；build = 阶段二 拼接与转化 */
export type AppStage = "concept" | "build";
/**
 * 几何编辑器要编辑的那份几何。
 * 可能是**节点自己的**（新模型，坐标是节点局部厘米），
 * 也可能是**遗留模块定义**的（旧项目，底图与草案只在这条路上有）。
 */
export interface EditableGeometry {
  id: string;
  name: string;
  blocks: Block[];
  /** 有值表示这份几何其实来自遗留的模块定义 */
  moduleId?: string;
  reference?: DiagramReference;
}
/** 阶段一里的五个工作面：逻辑拓扑 / 输入上下文 / 识别 / 横向拆解 / 基础构型 */
export type ConceptPane = "topology" | "inputs" | "recognition" | "decomposition" | "configuration";
export type AppView = "assembly" | "module";
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
  /** 进入某个节点的内部 */
  enterLevel: (nodeId: string) => void;
  /** 跳到指定层级（面包屑、层级树都用它） */
  setLevelPath: (path: string[]) => void;
  /** 退回上一层 */
  returnFromModule: () => void;
  /** 查看整体 = 回到根层 */
  showAssembly: () => void;
  activeInstanceId: string | null;
  /**
   * 正在编辑内部几何的那个**节点**（2026-09-17 二次修订）。
   *
   * 节点可以同时有子逻辑和自己的几何，所以"我在哪个节点的几何里"独立于层级路径：
   * 进复合节点后层级跳到它的子层，但几何编辑的仍是这个节点自己 —— 两边是同一个坐标系。
   */
  activeNodeId: string | null;
  /** 分屏比例：左（逻辑图）占的宽度比例，进复合节点时用它 */
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
  /**
   * 当前几何目标的积木与名字。
   *
   * 由 store 在每次提交与切换层级时算好，**不是** `get()` 现算——现算不会触发重渲染，
   * 几何编辑器与检查器就看不到改动。放在 store 里只有一个写入口，也就不会漂移。
   */
  currentBlocks: Block[];
  currentGeometryName: string;
  /** 几何编辑器现在在编辑哪个对象；"没有可编辑的内部"时为空 */
  currentGeometry: EditableGeometry | null;
  /**
   * 遗留：当前打开的模块定义。层级模型要求几何挂在节点上，但早期项目里存在
   * 没有拓扑的模块；仍然让人能打开它的几何，并明确标为遗留。
   * 新代码不要读它，用 `geometryTarget()`。
   */
  detachedModuleId: string | null;
  activeModuleId: string | null;
  moduleDraft: ModuleDraft | null;
  setModuleDraft: (draft: ModuleDraft | null) => void;
  applyModuleDraft: () => string[];
  openLogicModule: (logicModuleId: string) => void;
  openModule: (instanceId: string) => void;
  openModuleById: (moduleId: string) => void;
  placeModule: (moduleId: string, scopePath?: string[]) => string | null;
  selectedInstanceId: string | null;
  selectedConnectionId: string | null;
  selectedBlockIds: string[];
  selectedLogicNodeId: string | null;
  selectedLogicLinkId: string | null;
  selectedInputId: string | null;
  conceptPane: ConceptPane;
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
  /** 拆解提案：同样只存在于会话内 */
  decomposition: DecompositionCandidate | null;
  setDecomposition: (candidate: DecompositionCandidate | null) => void;
  applyDecompositionCandidate: () => void;
  setNodeModule: (nodeId: string, moduleId: string | null) => void;
  editDecomposition: (edit: DecompositionEdit) => void;
  addLogicModule: (name: string, nodeIds?: string[]) => void;
  updateLogicModule: (moduleId: string, patch: Partial<Pick<LogicModule, "name" | "note">>) => void;
  removeLogicModule: (moduleId: string) => void;
  seedModules: () => void;
  /** 当前编辑的作用域（null = 根）。所有拓扑命令都作用在它上面 */
  conceptScopeId: string | null;
  setConceptScope: (scopeId: string | null) => void;
  expandLogicModule: (nodeId: string, scopeName?: string) => void;
  collapseLogicModule: (nodeId: string) => void;
  /** 进入一个节点的内部（双击节点、层级树、检查器都走它） */
  enterNode: (nodeId: string) => void;
  /** 给一个节点建子逻辑层：这一层从"只有几何"变成"几何 + 子区域" */
  addNodeSubLevel: (nodeId: string, scopeName?: string) => void;
  transformMode: TransformMode;
  connectionType: ConnectionType;
  logicKind: LogicKind;
  setLogicKind: (kind: LogicKind) => void;
  previewOpen: boolean;
  previewDirty: boolean;
  previewRevision: number;
  previewProject: BlockoutProject | null;
  previewModuleId: string | null;
  saveStatus: SaveStatus;
  past: BlockoutProject[];
  future: BlockoutProject[];
  instanceClipboardId: string | null;
  blockClipboard: Block[];
  setSelectedInstance: (instanceId: string | null) => void;
  setSelectedConnection: (connectionId: string | null) => void;
  setSelectedBlocks: (blockIds: string[]) => void;
  setSelectedLogicNode: (nodeId: string | null) => void;
  setSelectedLogicLink: (linkId: string | null) => void;
  setTransformMode: (mode: TransformMode) => void;
  setConnectionType: (type: ConnectionType) => void;
  togglePreview: () => void;
  refreshPreview: () => void;
  renameProject: (name: string) => void;
  addModule: (position?: Vec2) => void;
  duplicateSelectedInstance: () => void;
  copySelectedInstance: () => void;
  pasteInstance: () => void;
  deleteSelectedInstance: () => void;
  updateInstanceGraph: (instanceId: string, position: Vec2) => void;
  updateInstanceTransform: (instanceId: string, transform: Transform) => void;
  addBlock: (type: BlockType, position?: [number, number, number]) => void;
  updateBlock: (block: Block) => void;
  deleteSelectedBlocks: () => void;
  copySelectedBlocks: () => void;
  pasteBlocks: () => void;
  duplicateSelectedBlocks: () => void;
  connectPorts: (sourceInstanceId: string, sourcePortId: string, targetInstanceId: string, targetPortId: string) => void;
  updateSelectedConnectionType: (type: ConnectionType) => void;
  updateSelectedConnectionSpacing: (spacing: Connection["spacing"]) => void;
  updateConnectionWaypoints: (connectionId: string, points: Vec2[]) => void;
  updateModule: (module: ModuleDefinition) => void;
  updateSettings: (patch: Partial<Pick<BlockoutProject, "assemblyAnchorInstanceId" | "blockoutProfile">>) => void;
  addLogicNode: (position?: Vec2) => void;
  updateLogicNode: (nodeId: string, patch: Partial<Omit<LogicNode, "id">>) => void;
  removeLogicNode: (nodeId: string) => void;
  addLogicLink: (from: string, to: string, logic: LogicKind, handles?: Pick<LogicLink, "sourceHandle" | "targetHandle">) => void;
  updateLogicLink: (linkId: string, patch: Partial<Omit<LogicLink, "id">>) => void;
  removeLogicLink: (linkId: string) => void;
  addLogicKey: (foundAt: string, linkId: string, name?: string) => void;
  updateLogicKey: (keyId: string, patch: Partial<Omit<LogicKey, "id">>) => void;
  removeLogicKey: (keyId: string) => void;
  setLogicStartNode: (nodeId: string | null) => void;
  autoLayoutLogic: () => void;
  bindNodeModule: (nodeId: string, moduleId: string | undefined) => void;
  createModuleForNode: (nodeId: string) => void;
  setConceptPane: (pane: ConceptPane) => void;
  setSelectedInput: (inputId: string | null) => void;
  addLogicInput: (draft: InputDraft) => void;
  updateLogicInput: (inputId: string, patch: Partial<Omit<LogicInputItem, "id">>) => void;
  removeLogicInput: (inputId: string) => void;
  recordProposal: (note?: string) => void;
  acceptProject: (project: BlockoutProject) => void;
  deleteSelectedConnection: () => void;
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
  /** 启动时的几何目标：没有层级路径，所以是空 */
  const initialGeometry = { currentBlocks: [] as Block[], currentGeometryName: "", currentGeometry: null as EditableGeometry | null };

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

  /**
   * 当前该编辑哪个几何。
   *
   * 节点同时装几何和子逻辑之后，几何不再由"层级是不是几何层"决定：
   * 走进复合节点，层级落在它的子层，但几何编辑器仍然盯着**这个节点**。
   * 所以先看层级路径推导出的节点；没有节点几何可编辑时（例如没有拓扑的旧模块），
   * 才落到遗留的模块定义上。
   */
  function geometryTarget(): GeometryTarget {
    const state = get();
    // 显式点名模块定义（从"整体摆放"打开的旧模块）优先：那时人要看的就是那份几何
    if (state.activeModuleId && state.project.modules.some((item) => item.id === state.activeModuleId)) {
      return { kind: "module", moduleId: state.activeModuleId };
    }
    if (state.activeNodeId) return { kind: "node", nodeId: state.activeNodeId };
    if (state.detachedModuleId) return { kind: "module", moduleId: state.detachedModuleId };
    const definitionId = state.project.instances.find((item) => item.id === state.activeInstanceId)?.definitionId;
    return definitionId ? { kind: "module", moduleId: definitionId } : null;
  }

  /** 当前目标的积木列表，复制与统计都用它，避免各处再写一遍节点/模块的分支 */
  function currentBlocks(): Block[] {
    const target = geometryTarget();
    if (!target) return [];
    if (target.kind === "module") return get().project.modules.find((item) => item.id === target.moduleId)?.blocks ?? [];
    return currentTopologyNodes().find((node) => node.id === target.nodeId)?.blocks ?? [];
  }

  function currentTopologyNodes(): LogicTopology["nodes"] {
    const topology = get().project.concept;
    if (!topology) return [];
    return scopesOf(topology).flatMap((scope) => scope.nodes);
  }

  /**
   * 每次提交后重算"当前几何目标长什么样"。
   * 直接在这里算，组件就不用各自去判节点/模块，也就不会有一处忘了跟着改。
   */
  function geometrySnapshot(project: BlockoutProject): Pick<ProjectStore, "currentBlocks" | "currentGeometryName" | "currentGeometry"> {
    const target = geometryTarget();
    if (!target) return { currentBlocks: [], currentGeometryName: "", currentGeometry: null };
    if (target.kind === "module") {
      const module = project.modules.find((item) => item.id === target.moduleId);
      return {
        currentBlocks: module?.blocks ?? [],
        currentGeometryName: module?.name ?? "",
        currentGeometry: module ? { id: module.id, name: module.name, blocks: module.blocks, moduleId: module.id, reference: module.reference } : null,
      };
    }
    const topology = project.concept;
    const node = topology ? scopesOf(topology).flatMap((scope) => scope.nodes).find((item) => item.id === target.nodeId) : undefined;
    return {
      currentBlocks: node?.blocks ?? [],
      currentGeometryName: node?.name ?? "",
      // 节点自己的几何：坐标是节点局部厘米；底图与草案是模块定义才有的旧能力
      currentGeometry: node ? { id: node.id, name: node.name, blocks: node.blocks ?? [] } : null,
    };
  }

  /** 没有对应逻辑节点的旧模块 */
  function detachedModuleId(): string | null {
    const state = get();
    if (state.detachedModuleId) return state.detachedModuleId;
    const explicit = state.activeModuleId;
    if (explicit && state.project.modules.some((item) => item.id === explicit)) return explicit;
    const activeId = state.activeInstanceId;
    return state.project.instances.find((item) => item.id === activeId)?.definitionId ?? null;
  }

  /**
   * 当前该编辑哪个节点的几何。
   *
   * 节点同时装几何和子逻辑之后，几何不再由"层级是不是几何层"决定：
   *
   * - 走进一个复合节点：层级落在它的子层，几何编辑器盯着**这个节点**，界面分屏。
   * - 走进一个叶子节点：这一层就是它的几何，几何编辑器同样盯着**这个节点**。
   *
   * 两种情况的答案都是"路径上最后一个属于节点内部的节点"。根层没有节点几何可编辑，
   * 所以路径为空时返回 null（那时该落到遗留模块或什么都不编辑）。
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

  function currentTopology(): LogicTopology {
    const root = get().project.concept ?? createEmptyTopology();
    // 旧草稿可能缺字段（zod 已兜底，这里再防一手运行时）
    const base: LogicTopology = {
      ...root,
      inputs: root.inputs ?? createEmptyInputs(),
      proposals: root.proposals ?? [],
      modules: root.modules ?? [],
      scopes: root.scopes ?? [],
    };
    return scopeView(base, get().conceptScopeId);
  }

  /** 进入"产出这份几何的那个节点" */
  function enterNodeOwning(topology: LogicTopology, nodeId: string): void {
    const path = levelPathOfNode(topology, nodeId);
    if (path) get().setLevelPath([...path, nodeId]);
  }

  /**
   * 哪个节点产出这份模块定义。
   * 先认节点自己的 `moduleId`（新模型），再回落分组上的 `moduleDefinitionId`（旧数据）。
   */
  function nodeOwningDefinition(topology: LogicTopology, definitionId: string): string | null {
    for (const scope of scopesOf(topology)) {
      const direct = scope.nodes.find((node) => node.moduleId === definitionId);
      if (direct) return direct.id;
      for (const group of scope.modules) {
        if (group.moduleDefinitionId !== definitionId) continue;
        const owner = group.nodeIds[0];
        if (owner) return owner;
      }
    }
    return null;
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
      detachedModuleId: null,
      // 层级是"我在哪"的唯一写入口：显式点名的旧模块目标也要跟着清掉，
      // 否则走远了它还赖着不走（例如退回整图后预览仍盯着某个模块）
      activeModuleId: null,
      conceptScopeId: settled?.kind === "logic" ? settled.scopeId : settled?.scopeId ?? null,
      activeNodeId: activeNodeIdOf(topology, safePath),
      moduleDraft: null,
      selectedBlockIds: [],
      selectedLogicNodeId: null,
      selectedLogicLinkId: null,
      selectedInstanceId: null,
      selectedConnectionId: null,
    });
    // 层级变了，当前几何目标也跟着变；在同一个 set 之后再算一次快照
    set(geometrySnapshot(state.project));
  }

  function historySelection(project: BlockoutProject): Partial<ProjectStore> {
    const state = get();
    const conceptScopeId = state.conceptScopeId && project.concept?.scopes.some((scope) => scope.id === state.conceptScopeId) ? state.conceptScopeId : null;
    const topology = project.concept ? scopeView(project.concept, conceptScopeId) : null;
    const nodeExists = state.activeNodeId !== null && project.concept !== undefined && scopesOf(project.concept).some((scope) => scope.nodes.some((node) => node.id === state.activeNodeId));
    return {
      conceptScopeId, selectedBlockIds: [], moduleDraft: null,
      selectedInstanceId: project.instances.some((instance) => instance.id === state.selectedInstanceId) ? state.selectedInstanceId : null,
      selectedConnectionId: project.connections.some((connection) => connection.id === state.selectedConnectionId) ? state.selectedConnectionId : null,
      selectedLogicNodeId: topology?.nodes.some((node) => node.id === state.selectedLogicNodeId) ? state.selectedLogicNodeId : null,
      selectedLogicLinkId: topology?.links.some((link) => link.id === state.selectedLogicLinkId) ? state.selectedLogicLinkId : null,
      activeInstanceId: project.instances.some((instance) => instance.id === state.activeInstanceId) ? state.activeInstanceId : null,
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

  return {
    project: initialProject,
    levelPath: [],
    detachedModuleId: null,
    activeInstanceId: null,
    activeNodeId: null,
    activeModuleId: null,
    ...initialGeometry,
    splitRatio: DEFAULT_SPLIT_RATIO,
    setSplitRatio: (ratio) => set({ splitRatio: clampSplitRatio(ratio) }),
    moduleDraft: null,
    setModuleDraft: (moduleDraft) => {
      // 草案是针对模块定义的旧能力，只有当前目标是遗留模块时才接受
      const target = geometryTarget();
      if (moduleDraft && (moduleDraft.projectId !== get().project.projectId || target?.kind !== "module" || moduleDraft.moduleId !== target.moduleId)) return;
      set({ moduleDraft, selectedBlockIds: [] });
    },
    applyModuleDraft: () => {
      const { project, moduleDraft } = get();
      if (!moduleDraft) return ["没有待采用的模块草案"];
      const errors = validateModuleDraft(project, moduleDraft);
      if (errors.length) return errors;
      try {
        commit(applyModuleDraftCommand(project, moduleDraft));
        set({ moduleDraft: null, selectedBlockIds: [] });
        return [];
      } catch (error) { return [error instanceof Error ? error.message : "采用失败"]; }
    },
    /** 进入某个节点的内部：有子作用域就换到那一层逻辑，否则进它的几何 */
    enterLevel: (nodeId) => {
      const path = get().levelPath;
      get().setLevelPath([...path, nodeId]);
    },
    setLevelPath: (path) => {
      // 进入节点不再需要先给它准备一个模块定义：几何直接挂在节点上，
      // 第一次进去就是"还没有积木"，不再是"还没有模块"。
      applyLevel(path);
    },
    /**
     * 从**拆解分组**进入：跳到产出这份几何的那个节点。
     * 从整体摆放进来时手上是模块定义 id，走 `openModuleById`。
     */
    openLogicModule: (logicModuleId) => {
      const topology = get().project.concept;
      if (!topology) return;
      const found = allModules(topology).find((entry) => entry.module.id === logicModuleId)?.module;
      const owner = found?.nodeIds[0];
      if (owner) enterNodeOwning(topology, owner);
    },
    openModuleById: (definitionId) => {
      const state = get();
      const topology = state.project.concept;
      // 有节点产出这份几何就进那个节点（节点是几何的家）。
      // 注意：不能只找"有子层的分组"——没有子层的节点才是常态。
      const owner = topology ? nodeOwningDefinition(topology, definitionId) : null;
      if (topology && owner) {
        enterNodeOwning(topology, owner);
        // 仍然是**显式点名**这个模块定义：这是从"整体摆放"进来的，人要编辑的就是它。
        set({ activeModuleId: definitionId });
        return;
      }
      // 没有对应逻辑节点的旧模块：直接打开几何，层级保持在整图
      if (state.project.modules.some((module) => module.id === definitionId)) {
        set({ levelPath: [], detachedModuleId: definitionId, activeNodeId: null, activeModuleId: definitionId, moduleDraft: null, selectedBlockIds: [] });
      }
    },
    /** 退回上一层：面包屑与返回按钮共用 */
    returnFromModule: () => {
      const path = get().levelPath;
      if (path.length === 0) return;
      get().setLevelPath(path.slice(0, -1));
    },
    /** 查看整体 = 回到根层 */
    showAssembly: () => get().setLevelPath([]),
    placeModule: (moduleId, scopePath) => {
      const result = placeModuleDefinition(get().project, moduleId, scopePath);
      if (!result.instance) return null;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
      return result.instance.id;
    },
    selectedInstanceId: initialProject.instances[0]?.id ?? null,
    selectedConnectionId: null,
    selectedBlockIds: [],
    selectedLogicNodeId: initialProject.concept?.nodes[0]?.id ?? null,
    selectedLogicLinkId: null,
    selectedInputId: null,
    conceptPane: "topology",
    conceptScopeId: null,
    candidate: null,
    selectedCandidateNodeId: null,
    candidateExcluded: [],
    decomposition: null,
    transformMode: "move",
    connectionType: "stairs",
    logicKind: "normal",
    setLogicKind: (logicKind) => set({ logicKind }),
    previewOpen: false,
    previewDirty: true,
    previewRevision: 0,
    previewProject: null,
    previewModuleId: null,
    saveStatus: "saved",
    past: [],
    future: [],
    instanceClipboardId: null,
    blockClipboard: [],
    openModule: (instanceId: string) => {
      const instance = get().project.instances.find((item) => item.id === instanceId);
      if (instance) get().openModuleById(instance.definitionId);
    },
    setSelectedInstance: (selectedInstanceId) => set({ selectedInstanceId, selectedConnectionId: null }),
    setSelectedConnection: (selectedConnectionId) => set({ selectedConnectionId, selectedInstanceId: null }),
    setSelectedBlocks: (selectedBlockIds) => set({ selectedBlockIds }),
    setSelectedLogicNode: (selectedLogicNodeId) => set({ selectedLogicNodeId, selectedLogicLinkId: null }),
    setSelectedLogicLink: (selectedLogicLinkId) => set({ selectedLogicLinkId, selectedLogicNodeId: null }),
    setConceptPane: (conceptPane) => set({ conceptPane }),
    setConceptScope: (conceptScopeId) => set({ conceptScopeId, selectedLogicNodeId: null, selectedLogicLinkId: null }),
    expandLogicModule: (nodeId, scopeName) => {
      const result = expandModuleCommand(currentTopology(), nodeId, scopeName);
      if (!result) return;
      commitTopology(result.topology);
      // 建完直接进入这个节点：进去就是分屏，左边新子层右边它自己的几何
      get().enterNode(nodeId);
    },
    collapseLogicModule: (nodeId) => {
      commitTopology(collapseModuleCommand(currentTopology(), nodeId));
    },
    enterNode: (nodeId) => get().setLevelPath([...(levelPathOfNode(currentTopology(), nodeId) ?? []), nodeId]),
    addNodeSubLevel: (nodeId, scopeName) => {
      const topology = currentTopology();
      if (childScopeIdOf(topology, nodeId)) return;
      get().expandLogicModule(nodeId, scopeName);
    },
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
    setDecomposition: (decomposition) => set({ decomposition }),
    applyDecompositionCandidate: () => {
      const candidate = get().decomposition;
      if (!candidate) return;
      const applied = applyDecompositionCommand(currentTopology(), candidate);
      const recorded = recordProposalCommand(applied.topology, `套用拆解：${candidate.name}`);
      commitTopology(recorded.topology);
      set({ decomposition: null });
    },
    setNodeModule: (nodeId, moduleId) => commitTopology(setNodeModuleCommand(currentTopology(), nodeId, moduleId)),
    editDecomposition: (edit) => {
      const current = currentTopology();
      const next = editDecompositionCommand(current, edit);
      if (next !== current) commitTopology(next);
    },
    addLogicModule: (name, nodeIds) => {
      const result = createLogicModuleCommand(currentTopology(), name, nodeIds ?? []);
      commitTopology(result.topology);
    },
    updateLogicModule: (moduleId, patch) => {
      const current = currentTopology();
      const definitionId = current.modules.find((group) => group.id === moduleId)?.moduleDefinitionId;
      const next = updateLogicModuleCommand(current, moduleId, patch);
      const project = get().project;
      const concept = writeScopeView(project.concept ?? createEmptyTopology(), get().conceptScopeId, next);
      const bindingCount = [concept, ...concept.scopes].flatMap((scope) => scope.modules).filter((group) => group.moduleDefinitionId === definitionId).length;
      commit({ ...setConcept(project, concept), modules: patch.name?.trim() && definitionId && bindingCount === 1
        ? project.modules.map((module) => module.id === definitionId ? { ...module, name: patch.name!.trim() } : module) : project.modules });
    },
    removeLogicModule: (moduleId) => commitTopology(removeLogicModuleCommand(currentTopology(), moduleId)),
    seedModules: () => commitTopology(seedModulesFromNodes(currentTopology())),
    setTransformMode: (transformMode) => set({ transformMode }),
    setConnectionType: (connectionType) => set({ connectionType }),
    togglePreview: () => set((state) => ({ previewOpen: !state.previewOpen })),
    refreshPreview: () => {
      const state = get();
      // 站在某一层的几何里就看局部，站在逻辑层就看整体
      const target = geometryTarget();
      const moduleId = target?.kind === "module" ? target.moduleId : null;
      set({ previewRevision: state.previewRevision + 1, previewProject: moduleId ? createModulePreviewProject(state.project, moduleId) : state.project,
        previewModuleId: moduleId, previewDirty: false, previewOpen: true });
    },
    renameProject: (name) => commit(renameProject(get().project, name)),
    updateModule: (module) => commit(updateModule(get().project, module)),
    updateSettings: (patch) => commit(updateProjectSettings(get().project, patch)),
    addLogicNode: (position) => {
      const topology = currentTopology();
      const result = addLogicNode(topology, position ?? nextNodePosition(topology));
      commitTopology(result.topology);
      set({ selectedLogicNodeId: result.node.id, selectedLogicLinkId: null });
    },
    updateLogicNode: (nodeId, patch) => commitTopology(updateLogicNode(currentTopology(), nodeId, patch)),
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
    bindNodeModule: (nodeId, moduleId) => commitTopology(bindNodeModule(currentTopology(), nodeId, moduleId)),
    createModuleForNode: (nodeId) => {
      const node = currentTopology().nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const result = createModuleForNode(get().project, nodeId, node.graphPosition);
      if (!result) return;
      commit(result.project);
      set({ activeNodeId: nodeId, selectedLogicNodeId: nodeId });
    },
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
    acceptProject: (project) => commit(project),
    addModule: (position) => {
      const result = addModule(get().project, position);
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    duplicateSelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (!selected) return;
      const result = duplicateInstance(get().project, selected);
      if (!result.instance) return;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    copySelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (selected && get().project.instances.some((instance) => instance.id === selected)) set({ instanceClipboardId: selected });
    },
    pasteInstance: () => {
      const sourceId = get().instanceClipboardId;
      if (!sourceId) return;
      const result = duplicateInstance(get().project, sourceId);
      if (!result.instance) return;
      commit(result.project);
      set({ selectedInstanceId: result.instance.id, selectedConnectionId: null });
    },
    deleteSelectedInstance: () => {
      const selected = get().selectedInstanceId;
      if (!selected) return;
      commit(removeInstance(get().project, selected));
      set({ selectedInstanceId: null, selectedConnectionId: null });
    },
    updateInstanceGraph: (instanceId, position) => commit(updateInstanceGraph(get().project, instanceId, position)),
    updateInstanceTransform: (instanceId, transform) => commit(updateInstanceTransform(get().project, instanceId, transform)),
    addBlock: (type, position) => {
      if (get().moduleDraft) return;
      const target = geometryTarget();
      if (!target) return;
      const result = addBlockTo(get().project, target, type, position);
      if (!result.block) return;
      commit(result.project);
      set({ selectedBlockIds: [result.block.id] });
    },
    updateBlock: (block) => {
      if (get().moduleDraft) return;
      const target = geometryTarget();
      if (!target) return;
      commit(updateBlockIn(get().project, target, block));
    },
    deleteSelectedBlocks: () => {
      if (get().moduleDraft) return;
      const target = geometryTarget();
      const ids = get().selectedBlockIds;
      if (!target || ids.length === 0) return;
      commit(removeBlocksFrom(get().project, target, ids));
      set({ selectedBlockIds: [] });
    },
    copySelectedBlocks: () => {
      const blocks = currentBlocks();
      const ids = new Set(get().selectedBlockIds);
      set({ blockClipboard: blocks.filter((item) => ids.has(item.id)).map((item) => structuredClone(item)) });
    },
    pasteBlocks: () => {
      if (get().moduleDraft) return;
      const target = geometryTarget();
      const clipboard = get().blockClipboard;
      if (!target || clipboard.length === 0) return;
      let nextProject = get().project;
      const newIds: string[] = [];
      for (const source of clipboard) {
        const copied = structuredClone(source);
        copied.id = createId(source.type === "port" ? "port" : "block");
        copied.name = `${source.name} 副本`;
        copied.transform.position = [source.transform.position[0] + 50, source.transform.position[1] + 50, source.transform.position[2]];
        const result = addBlockTo(nextProject, target, copied.type, copied.transform.position);
        if (!result.block) continue;
        copied.id = result.block.id;
        nextProject = updateBlockIn(result.project, target, copied);
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
    connectPorts: (sourceInstanceId, sourcePortId, targetInstanceId, targetPortId) => {
      const currentProject = get().project;
      const nextProject = addConnection(currentProject, get().connectionType, sourceInstanceId, sourcePortId, targetInstanceId, targetPortId);
      if (nextProject === currentProject) return;
      commit(nextProject);
      set({ selectedConnectionId: nextProject.connections.at(-1)?.id ?? null, selectedInstanceId: null });
    },
    updateSelectedConnectionType: (type) => {
      const selected = get().selectedConnectionId;
      if (!selected) return;
      commit(updateConnection(get().project, selected, { type }));
    },
    updateSelectedConnectionSpacing: (spacing) => {
      const id = get().selectedConnectionId;
      if (id) commit(updateConnection(get().project, id, { spacing }));
    },
    updateConnectionWaypoints: (id, waypoints) => commit(updateConnection(get().project, id, { waypoints })),
    deleteSelectedConnection: () => {
      const selected = get().selectedConnectionId;
      if (!selected) return;
      commit(removeConnection(get().project, selected));
      set({ selectedConnectionId: null });
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
        project, levelPath: [], detachedModuleId: null,
        activeInstanceId: null, activeNodeId: null, activeModuleId: null, moduleDraft: null, ...initialGeometry,
        selectedInstanceId: project.instances[0]?.id ?? null, selectedConnectionId: null, selectedBlockIds: [],
        selectedLogicNodeId: project.concept?.nodes[0]?.id ?? null, selectedLogicLinkId: null, selectedInputId: null,
        conceptPane: "topology", conceptScopeId: null, candidate: null, candidateExcluded: [], selectedCandidateNodeId: null,
        decomposition: null,
        past: [], future: [], previewDirty: true, previewProject: null, previewModuleId: null, previewRevision: 0, previewOpen: false,
      });
      scheduleSave(project, set);
    },
  };
});
