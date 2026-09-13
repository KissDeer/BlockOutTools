import { describe, expect, it } from "vitest";
import { computeTopologyDigest, createEmptyTopology, type LogicTopology } from "./concept";
import { addLogicLink, addLogicNode, createLogicModule } from "./concept-commands";
import { computeDecompositionDigest } from "./concept-decomposition";
import {
  createEmptyConfigurationCandidate,
  generateConfiguration,
  moduleLocalLayout,
  ROLE_TEMPLATES,
  summarizeConfiguration,
  validateConfiguration,
} from "./concept-configuration";
import { applyConfiguration } from "./commands";
import { createDemoProject } from "./demo-project";
import type { BlockoutProject } from "./types";

/** 两个区域、一条链路、两个模块（链路因此成为模块间连接） */
function twoModules(): { topology: LogicTopology; ids: string[] } {
  let topology = createEmptyTopology();
  const first = addLogicNode(topology, [0, 0], { name: "入口", role: "start" });
  topology = first.topology;
  const second = addLogicNode(topology, [4000, 0], { name: "大厅", role: "combat" });
  topology = second.topology;
  // 给相对位置与标高，构型才有地方落
  topology = {
    ...topology,
    nodes: topology.nodes.map((node) => node.id === first.node.id
      ? { ...node, relativePosition: [0, 0] as [number, number], elevation: { base: 0, top: 400 } }
      : { ...node, relativePosition: [4000, 0] as [number, number], elevation: { base: 150, top: 750 } }),
  };
  const linked = addLogicLink(topology, first.node.id, second.node.id, "stairs");
  topology = linked ? linked.topology : topology;
  topology = createLogicModule(topology, "入口序列", [first.node.id]).topology;
  topology = createLogicModule(topology, "大厅", [second.node.id]).topology;
  return { topology, ids: [first.node.id, second.node.id] };
}

function projectWith(topology: LogicTopology): BlockoutProject {
  return { ...createDemoProject(), concept: topology };
}

describe("基础构型：确定性兜底生成（A）", () => {
  it("每个角色都有模板", () => {
    for (const template of Object.values(ROLE_TEMPLATES)) {
      expect(template.width).toBeGreaterThan(0);
      expect(template.depth).toBeGreaterThan(0);
      expect(template.height).toBeGreaterThan(0);
    }
  });

  it("每个区域一个体块，每条跨模块链路在两侧各有一个端口", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    expect(summarizeConfiguration(candidate)).toMatchObject({ modules: 2, areas: 2, ports: 2 });
    for (const entry of candidate.modules) {
      expect(entry.areas).toHaveLength(1);
      expect(entry.ports).toHaveLength(1);
    }
    expect(validateConfiguration(topology, candidate).filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("端口落在区域边界上并朝向邻居", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    const entryPort = candidate.modules[0].ports[0];
    // 邻居在 +X 方向：偏移应落在入口体块右边界（宽 1800 → 900），朝向 0°
    expect(entryPort.offset[0]).toBeCloseTo(ROLE_TEMPLATES.start.width / 2, 5);
    expect(entryPort.offset[1]).toBe(0);
    expect(entryPort.rotation).toBe(0);
  });

  it("斜方向的端口也落在体块边界上，不会甩到体块外面", () => {
    // 邻居在斜 45° 方向：射线与边界的交点应正好落在角上，而不是超出
    let topology = createEmptyTopology();
    const first = addLogicNode(topology, [0, 0], { name: "角楼", role: "hub" });
    topology = first.topology;
    const second = addLogicNode(topology, [4000, 4000], { name: "对角", role: "hub" });
    topology = second.topology;
    topology = {
      ...topology,
      nodes: topology.nodes.map((node) => ({
        ...node,
        relativePosition: node.id === first.node.id ? [0, 0] as [number, number] : [4000, 4000] as [number, number],
      })),
    };
    const linked = addLogicLink(topology, first.node.id, second.node.id, "stairs");
    topology = linked ? linked.topology : topology;
    topology = createLogicModule(topology, "角楼", [first.node.id]).topology;
    topology = createLogicModule(topology, "对角", [second.node.id]).topology;

    const candidate = generateConfiguration(topology);
    const port = candidate.modules[0].ports[0];
    const half = ROLE_TEMPLATES.hub.width / 2;
    expect(Math.abs(port.offset[0])).toBeLessThanOrEqual(half + 1);
    expect(Math.abs(port.offset[1])).toBeLessThanOrEqual(half + 1);
    // 45° 时正好顶在角上：两轴都到边界
    expect(Math.abs(port.offset[0])).toBeCloseTo(half, -1);
    expect(port.rotation).toBe(45);
  });

  it("没有相对位置时给出警告而不是报错", () => {
    const { topology } = twoModules();
    const unplaced: LogicTopology = { ...topology, nodes: topology.nodes.map((node) => ({ ...node, relativePosition: null })) };
    const candidate = generateConfiguration(unplaced);
    expect(candidate.warnings.some((warning) => warning.includes("没有相对位置"))).toBe(true);
  });

  it("还没拆解时给出警告", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration({ ...topology, modules: [] });
    expect(candidate.warnings.some((warning) => warning.includes("横向拆解"))).toBe(true);
  });
});

