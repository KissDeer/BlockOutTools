import { describe, expect, it } from "vitest";
import { createEmptyTopology, type LogicTopology } from "./concept";
import { addLogicLink, addLogicNode, createLogicModule } from "./concept-commands";
import { generateConfiguration } from "./concept-configuration";
import { generateAssembly, LOGIC_TO_CONNECTION } from "./concept-assembly";
import { applyConfiguration } from "./commands";
import { resolveAssembly } from "./assembly-resolver";
import { createDemoProject } from "./demo-project";
import type { BlockoutProject } from "./types";

/** 三个区域排成一条链、分属三个模块，各自有相对位置与标高 */
function chain(): { topology: LogicTopology; ids: string[] } {
  let topology = createEmptyTopology();
  const ids: string[] = [];
  const layout: { name: string; position: [number, number]; base: number; role: "start" | "hub" | "boss" }[] = [
    { name: "入口", position: [0, 0], base: 0, role: "start" },
    { name: "中庭", position: [3000, 0], base: 0, role: "hub" },
    { name: "深处", position: [6000, 0], base: 300, role: "boss" },
  ];
  for (const item of layout) {
    const created = addLogicNode(topology, item.position, { name: item.name, role: item.role });
    topology = created.topology;
    ids.push(created.node.id);
  }
  topology = {
    ...topology,
    nodes: topology.nodes.map((node) => {
      const spec = layout[ids.indexOf(node.id)];
      return { ...node, relativePosition: spec.position, elevation: { base: spec.base, top: spec.base + 400 } };
    }),
  };
  const first = addLogicLink(topology, ids[0], ids[1], "normal");
  topology = first ? first.topology : topology;
  const second = addLogicLink(topology, ids[1], ids[2], "locked-door");
  topology = second ? second.topology : topology;
  // 给锁钥门配一把钥匙，否则拓扑本身不合法
  topology = { ...topology, keys: [{ id: "key_1", name: "铁钥匙", foundAt: ids[0], unlocks: [topology.links[1].id], note: "" }], links: topology.links.map((link) => link.id === topology.links[1].id ? { ...link, requires: "key_1" } : link) };
  for (const [index, id] of ids.entries()) {
    topology = createLogicModule(topology, layout[index].name, [id]).topology;
  }
  return { topology, ids };
}

/** 清空内容的基底：复用演示项目的规范设置，但不要它自带的实例与连接 */
function base(): BlockoutProject {
  const demo = createDemoProject();
  return { ...demo, projectId: "test_project", name: "测试", modules: [], instances: [], connections: [], assemblyAnchorInstanceId: undefined, concept: undefined };
}

/** 概念 → 构型 → 组装，一条链走完 */
function assembled(): { project: BlockoutProject; topology: LogicTopology } {
  const { topology } = chain();
  const configured = applyConfiguration({ ...base(), concept: topology }, generateConfiguration(topology));
  const assembly = generateAssembly(configured.project);
  return { project: assembly.project, topology: assembly.project.concept as LogicTopology };
}

describe("组装：概念 → 阶段二", () => {
  it("每个已落成构型的模块得到一个实例，位置取概念给的相对原点", () => {
    const { project, topology } = assembled();
    expect(topology.modules.every((module) => module.moduleDefinitionId)).toBe(true);
    expect(project.instances).toHaveLength(3);

    const entryModule = topology.modules.find((module) => module.name === "入口");
    const instance = project.instances.find((item) => item.definitionId === entryModule?.moduleDefinitionId);
    // 入口模块只有一个区域，在父级 (0,0)，宽 1800 深 1800 → 原点 (-900, -900)
    expect(instance?.assemblyTransform.position).toEqual([-900, -900, 0]);
    expect(instance?.name).toBe("入口");
  });

  it("跨模块链路落成连接，并绑到正确的端口上", () => {
    const { project, topology } = assembled();
    expect(project.connections).toHaveLength(2);
    // 逻辑链路类型映射到连接类型：普通连通→门，锁钥门→锁钥门
    expect(project.connections.map((connection) => connection.type)).toEqual(["door", "locked-door"]);
    for (const connection of project.connections) {
      const definition = project.modules.find((module) => module.id === project.instances.find((item) => item.id === connection.sourceInstanceId)?.definitionId);
      const port = definition?.blocks.find((block) => block.id === connection.sourcePortId);
      expect(port?.type).toBe("port");
      expect(port?.provenance?.featureId).toBeTruthy();
    }
    expect(topology.modules).toHaveLength(3);
  });

  it("间距取概念里的实际值，求解器不会再和概念打架", () => {
    const { project } = assembled();
    const resolution = resolveAssembly(project);
    expect(resolution.issues).toHaveLength(0);
    // 解出来的位置应与概念给的摆放一致
    for (const instance of project.instances) {
      const resolved = resolution.instances.find((item) => item.id === instance.id);
      expect(resolved?.assemblyTransform.position).toEqual(instance.assemblyTransform.position);
    }
  });

  it("重复生成不会产生重复实例或连接", () => {
    const { project } = assembled();
    const again = generateAssembly(project);
    expect(again.project.instances).toHaveLength(project.instances.length);
    expect(again.project.connections).toHaveLength(project.connections.length);
    expect(again.result.instancesCreated).toBe(0);
    expect(again.result.connectionsCreated).toBe(0);
    expect(again.result.instancesMoved).toBe(0);
    expect(again.result.connectionsUpdated).toBe(2);
  });

  it("没有相对位置的模块会被列出来并放在原点", () => {
    const { project, topology } = assembled();
    // 抹掉一个模块的原点，模拟"构型来自别处、没有概念定位"
    const stripped: BlockoutProject = {
      ...project,
      concept: { ...topology, modules: topology.modules.map((module) => module.name === "深处" ? { ...module, relativeOrigin: undefined } : module) },
    };
    const result = generateAssembly(stripped);
    expect(result.result.unplacedModules).toEqual(["深处"]);
    const deepModule = (result.project.concept as LogicTopology).modules.find((module) => module.name === "深处");
    const instance = result.project.instances.find((item) => item.definitionId === deepModule?.moduleDefinitionId);
    expect(instance?.assemblyTransform.position).toEqual([0, 0, 0]);
  });

  it("缺端口的链路会被报出来，而不是悄悄跳过", () => {
    const { project, topology } = assembled();
    // 抹掉一个模块的端口，模拟构型不完整
    const damaged = structuredClone(project);
    const concept = damaged.concept as LogicTopology;
    const targetModule = concept.modules[1];
    const definition = damaged.modules.find((module) => module.id === targetModule.moduleDefinitionId);
    if (definition) definition.blocks = definition.blocks.filter((block) => block.type !== "port");
    const result = generateAssembly(damaged);
    expect(result.result.missingPorts.length).toBeGreaterThan(0);
    expect(topology.modules).toHaveLength(3);
  });

  it("十种逻辑链路都有对应的连接类型", () => {
    expect(Object.keys(LOGIC_TO_CONNECTION)).toHaveLength(10);
    expect(LOGIC_TO_CONNECTION["locked-door"]).toBe("locked-door");
    expect(LOGIC_TO_CONNECTION.shortcut).toBe("shortcut");
    expect(LOGIC_TO_CONNECTION.normal).toBe("door");
  });
});
