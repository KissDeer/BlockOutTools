import { describe, expect, it } from "vitest";
import { computeTopologyDigest, createEmptyTopology, type LogicTopology } from "./concept";
import {
  addLogicLink,
  addLogicNode,
  applyDecomposition,
  createLogicModule,
  removeLogicModule,
  seedModulesFromNodes,
  setNodeModule,
} from "./concept-commands";
import {
  createEmptyDecompositionCandidate,
  deriveModuleLinks,
  internalLinkCount,
  summarizeDecomposition,
  validateDecomposition,
  validateDecompositionCandidate,
} from "./concept-decomposition";

/** 造一条 A→B→C 的链，返回拓扑与三个节点 id */
function chainOfThree(): { topology: LogicTopology; ids: string[] } {
  let topology = createEmptyTopology();
  const ids: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const created = addLogicNode(topology, [index * 260, 160], { name: ["入口", "中庭", "深处"][index] });
    topology = created.topology;
    ids.push(created.node.id);
  }
  const first = addLogicLink(topology, ids[0], ids[1], "normal");
  const second = first ? addLogicLink(first.topology, ids[1], ids[2], "stairs") : null;
  return { topology: second?.topology ?? topology, ids };
}

function rules(topology: LogicTopology): string[] {
  return validateDecomposition(topology).map((issue) => issue.id.split(":")[0] + ":" + issue.id.split(":")[1]);
}

describe("横向拆解：推导", () => {
  it("模块间连接只统计跨模块的链路", () => {
    const { topology, ids } = chainOfThree();
    const grouped = createLogicModule(topology, "整体", ids);
    expect(deriveModuleLinks(grouped.topology)).toHaveLength(0);
    expect(internalLinkCount(grouped.topology)).toBe(2);
  });

  it("拆成两个模块后，跨模块链路成为模块间连接", () => {
    const { topology, ids } = chainOfThree();
    let next = createLogicModule(topology, "前段", [ids[0], ids[1]]).topology;
    next = createLogicModule(next, "后段", [ids[2]]).topology;
    const links = deriveModuleLinks(next);
    expect(links).toHaveLength(1);
    expect(links[0].logic).toBe("stairs");
    expect(internalLinkCount(next)).toBe(1);
    expect(summarizeDecomposition(next)).toMatchObject({ modules: 2, assigned: 3, unassigned: 0, moduleLinks: 1, internal: 1 });
  });
});