describe("基础构型：规则兜底校验（B）", () => {
  it("输入、拓扑或划分任一变化都拦住构型", () => {
    const { topology } = twoModules();
    const candidate = createEmptyConfigurationCandidate(topology);
    expect(validateConfiguration(topology, candidate).some((issue) => issue.id === "cfg:empty" && issue.severity === "error")).toBe(true);

    const moved: LogicTopology = { ...topology, nodes: topology.nodes.map((node, index) => index === 0 ? { ...node, name: "改名了" } : node) };
    expect(computeTopologyDigest(moved)).not.toBe(computeTopologyDigest(topology));

    const regrouped: LogicTopology = { ...topology, modules: topology.modules.map((module) => ({ ...module, name: `${module.name}!` })) };
    expect(computeDecompositionDigest(regrouped)).not.toBe(computeDecompositionDigest(topology));
  });

  it("模块里的区域缺体块 → error", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    candidate.modules[0].areas = [];
    const rules = validateConfiguration(topology, candidate).filter((issue) => issue.severity === "error").map((issue) => issue.id);
    expect(rules.some((id) => id.startsWith("cfg:missing-area"))).toBe(true);
  });

  it("对外连接缺端口 → error", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    candidate.modules[0].ports = [];
    const rules = validateConfiguration(topology, candidate).filter((issue) => issue.severity === "error").map((issue) => issue.id);
    expect(rules.some((id) => id.startsWith("cfg:missing-port"))).toBe(true);
  });

  it("尺寸非正 → error；多余体块 → warning", () => {
    const { topology, ids } = twoModules();
    const candidate = generateConfiguration(topology);
    candidate.modules[0].areas[0].size = [0, 100, 100];
    candidate.modules[1].areas.push({ nodeId: ids[0], size: [100, 100, 100], role: "solid", note: "" });
    const issues = validateConfiguration(topology, candidate);
    expect(issues.some((issue) => issue.id.startsWith("cfg:bad-size") && issue.severity === "error")).toBe(true);
    expect(issues.some((issue) => issue.id.startsWith("cfg:extra-area") && issue.severity === "warning")).toBe(true);
  });

  it("漏掉整个模块 → error", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    candidate.modules = candidate.modules.slice(0, 1);
    expect(validateConfiguration(topology, candidate).some((issue) => issue.id.startsWith("cfg:module-missing") && issue.severity === "error")).toBe(true);
  });
});

describe("基础构型：坐标换算", () => {
  it("模块局部原点取所有体块包围盒的左下角", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    const layout = moduleLocalLayout(topology, candidate.modules[1]);
    // 大厅在父级 (4000, 0)，宽 3600 深 3000 → 包围盒左下角 (2200, -1500)
    expect(layout.origin).toEqual([2200, -1500]);
    expect(layout.boxes[0].center).toEqual([1800, 1500]);
  });
});

describe("基础构型：套用到模块定义", () => {
  it("落成体块与端口，并从标高取 Z", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    const result = applyConfiguration(projectWith(topology), candidate);

    expect(result.moduleIds).toHaveLength(2);
    expect(result.blockCount).toBe(4);   // 2 体块 + 2 端口
    const concept = result.project.concept as LogicTopology;
    expect(concept.modules.every((module) => module.moduleDefinitionId)).toBe(true);

    const hall = result.project.modules.find((module) => module.name === "大厅");
    const box = hall?.blocks.find((block) => block.type === "box");
    expect(box?.type).toBe("box");
    if (box?.type === "box") {
      expect(box.parameters.BoxSize).toEqual([ROLE_TEMPLATES.combat.width, ROLE_TEMPLATES.combat.depth, ROLE_TEMPLATES.combat.height]);
      expect(box.transform.position[2]).toBe(150);      // 大厅底面标高
      expect(box.elevationReference).toBe("bottom");
    }
    expect(hall?.blocks.filter((block) => block.type === "port")).toHaveLength(1);
  });

  it("再次套用会替换积木并递增修订，不新建重复定义", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    const first = applyConfiguration(projectWith(topology), candidate);
    const second = applyConfiguration(first.project, candidate);

    expect(second.project.modules).toHaveLength(first.project.modules.length);
    const hall = second.project.modules.find((module) => module.name === "大厅");
    expect(hall?.revision).toBe(2);
    expect(hall?.blocks).toHaveLength(2);
  });

  it("记录模块局部原点，平面图才能把体块放回父级坐标", () => {
    const { topology } = twoModules();
    const candidate = generateConfiguration(topology);
    const result = applyConfiguration(projectWith(topology), candidate);
    const concept = result.project.concept as LogicTopology;
    const hall = concept.modules.find((module) => module.name === "大厅");
    // 大厅在父级 (4000, 0)，宽 3600 深 3000 → 原点 (2200, -1500)
    expect(hall?.relativeOrigin).toEqual([2200, -1500]);

    // 体块中心 + 原点 = 父级相对位置
    const definition = result.project.modules.find((module) => module.name === "大厅");
    const box = definition?.blocks.find((block) => block.type === "box");
    const origin = hall?.relativeOrigin as [number, number];
    expect(box!.transform.position[0] + origin[0]).toBe(4000);
    expect(box!.transform.position[1] + origin[1]).toBe(0);
  });
});
