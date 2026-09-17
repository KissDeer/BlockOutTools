import type { Vec2 } from "./types";
import {
  createEmptyTopology,
  defaultTraversal,
  type LogicKey,
  type LogicKind,
  type LogicLink,
  type LogicModule,
  type LogicNode,
  type LogicNodeRole,
  type LogicTopology,
} from "./concept";
import { createId } from "./ids";
import { toRelativePosition, type RecognitionCandidate } from "./concept-candidate";
import type { DecompositionCandidate } from "./concept-decomposition";
import {
  computeInputsDigest,
  INPUT_KINDS,
  type DecompositionProposal,
  type LogicInputCalibration,
  type LogicInputItem,
  type LogicInputKind,
} from "./concept-inputs";

/** 图上标注字母：A…Z，然后 A2…Z2、A3… */
function linkLabelAt(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  const cycle = Math.floor(index / 26);
  return cycle === 0 ? letter : `${letter}${cycle + 1}`;
}

function nextLinkLabel(topology: LogicTopology): string {
  const used = new Set(topology.links.map((link) => link.label));
  for (let index = 0; index < 26 * 20; index += 1) {
    const candidate = linkLabelAt(index);
    if (!used.has(candidate)) return candidate;
  }
  return `L${topology.links.length + 1}`;
}

function clone(topology: LogicTopology): LogicTopology {
  return structuredClone(topology);
}

export function addLogicNode(
  topology: LogicTopology,
  graphPosition: Vec2,
  patch: Partial<Pick<LogicNode, "name" | "role" | "floor" | "moduleId" | "note" | "relativePosition" | "relativeRotation" | "elevation" | "childScopeId" | "blocks">> = {},
): { topology: LogicTopology; node: LogicNode } {
  const next = clone(topology);
  const node: LogicNode = {
    id: createId("lnode"),
    name: patch.name?.trim() || `区域 ${next.nodes.length + 1}`,
    role: patch.role ?? "transition",
    floor: patch.floor ?? 0,
    graphPosition,
    relativePosition: patch.relativePosition ?? null,
    elevation: patch.elevation ?? null,
    note: patch.note ?? "",
    ...(patch.moduleId ? { moduleId: patch.moduleId } : {}),
    // 子层可以一开始就挂上（导入、迁移、复制整棵子树都用得上）
    ...(patch.childScopeId ? { childScopeId: patch.childScopeId } : {}),
    ...(patch.relativeRotation === undefined ? {} : { relativeRotation: patch.relativeRotation }),
    ...(patch.blocks ? { blocks: structuredClone(patch.blocks) } : {}),
  };
  next.nodes.push(node);
  next.startNodeId ??= node.id;
  return { topology: next, node };
}

export function updateLogicNode(topology: LogicTopology, nodeId: string, patch: Partial<Omit<LogicNode, "id">>): LogicTopology {
  const next = clone(topology);
  const node = next.nodes.find((item) => item.id === nodeId);
  if (!node) return topology;
  Object.assign(node, structuredClone(patch));
  if ("moduleId" in patch && !patch.moduleId) delete node.moduleId;
  return next;
}

/** 删除节点会连带删除其链路，并清理锁钥引用 */
export function removeLogicNode(topology: LogicTopology, nodeId: string): LogicTopology {
  if (!topology.nodes.some((item) => item.id === nodeId)) return topology;
  const next = clone(topology);
  const removedLinkIds = new Set(next.links.filter((link) => link.from === nodeId || link.to === nodeId).map((link) => link.id));
  next.nodes = next.nodes.filter((item) => item.id !== nodeId);
  next.links = next.links.filter((link) => !removedLinkIds.has(link.id));
  next.keys = next.keys
    .filter((key) => key.foundAt !== nodeId)
    .map((key) => ({ ...key, unlocks: key.unlocks.filter((id) => !removedLinkIds.has(id)) }));
  if (next.startNodeId === nodeId) next.startNodeId = next.nodes[0]?.id ?? null;
  return next;
}

export function addLogicLink(
  topology: LogicTopology,
  from: string,
  to: string,
  logic: LogicKind = "normal",
  handles: Pick<LogicLink, "sourceHandle" | "targetHandle"> = {},
): { topology: LogicTopology; link: LogicLink } | null {
  if (from === to) return null;
  if (!topology.nodes.some((item) => item.id === from) || !topology.nodes.some((item) => item.id === to)) return null;
  const next = clone(topology);
  const link: LogicLink = {
    id: createId("llink"),
    label: nextLinkLabel(next),
    from,
    to,
    ...handles,
    logic,
    traversal: defaultTraversal(logic),
    requires: null,
    note: "",
  };
  next.links.push(link);
  return { topology: next, link };
}