describe("横向拆解：规则兜底校验", () => {
  it("没有未分配区域、模块图连通时没有 error", () => {
    const { topology, ids } = chainOfThree();
    let next = createLogicModule(topology, "前段", [ids[0], ids[1]]).topology;
    next = createLogicModule(next, "后段", [ids[2]]).topology;
    expect(validateDecomposition(next).filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("还有区域没分配 → error", () => {
    const { topology, ids } = chainOfThree();
    const next = createLogicModule(topology, "只装两个", [ids[0], ids[1]]).topology;
    const issues = validateDecomposition(next);
    expect(issues.some((issue) => issue.id === "dec:unassigned" && issue.severity === "error")).toBe(true);
  });

  it("节点被分到两个模块 → error（命令层不会产生，但要能识别脏数据）", () => {
    const { topology, ids } = chainOfThree();
    const grouped = createLogicModule(topology, "甲", [ids[0], ids[1]]).topology;
    const duplicated: LogicTopology = { ...grouped, modules: [...grouped.modules, { id: "dirty", name: "乙", nodeIds: [ids[1], ids[2]], note: "" }] };
    expect(validateDecomposition(duplicated).some((issue) => issue.id.startsWith("dec:dup") && issue.severity === "error")).toBe(true);
  });

  it("模块跨越两个逻辑层 → warning", () => {
    const { topology, ids } = chainOfThree();
    const raised: LogicTopology = { ...topology, nodes: topology.nodes.map((node) => node.id === ids[2] ? { ...node, floor: 1 } : node) };
    const grouped = createLogicModule(raised, "跨层", ids).topology;
    expect(rules(grouped)).toContain("dec:cross-floor");
  });

  it("模块没有任何对外连接 → warning", () => {
    const { topology, ids } = chainOfThree();
    // 加一个完全孤立的区域，单独成模块 —— 它既没有对外连接，也走不到
    const added = addLogicNode(topology, [900, 400], { name: "孤岛" });
    let next = createLogicModule(added.topology, "孤岛模块", [added.node.id]).topology;
    next = createLogicModule(next, "主链", ids).topology;
    const issues = validateDecomposition(next);
    expect(issues.some((issue) => issue.id.startsWith("dec:sealed") && issue.severity === "warning")).toBe(true);
    expect(issues.some((issue) => issue.id === "dec:disconnected" && issue.severity === "error")).toBe(true);
  });

  it("模块图不连通 → error", () => {
    const { topology, ids } = chainOfThree();
    // 断开 A→B，只留 B→C，再把 C 单独放一个模块
    const broken: LogicTopology = { ...topology, links: topology.links.slice(1) };
    let next = createLogicModule(broken, "前段", [ids[0]]).topology;
    next = createLogicModule(next, "后段", [ids[1], ids[2]]).topology;
    expect(rules(next)).toContain("dec:disconnected");
  });

  it("拆得过碎给出提示而不是报错", () => {
    const { topology } = chainOfThree();
    const seeded = seedModulesFromNodes(topology);
    const issues = validateDecomposition(seeded);
    expect(issues.some((issue) => issue.id === "dec:over-split" && issue.severity === "info")).toBe(false); // 只有 3 个模块，不到提示阈值
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });
});

describe("横向拆解：手工调整", () => {
  it("一个节点只会属于一个模块", () => {
    const { topology, ids } = chainOfThree();
    let next = createLogicModule(topology, "甲", [ids[0], ids[1]]).topology;
    next = createLogicModule(next, "乙", [ids[2]]).topology;
    const moved = setNodeModule(next, ids[1], next.modules[1].id);
    expect(moved.modules[0].nodeIds).toEqual([ids[0]]);
    expect(moved.modules[1].nodeIds).toEqual([ids[2], ids[1]]);
  });

  it("取消分配只是把节点移出模块", () => {
    const { topology, ids } = chainOfThree();
    const grouped = createLogicModule(topology, "甲", ids).topology;
    const cleared = setNodeModule(grouped, ids[0], null);
    expect(cleared.modules[0].nodeIds).toEqual([ids[1], ids[2]]);
    expect(cleared.nodes).toHaveLength(3);
  });

  it("删除模块不会删除区域", () => {
    const { topology, ids } = chainOfThree();
    const grouped = createLogicModule(topology, "甲", ids).topology;
    const removed = removeLogicModule(grouped, grouped.modules[0].id);
    expect(removed.modules).toHaveLength(0);
    expect(removed.nodes).toHaveLength(3);
  });
});

describe("横向拆解：提案校验与套用", () => {
  it("输入或拓扑变了就拦住提案", () => {
    const { topology, ids } = chainOfThree();
    const candidate = {
      ...createEmptyDecompositionCandidate(topology.inputs.digest, computeTopologyDigest(topology)),
      modules: [{ tempId: "m1", name: "全部", nodeIds: ids, note: "" }],
    };
    expect(validateDecompositionCandidate(candidate, topology).filter((issue) => issue.severity === "error")).toHaveLength(0);

    const added = addLogicNode(topology, [900, 900], { name: "新区域" });
    const stale = validateDecompositionCandidate(candidate, added.topology);
    expect(stale.some((issue) => issue.id === "dec-candidate:topology-stale" && issue.severity === "error")).toBe(true);
    expect(stale.some((issue) => issue.id === "dec-candidate:missing" && issue.severity === "warning")).toBe(true);
  });

  it("套用提案会整体替换划分", () => {
    const { topology, ids } = chainOfThree();
    const existing = createLogicModule(topology, "旧划分", [ids[0]]).topology;
    const candidate = {
      ...createEmptyDecompositionCandidate(existing.inputs.digest, computeTopologyDigest(existing)),
      modules: [
        { tempId: "m1", name: "前段", nodeIds: [ids[0], ids[1]], note: "" },
        { tempId: "m2", name: "后段", nodeIds: [ids[2]], note: "" },
      ],
    };
    const applied = applyDecomposition(existing, candidate);
    expect(applied.topology.modules.map((module) => module.name)).toEqual(["前段", "后段"]);
    expect(applied.moduleIds).toHaveLength(2);
    expect(applied.topology.nodes).toHaveLength(3);
  });

  it("提案引用了不存在的区域 → error", () => {
    const { topology } = chainOfThree();
    const candidate = {
      ...createEmptyDecompositionCandidate(topology.inputs.digest, computeTopologyDigest(topology)),
      modules: [{ tempId: "m1", name: "全部", nodeIds: ["nope"], note: "" }],
    };
    expect(validateDecompositionCandidate(candidate, topology).some((issue) => issue.id.startsWith("dec-candidate:unknown") && issue.severity === "error")).toBe(true);
  });
});
