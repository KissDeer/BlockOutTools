import type { Vec2 } from "./types";
import {
  createEmptyTopology,
  defaultTraversal,
  type LogicKey,
  type LogicKind,
  type LogicLink,
  type LogicNode,
  type LogicNodeRole,
  type LogicTopology,
} from "./concept";
import { createId } from "./ids";
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
 * 登记一条基准：把"此刻这批参考材料的指纹"和"此刻的拓扑规模"绑成一条记录。
 * 之后材料一变，这条基准立刻可被判为过期，而不是悄悄沿用旧结论。
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

/* ---------------- 画布排版 ---------------- */

export type NodePositionEdit = { nodeId: string; position: [number, number] };

/**
 * 把一批节点挪到新位置（画布拖放）。
 *
 * 只动 `graphPosition`，**不碰任何几何**：排版坐标无语义，改它不该影响 3D 或 UE。
 * 任何无效引用都拒绝整次操作，避免一半拖放被提交上去。
 */
export function moveNodes(topology: LogicTopology, positions: NodePositionEdit[]): LogicTopology {
  const nodes = new Map(topology.nodes.map((node) => [node.id, node]));
  const moves = new Map<string, [number, number]>();
  for (const { nodeId, position } of positions) {
    if (!nodes.has(nodeId) || !position.every(Number.isFinite)) return topology;
    const current = nodes.get(nodeId)!.graphPosition;
    if (current[0] !== position[0] || current[1] !== position[1]) moves.set(nodeId, position);
  }
  if (moves.size === 0) return topology;
  const next = clone(topology);
  for (const node of next.nodes) {
    const position = moves.get(node.id);
    if (position) node.graphPosition = [...position];
  }
  return next;
}

