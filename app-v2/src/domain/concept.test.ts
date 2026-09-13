import { describe, expect, it } from "vitest";
import {
  createEmptyTopology,
  logicTopologySchema,
  type LogicNode,
  type LogicTopology,
} from "./concept";
import {
  addLogicKey,
  addLogicLink,
  addLogicNode,
  autoLayoutTopology,
  nextNodePosition,
  removeLogicNode,
  updateLogicLink,
} from "./concept-commands";
import { canDeliver, summarizeIssues, validateTopology } from "./concept-validation";

/** 建一张只有节点的小图；位置只用于排版，测试里不关心 */
function chain(count: number): { topology: LogicTopology; nodes: LogicNode[] } {
  let topology = createEmptyTopology();
  const nodes: LogicNode[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = addLogicNode(topology, [index * 240, 160]);
    topology = result.topology;
    nodes.push(result.node);
  }
  return { topology, nodes };
}

function link(topology: LogicTopology, from: string, to: string, logic: Parameters<typeof addLogicLink>[3] = "normal"): LogicTopology {
  const result = addLogicLink(topology, from, to, logic);
  if (!result) throw new Error("测试用例的链路不合法");
  return result.topology;
}

function rules(topology: LogicTopology): string[] {
  return validateTopology(topology).map((issue) => issue.rule);
}

describe("逻辑拓扑：数据与命令", () => {
  it("空拓扑可以通过 schema", () => {
    expect(logicTopologySchema.parse(createEmptyTopology()).nodes).toHaveLength(0);
  });

  it("第一个节点自动成为起点", () => {
    const { topology, nodes } = chain(2);
    expect(topology.startNodeId).toBe(nodes[0].id);
  });

  it("链路方向跟随类型默认语义", () => {
    const { topology, nodes } = chain(2);
    const normal = addLogicLink(topology, nodes[0].id, nodes[1].id, "normal");
    const drop = addLogicLink(topology, nodes[0].id, nodes[1].id, "drop");
    const shortcut = addLogicLink(topology, nodes[0].id, nodes[1].id, "shortcut");
    expect(normal?.link.traversal).toBe("both");
    expect(drop?.link.traversal).toBe("forward");
    expect(shortcut?.link.traversal).toBe("forward");
  });

  it("改链路类型会同步方向，除非显式指定", () => {
    const { topology, nodes } = chain(2);
    const created = addLogicLink(topology, nodes[0].id, nodes[1].id, "normal");
    if (!created) throw new Error("链路创建失败");
    const changed = updateLogicLink(created.topology, created.link.id, { logic: "one-way-door" });
    expect(changed.links[0].traversal).toBe("forward");
    const pinned = updateLogicLink(created.topology, created.link.id, { logic: "one-way-door", traversal: "both" });
    expect(pinned.links[0].traversal).toBe("both");
  });

  it("删除区域会连带删除链路，钥匙保留但失去解锁目标", () => {
    const { topology, nodes } = chain(3);
    const withLink = link(topology, nodes[0].id, nodes[1].id, "locked-door");
    const withKey = addLogicKey(withLink, nodes[2].id, withLink.links[0].id, "铁钥匙");
    if (!withKey) throw new Error("钥匙创建失败");
    const removed = removeLogicNode(withKey.topology, nodes[0].id);
    expect(removed.nodes).toHaveLength(2);
    expect(removed.links).toHaveLength(0);
    // 钥匙在 C 取得，C 还在，所以钥匙保留；只是解锁目标随链路一起消失了
    expect(removed.keys).toHaveLength(1);
    expect(removed.keys[0].unlocks).toHaveLength(0);
    expect(rules(removed)).toContain("TOPO_KEY_UNUSED");
    expect(removed.startNodeId).toBe(nodes[1].id);
  });

  it("新节点位置会避开已占用的格子（防止连续创建时叠在同一点）", () => {
    let topology = createEmptyTopology();
    const positions: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const result = addLogicNode(topology, nextNodePosition(topology));
      topology = result.topology;
      positions.push(result.node.graphPosition.join(","));
    }
    expect(positions).toHaveLength(6);
    expect(new Set(positions).size).toBe(6);
  });

  it("自动排版给每个节点分配位置", () => {    const { topology, nodes } = chain(3);
    const linked = link(link(topology, nodes[0].id, nodes[1].id), nodes[1].id, nodes[2].id);
    const laid = autoLayoutTopology(linked);
    expect(laid.nodes.every((node) => Array.isArray(node.graphPosition))).toBe(true);
    expect(new Set(laid.nodes.map((node) => node.graphPosition[0])).size).toBeGreaterThan(1);
  });
});

