import { allowsBackward, LOGIC_KINDS, type LogicTopology } from "./concept";

export interface ConceptIssue {
  id: string;
  severity: "error" | "warning" | "info";
  rule: string;
  message: string;
  /** 点击问题后需要选中的对象 */
  nodeIds: string[];
  linkIds: string[];
}

/**
 * 逻辑拓扑校验。
 * 只判断"逻辑上走不走得通"，不涉及尺寸、几何或真实位置。
 */
export function validateTopology(topology: LogicTopology): ConceptIssue[] {
  const issues: ConceptIssue[] = [];
  const { nodes, links, keys } = topology;

  if (nodes.length === 0) {
    return [{
      id: "topo:empty", severity: "info", rule: "TOPO_EMPTY",
      message: "还没有逻辑节点。先添加区域，再用逻辑链路把它们连起来。",
      nodeIds: [], linkIds: [],
    }];
  }

  /* ---- 结构性错误 ---- */
  for (const link of links) {
    if (link.from === link.to) {
      issues.push({
        id: `topo:self:${link.id}`, severity: "error", rule: "TOPO_SELF_LINK",
        message: `链路 ${link.label} 的两端是同一个节点`,
        nodeIds: [link.from], linkIds: [link.id],
      });
    }
    if (link.logic === "locked-door" && !link.requires) {
      issues.push({
        id: `topo:key-missing:${link.id}`, severity: "error", rule: "TOPO_KEY_MISSING",
        message: `锁钥门 ${link.label} 还没有指定钥匙，玩家将永远无法通过`,
        nodeIds: [link.from, link.to], linkIds: [link.id],
      });
    }
  }

  /* ---- 钥匙没有解锁任何门 ---- */
  for (const key of topology.keys) {
    if (key.unlocks.length > 0) continue;
    issues.push({
      id: `topo:key-unused:${key.id}`, severity: "warning", rule: "TOPO_KEY_UNUSED",
      message: `钥匙“${key.name}”没有解锁任何锁钥门`,
      nodeIds: [key.foundAt], linkIds: [],
    });
  }

  /* ---- 孤立节点 ---- */
  const degree = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  for (const link of links) {
    degree.set(link.from, (degree.get(link.from) ?? 0) + 1);
    degree.set(link.to, (degree.get(link.to) ?? 0) + 1);
  }
  for (const node of nodes) {
    if ((degree.get(node.id) ?? 0) === 0) {
      issues.push({
        id: `topo:orphan:${node.id}`, severity: "warning", rule: "TOPO_ORPHAN",
        message: `“${node.name}”没有任何链路连接，是孤立区域`,
        nodeIds: [node.id], linkIds: [],
      });
    }
  }

  /* ---- 起点与可达性（含锁钥推进分析） ---- */
  if (!topology.startNodeId) {
    issues.push({
      id: "topo:no-start", severity: "warning", rule: "TOPO_NO_START",
      message: "没有指定起点，无法判断玩家能不能走到各个区域",
      nodeIds: [], linkIds: [],
    });
  }

  const { reachable, keysHeld, keyLocation } = analyze(topology);

  if (topology.startNodeId && reachable.size > 0) {
    for (const node of nodes) {
      if (reachable.has(node.id)) continue;
      issues.push({
        id: `topo:unreachable:${node.id}`, severity: "error", rule: "TOPO_UNREACHABLE",
        message: `从起点出发走不到“${node.name}”（单向链路或缺少钥匙）`,
        nodeIds: [node.id], linkIds: [],
      });
    }
  }

  /* ---- 锁钥死锁：钥匙藏在只有开这扇门才能到的地方 ---- */
  for (const link of links) {
    if (link.logic !== "locked-door" || !link.requires) continue;
    const key = keys.find((item) => item.id === link.requires);
    if (!key) continue;
    if (!reachable.has(key.foundAt)) {
      const where = nodes.find((node) => node.id === key.foundAt)?.name ?? "未知区域";
      issues.push({
        id: `topo:key-deadlock:${link.id}`, severity: "error", rule: "TOPO_KEY_DEADLOCK",
        message: `死锁：门 ${link.label} 需要“${key.name}”，但钥匙在“${where}”，而那里必须先开这扇门才能到达`,
        nodeIds: [key.foundAt, link.from, link.to], linkIds: [link.id],
      });
    }
  }

  /* ---- 单向链路：有去无回提示 ---- */
  const canReturn = canReachStart(topology);
  for (const node of nodes) {
    if (!reachable.has(node.id) || canReturn.has(node.id)) continue;
    if (node.role === "boss" || node.role === "reward" || node.role === "secret") continue; // 终点型区域有去无回是正常的
    issues.push({
      id: `topo:no-return:${node.id}`, severity: "info", rule: "TOPO_NO_RETURN",
      message: `到了“${node.name}”之后回不到起点（若这是有意的单向推进可忽略）`,
      nodeIds: [node.id], linkIds: [],
    });
  }

  /* ---- 环路：类魂关卡通常需要环路与捷径 ---- */
  const loopLinks = findLoopLinks(topology);
  if (loopLinks.length > 0) {
    issues.push({
      id: "topo:loop", severity: "info", rule: "TOPO_LOOP",
      message: `存在 ${loopLinks.length} 条形成环路的链路（${loopLinks.map((link) => link.label).join("、")}），类魂关卡通常靠环路缩短回程`,
      nodeIds: [], linkIds: loopLinks.map((link) => link.id),
    });
  }

  /* ---- 定位：相对位置来自范围图拆解 ---- */
  const unplaced = nodes.filter((node) => !node.relativePosition);
  if (unplaced.length > 0) {
    issues.push({
      id: "topo:unplaced", severity: "info", rule: "TOPO_UNPLACED",
      message: `有 ${unplaced.length} 个区域还没有相对位置（尚未按范围图定位）`,
      nodeIds: unplaced.map((node) => node.id), linkIds: [],
    });
  }

  /* ---- 同一对区域之间的多条链路 ---- */
  const pairs = new Map<string, typeof links>();
  for (const link of links) {
    const key = [link.from, link.to].sort().join("|");
    pairs.set(key, [...(pairs.get(key) ?? []), link]);
  }
  for (const group of pairs.values()) {
    if (group.length < 2) continue;
    const names = group.map((link) => `${link.label}(${LOGIC_KINDS[link.logic].label})`).join("、");
    issues.push({
      id: `topo:multi:${group[0].id}`, severity: "info", rule: "TOPO_PARALLEL_LINKS",
      message: `同一对区域之间有 ${group.length} 条链路：${names}`,
      nodeIds: [group[0].from, group[0].to], linkIds: group.map((link) => link.id),
    });
  }

  return issues;
}