export function updateLogicLink(topology: LogicTopology, linkId: string, patch: Partial<Omit<LogicLink, "id">>): LogicTopology {
  const next = clone(topology);
  const link = next.links.find((item) => item.id === linkId);
  if (!link) return topology;
  const previousLogic = link.logic;
  Object.assign(link, structuredClone(patch));
  // 改了链路类型但没有显式改方向时，方向跟随类型的默认语义
  if (patch.logic && patch.logic !== previousLogic && patch.traversal === undefined) {
    link.traversal = defaultTraversal(patch.logic);
  }
  // 不再是锁钥门就断开钥匙引用
  if (link.logic !== "locked-door") {
    link.requires = null;
    next.keys = next.keys.map((key) => ({ ...key, unlocks: key.unlocks.filter((id) => id !== link.id) }));
  }
  return next;
}

export function removeLogicLink(topology: LogicTopology, linkId: string): LogicTopology {
  if (!topology.links.some((item) => item.id === linkId)) return topology;
  const next = clone(topology);
  next.links = next.links.filter((item) => item.id !== linkId);
  next.keys = next.keys.map((key) => ({ ...key, unlocks: key.unlocks.filter((id) => id !== linkId) }));
  return next;
}

/** 新建钥匙并直接挂到指定锁钥门上 */
export function addLogicKey(topology: LogicTopology, foundAt: string, linkId: string, name?: string): { topology: LogicTopology; key: LogicKey } | null {
  const link = topology.links.find((item) => item.id === linkId);
  if (!link || !topology.nodes.some((item) => item.id === foundAt)) return null;
  const next = clone(topology);
  const key: LogicKey = {
    id: createId("lkey"),
    name: name?.trim() || `钥匙 ${next.keys.length + 1}`,
    foundAt,
    unlocks: [linkId],
    note: "",
  };
  next.keys.push(key);
  const target = next.links.find((item) => item.id === linkId);
  if (target) target.requires = key.id;
  return { topology: next, key };
}

export function updateLogicKey(topology: LogicTopology, keyId: string, patch: Partial<Omit<LogicKey, "id">>): LogicTopology {
  const next = clone(topology);
  const key = next.keys.find((item) => item.id === keyId);
  if (!key) return topology;
  Object.assign(key, structuredClone(patch));
  return next;
}

export function removeLogicKey(topology: LogicTopology, keyId: string): LogicTopology {
  if (!topology.keys.some((item) => item.id === keyId)) return topology;
  const next = clone(topology);
  next.keys = next.keys.filter((item) => item.id !== keyId);
  next.links = next.links.map((link) => (link.requires === keyId ? { ...link, requires: null } : link));
  return next;
}

export function setStartNode(topology: LogicTopology, nodeId: string | null): LogicTopology {
  if (nodeId && !topology.nodes.some((item) => item.id === nodeId)) return topology;
  return { ...clone(topology), startNodeId: nodeId };
}

export function bindNodeModule(topology: LogicTopology, nodeId: string, moduleId: string | undefined): LogicTopology {
  return updateLogicNode(topology, nodeId, { moduleId });
}

/**
 * 为新节点挑一个空位。
 * 必须在 store 里基于最新拓扑调用：如果在组件里用渲染时的 nodes.length 推算，
 * 连续快速创建会读到同一个旧值，导致多个节点叠在同一格。
 */
export function nextNodePosition(topology: LogicTopology): Vec2 {
  const taken = new Set(topology.nodes.map((node) => `${Math.round(node.graphPosition[0])},${Math.round(node.graphPosition[1])}`));
  const columns = 4;
  for (let index = 0; index < 400; index += 1) {
    const position: Vec2 = [240 + (index % columns) * 280, 160 + Math.floor(index / columns) * 180];
    if (!taken.has(`${position[0]},${position[1]}`)) return position;
  }
  return [240, 160];
}