describe("逻辑拓扑：校验", () => {
  it("孤立区域报待定，且从起点不可达报错误", () => {
    const { topology, nodes } = chain(2);
    const rulesFound = rules(topology);
    expect(rulesFound).toContain("TOPO_UNREACHABLE");
    expect(rulesFound).toContain("TOPO_ORPHAN");
    expect(nodes).toHaveLength(2);
  });

  it("锁钥门没有钥匙直接报错", () => {
    const { topology, nodes } = chain(2);
    expect(rules(link(topology, nodes[0].id, nodes[1].id, "locked-door"))).toContain("TOPO_KEY_MISSING");
  });

  it("钥匙藏在自己锁的门后面 → 死锁错误", () => {
    const { topology, nodes } = chain(3);
    const linked = link(topology, nodes[0].id, nodes[1].id, "locked-door");
    const linkedAgain = link(linked, nodes[1].id, nodes[2].id);
    // 钥匙放在 C，而 C 必须先开这扇锁钥门才能到
    const withKey = addLogicKey(linkedAgain, nodes[2].id, linkedAgain.links[0].id, "铁钥匙");
    if (!withKey) throw new Error("钥匙创建失败");
    expect(rules(withKey.topology)).toContain("TOPO_KEY_DEADLOCK");
  });

  it("钥匙放在起点可达的位置 → 没有死锁", () => {
    const { topology, nodes } = chain(3);
    const linked = link(topology, nodes[0].id, nodes[1].id, "locked-door");
    const linkedAgain = link(linked, nodes[0].id, nodes[2].id);
    const withKey = addLogicKey(linkedAgain, nodes[2].id, linkedAgain.links[0].id, "铁钥匙");
    if (!withKey) throw new Error("钥匙创建失败");
    expect(rules(withKey.topology)).not.toContain("TOPO_KEY_DEADLOCK");
    expect(rules(withKey.topology)).not.toContain("TOPO_UNREACHABLE");
  });

  it("单向链路导致有去无回时给出提示", () => {
    const { topology, nodes } = chain(2);
    expect(rules(link(topology, nodes[0].id, nodes[1].id, "drop"))).toContain("TOPO_NO_RETURN");
  });

  it("终点型区域有去无回不提示", () => {
    let topology = createEmptyTopology();
    const first = addLogicNode(topology, [0, 0]);
    topology = first.topology;
    const boss = addLogicNode(topology, [240, 0], { role: "boss" });
    topology = boss.topology;
    expect(rules(link(topology, first.node.id, boss.node.id, "drop"))).not.toContain("TOPO_NO_RETURN");
  });

  it("环路会被识别为正面信号", () => {
    const { topology, nodes } = chain(3);
    const looped = link(link(link(topology, nodes[0].id, nodes[1].id), nodes[1].id, nodes[2].id), nodes[2].id, nodes[0].id);
    const issues = validateTopology(looped);
    expect(issues.some((issue) => issue.rule === "TOPO_LOOP")).toBe(true);
  });

  it("同一对区域的多条链路会被标注", () => {
    const { topology, nodes } = chain(2);
    const doubled = link(link(topology, nodes[0].id, nodes[1].id, "normal"), nodes[1].id, nodes[0].id, "shortcut");
    expect(rules(doubled)).toContain("TOPO_PARALLEL_LINKS");
  });
});

describe("交付门", () => {
  it("有错误时拦住", () => {
    const { topology } = chain(2);
    const gate = canDeliver(topology);
    expect(gate.ok).toBe(false);
    expect(gate.blockers.length).toBeGreaterThan(0);
  });

  it("干净的拓扑放行", () => {
    const { topology, nodes } = chain(2);
    const clean = link(topology, nodes[0].id, nodes[1].id, "stairs");
    const gate = canDeliver(clean);
    expect(gate.ok).toBe(true);
    expect(summarizeIssues(validateTopology(clean)).error).toBe(0);
  });
});