/** 从起点推进：能到的区域、能拿到的钥匙。锁钥门在拿到钥匙前不可通过。 */
function analyze(topology: LogicTopology): { reachable: Set<string>; keysHeld: Set<string>; keyLocation: Map<string, string> } {
  const keyLocation = new Map(topology.keys.map((key) => [key.id, key.foundAt]));
  const reachable = new Set<string>();
  const keysHeld = new Set<string>();
  if (!topology.startNodeId) return { reachable, keysHeld, keyLocation };
  reachable.add(topology.startNodeId);

  let changed = true;
  while (changed) {
    changed = false;
    for (const key of topology.keys) {
      if (reachable.has(key.foundAt) && !keysHeld.has(key.id)) {
        keysHeld.add(key.id);
        changed = true;
      }
    }
    for (const link of topology.links) {
      if (link.requires && !keysHeld.has(link.requires)) continue;
      if (reachable.has(link.from) && !reachable.has(link.to)) {
        reachable.add(link.to);
        changed = true;
      }
      if (allowsBackward(link) && reachable.has(link.to) && !reachable.has(link.from)) {
        reachable.add(link.from);
        changed = true;
      }
    }
  }
  return { reachable, keysHeld, keyLocation };
}

/** 哪些区域可以走回起点（在反图上从起点搜索） */
function canReachStart(topology: LogicTopology): Set<string> {
  const result = new Set<string>();
  if (!topology.startNodeId) return result;
  // 反图：存在边 x→y 当且仅当原图中 y→x 可通行
  const reverse = new Map<string, string[]>();
  const push = (from: string, to: string) => reverse.set(from, [...(reverse.get(from) ?? []), to]);
  for (const link of topology.links) {
    push(link.to, link.from);                       // 正向可通行 → 反图 to→from
    if (allowsBackward(link)) push(link.from, link.to);
  }
  const queue = [topology.startNodeId];
  result.add(topology.startNodeId);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of reverse.get(current) ?? []) {
      if (result.has(next)) continue;
      result.add(next);
      queue.push(next);
    }
  }
  return result;
}

/** 用并查集找出"接上就会成环"的链路 */
function findLoopLinks(topology: LogicTopology): LogicTopology["links"] {
  const parent = new Map<string, string>(topology.nodes.map((node) => [node.id, node.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const loops: LogicTopology["links"] = [];
  for (const link of topology.links) {
    const a = find(link.from);
    const b = find(link.to);
    if (a === b) loops.push(link);
    else parent.set(a, b);
  }
  return loops;
}

export function summarizeIssues(issues: ConceptIssue[]): { error: number; warning: number; info: number } {
  return {
    error: issues.filter((issue) => issue.severity === "error").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

/** 交付门：错误为 0 才能交给阶段二 */
export function canDeliver(topology: LogicTopology): { ok: boolean; blockers: ConceptIssue[] } {
  const blockers = validateTopology(topology).filter((issue) => issue.severity === "error");
  return { ok: blockers.length === 0, blockers };
}