/** 按"从起点出发的层数"自动排版；只影响 graphPosition，不产生任何世界坐标 */export function autoLayoutTopology(topology: LogicTopology): LogicTopology {
  if (topology.nodes.length === 0) return topology;
  const next = clone(topology);
  const adjacency = new Map<string, string[]>();
  for (const node of next.nodes) adjacency.set(node.id, []);
  for (const link of next.links) {
    adjacency.get(link.from)?.push(link.to);
    adjacency.get(link.to)?.push(link.from);
  }
  const depth = new Map<string, number>();
  const queue: string[] = [];
  const root = next.startNodeId ?? next.nodes[0].id;
  depth.set(root, 0);
  queue.push(root);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentDepth = depth.get(current) ?? 0;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (depth.has(neighbor)) continue;
      depth.set(neighbor, currentDepth + 1);
      queue.push(neighbor);
    }
  }
  // 未被连通的节点单独放到最后一列
  const orphanDepth = Math.max(0, ...[...depth.values()]) + 1;
  for (const node of next.nodes) if (!depth.has(node.id)) depth.set(node.id, orphanDepth);

  const rows = new Map<number, number>();
  for (const node of next.nodes) {
    const column = depth.get(node.id) ?? 0;
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    node.graphPosition = [120 + column * 260, 120 + row * 150];
  }
  return next;
}

export function topologyStats(topology: LogicTopology): { nodes: number; links: number; keys: number; oneWay: number; locked: number; placed: number; located: number } {
  return {
    nodes: topology.nodes.length,
    links: topology.links.length,
    keys: topology.keys.length,
    oneWay: topology.links.filter((link) => link.traversal !== "both").length,
    locked: topology.links.filter((link) => link.logic === "locked-door").length,
    placed: topology.nodes.filter((node) => node.relativePosition).length,
    located: topology.nodes.filter((node) => node.elevation).length,
  };
}

export { createEmptyTopology };
export type { LogicNodeRole };

/* ---------------- 输入上下文包 ---------------- */

function withInputs(topology: LogicTopology, items: LogicInputItem[]): LogicTopology {
  const next = clone(topology);
  next.inputs = {
    revision: topology.inputs.revision + 1,
    items,
    digest: computeInputsDigest(items),
    updatedAt: new Date().toISOString(),
  };
  return next;
}

export interface InputDraft {
  kind: LogicInputKind;
  name: string;
  ref?: string;
  imageData?: string;
  pixelSize?: [number, number] | null;
  text?: string;
  note?: string;
  calibration?: LogicInputCalibration | null;
}

export function addInput(topology: LogicTopology, draft: InputDraft): { topology: LogicTopology; item: LogicInputItem } {
  const item: LogicInputItem = {
    id: createId("linput"),
    kind: draft.kind,
    name: draft.name.trim() || INPUT_KINDS[draft.kind].label,
    ref: draft.ref ?? "",
    imageData: draft.imageData ?? "",
    pixelSize: draft.pixelSize ?? null,
    text: draft.text ?? "",
    note: draft.note ?? "",
    addedAt: new Date().toISOString(),
    calibration: draft.calibration ?? null,
  };
  return { topology: withInputs(topology, [...topology.inputs.items, item]), item };
}

export function updateInput(topology: LogicTopology, inputId: string, patch: Partial<Omit<LogicInputItem, "id">>): LogicTopology {
  if (!topology.inputs.items.some((item) => item.id === inputId)) return topology;
  const items = topology.inputs.items.map((item) => item.id === inputId ? { ...structuredClone(item), ...structuredClone(patch) } : item);
  return withInputs(topology, items);
}

export function removeInput(topology: LogicTopology, inputId: string): LogicTopology {
  if (!topology.inputs.items.some((item) => item.id === inputId)) return topology;
  return withInputs(topology, topology.inputs.items.filter((item) => item.id !== inputId));
}

/**
 * 登记一次拆解结果：记录它依据的输入 digest。
 * 之后输入一变，这条提案立刻可被判为过期，而不是悄悄沿用旧结论。
 */
export function recordProposal(topology: LogicTopology, note = ""): { topology: LogicTopology; proposal: DecompositionProposal } {
  const proposal: DecompositionProposal = {
    id: createId("lproposal"),
    basedOnInputsDigest: topology.inputs.digest,
    basedOnInputsRevision: topology.inputs.revision,
    createdAt: new Date().toISOString(),
    nodeCount: topology.nodes.length,
    linkCount: topology.links.length,
    keyCount: topology.keys.length,
    note,
  };
  const next = clone(topology);
  next.proposals = [...next.proposals, proposal];
  return { topology: next, proposal };
}

export function dropProposals(topology: LogicTopology): LogicTopology {
  if (topology.proposals.length === 0) return topology;
  const next = clone(topology);
  next.proposals = [];
  return next;
}

/* ---------------- 横向拆解 ---------------- */

export type DecompositionEdit = {
  positions?: { nodeId: string; position: [number, number] }[];
  assignments?: { nodeId: string; moduleId: string | null }[];
};

/** 一次拖放同时提交排版与归属；任何无效引用都拒绝整次操作。 */
export function editDecomposition(topology: LogicTopology, edit: DecompositionEdit): LogicTopology {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const moduleIds = new Set(topology.modules.map((module) => module.id));
  const positions = new Map<string, [number, number]>();
  const assignments = new Map<string, string | null>();
  for (const { nodeId, position } of edit.positions ?? []) {
    if (!nodes.has(nodeId) || !position.every(Number.isFinite)) return topology;
    positions.set(nodeId, position);
  }
  for (const { nodeId, moduleId } of edit.assignments ?? []) {
    if (!nodes.has(nodeId) || (moduleId !== null && !moduleIds.has(moduleId))) return topology;
    assignments.set(nodeId, moduleId);
  }
  for (const [nodeId, position] of positions) {
    const current = nodes.get(nodeId)!.graphPosition;
    if (current[0] === position[0] && current[1] === position[1]) positions.delete(nodeId);
  }
  for (const [nodeId, moduleId] of assignments) {
    const owners = topology.modules.flatMap((module) => module.nodeIds.filter((id) => id === nodeId).map(() => module.id));
    if ((moduleId === null && owners.length === 0) || (owners.length === 1 && owners[0] === moduleId)) assignments.delete(nodeId);
  }
  if (positions.size === 0 && assignments.size === 0) return topology;
  const next = clone(topology);
  for (const node of next.nodes) {
    const position = positions.get(node.id);
    if (position) node.graphPosition = [...position];
  }
  for (const [nodeId, moduleId] of assignments) assign(next, nodeId, moduleId);
  return next;
}

/**
 * 套用拆解提案：整体替换模块划分。
 * 这是有意为之 —— "用这份方案重新划分"本来就是一个整体决定，且整次提交可撤销。
 */
export function applyDecomposition(topology: LogicTopology, candidate: DecompositionCandidate): { topology: LogicTopology; moduleIds: string[] } {
  const next = clone(topology);
  const moduleIds: string[] = [];
  next.modules = candidate.modules.map((module) => {
    const id = createId("lmodule");
    moduleIds.push(id);
    return { id, name: module.name.trim() || `模块 ${moduleIds.length}`, nodeIds: [...module.nodeIds], note: module.note };
  });
  return { topology: next, moduleIds };
}

export function createLogicModule(topology: LogicTopology, name: string, nodeIds: string[] = []): { topology: LogicTopology; module: LogicModule } {
  const next = clone(topology);
  const module: LogicModule = {
    id: createId("lmodule"),
    name: name.trim() || `模块 ${next.modules.length + 1}`,
    nodeIds: [],
    note: "",
  };
  next.modules.push(module);
  for (const nodeId of nodeIds) assign(next, nodeId, module.id);
  return { topology: next, module };
}

/** 把一个节点划到某个模块；传 null 表示取消分配。节点只会属于一个模块。 */
export function setNodeModule(topology: LogicTopology, nodeId: string, moduleId: string | null): LogicTopology {
  if (!topology.nodes.some((node) => node.id === nodeId)) return topology;
  if (moduleId && !topology.modules.some((module) => module.id === moduleId)) return topology;
  const next = clone(topology);
  assign(next, nodeId, moduleId);
  return next;
}

function assign(topology: LogicTopology, nodeId: string, moduleId: string | null): void {
  for (const module of topology.modules) {
    module.nodeIds = module.nodeIds.filter((id) => id !== nodeId);
  }
  if (!moduleId) return;
  topology.modules.find((module) => module.id === moduleId)?.nodeIds.push(nodeId);
}

export function updateLogicModule(topology: LogicTopology, moduleId: string, patch: Partial<Pick<LogicModule, "name" | "note">>): LogicTopology {
  const next = clone(topology);
  const module = next.modules.find((item) => item.id === moduleId);
  if (!module) return topology;
  Object.assign(module, structuredClone(patch));
  return next;
}

/** 删除模块只解散分组，不删除区域本身 */
export function removeLogicModule(topology: LogicTopology, moduleId: string): LogicTopology {
  if (!topology.modules.some((module) => module.id === moduleId)) return topology;
  const next = clone(topology);
  next.modules = next.modules.filter((module) => module.id !== moduleId);
  return next;
}

/** 确定性兜底：一个区域一个模块，得到一个合法但未合并的初始划分 */
export function seedModulesFromNodes(topology: LogicTopology): LogicTopology {
  const next = clone(topology);
  next.modules = next.nodes.map((node, index) => ({
    id: createId("lmodule"),
    name: node.name || `模块 ${index + 1}`,
    nodeIds: [node.id],
    note: "",
  }));
  return next;
}

/* ---------------- 套用识别候选 ---------------- */

export interface AppliedCandidateSummary {
  nodeIds: string[];
  linkIds: string[];
  keyIds: string[];
  placed: number;
}

/**
 * 把范围图上的像素点等比映射到画布区域。
 * 画布坐标只是排版，不能直接拿相对位置（厘米，动辄上千）当画布坐标用 ——
 * 两套坐标系混用会把已有节点挤成看不见的小点。
 */
function scopeMapLayout(points: Vec2[]): ((point: Vec2) => Vec2) | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(1, Math.max(...xs) - minX);
  const height = Math.max(1, Math.max(...ys) - minY);
  const scale = Math.min(900 / width, 600 / height, 1.4);
  return (point) => [160 + (point[0] - minX) * scale, 140 + (point[1] - minY) * scale];
}

/**
 * 把识别候选套用成真实拓扑。整体是一次可撤销事务；只新增，不删除已有内容。
 * 范围图像素在这里按标定换算成父级局部厘米，换算方式与图纸导入完全一致。
 */
export function applyCandidate(topology: LogicTopology, candidate: RecognitionCandidate): { topology: LogicTopology; applied: AppliedCandidateSummary } {
  let next = topology;
  const scopeMap = candidate.scopeMapInputId ? topology.inputs.items.find((item) => item.id === candidate.scopeMapInputId) ?? null : null;
  const calibration = scopeMap?.calibration ?? null;
  const layout = scopeMapLayout(candidate.nodes.map((node) => node.scopeMapPoint).filter((point): point is Vec2 => Boolean(point)));

  const nodeIdByTemp = new Map<string, string>();
  const linkIdByTemp = new Map<string, string>();
  const keyIdByTemp = new Map<string, string>();
  let placed = 0;

  for (const candidateNode of candidate.nodes) {
    const relativePosition = candidateNode.scopeMapPoint ? toRelativePosition(candidateNode.scopeMapPoint, calibration) : null;
    if (relativePosition) placed += 1;
    // 画布排版用范围图像素的等比映射；相对位置另存，不参与排版
    const graphPosition: Vec2 = (candidateNode.scopeMapPoint && layout?.(candidateNode.scopeMapPoint)) || nextNodePosition(next);
    const result = addLogicNode(next, graphPosition, {
      name: candidateNode.name,
      role: candidateNode.role,
      floor: candidateNode.floor,
      note: candidateNode.note,
      relativePosition,
      elevation: candidateNode.elevation,
    });
    next = result.topology;
    nodeIdByTemp.set(candidateNode.tempId, result.node.id);
  }

  for (const candidateLink of candidate.links) {
    const from = nodeIdByTemp.get(candidateLink.from);
    const to = nodeIdByTemp.get(candidateLink.to);
    if (!from || !to) continue;
    const result = addLogicLink(next, from, to, candidateLink.logic);
    if (!result) continue;
    // 标签必须唯一：沿用 addLogicLink 分配的新标签，把图上的标注记进备注以便回溯
    next = updateLogicLink(result.topology, result.link.id, {
      traversal: candidateLink.traversal,
      note: [candidateLink.note, candidateLink.label ? `图上标注 ${candidateLink.label}` : ""].filter(Boolean).join(" · "),
    });
    linkIdByTemp.set(candidateLink.tempId, result.link.id);
  }

  for (const candidateKey of candidate.keys) {
    const foundAt = nodeIdByTemp.get(candidateKey.foundAt);
    const firstUnlock = candidateKey.unlocks.map((tempId) => linkIdByTemp.get(tempId)).find(Boolean);
    if (!foundAt || !firstUnlock) continue;
    const result = addLogicKey(next, foundAt, firstUnlock, candidateKey.name);
    if (!result) continue;
    next = result.topology;
    keyIdByTemp.set(candidateKey.tempId, result.key.id);
  }

  // 锁钥门的 requires 以候选为准（一把钥匙可能解锁多条链路）
  for (const candidateLink of candidate.links) {
    if (!candidateLink.requiresKey) continue;
    const linkId = linkIdByTemp.get(candidateLink.tempId);
    const keyId = keyIdByTemp.get(candidateLink.requiresKey);
    if (!linkId || !keyId) continue;
    next = updateLogicLink(next, linkId, { requires: keyId });
  }

  return {
    topology: next,
    applied: {
      nodeIds: [...nodeIdByTemp.values()],
      linkIds: [...linkIdByTemp.values()],
      keyIds: [...keyIdByTemp.values()],
      placed,
    },
  };
}
