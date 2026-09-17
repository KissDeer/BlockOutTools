import { describe, expect, it } from "vitest";
import { collectScopeIssues, computeTopologyDigest, createEmptyTopology, logicTopologySchema, type LogicTopology } from "./concept";
import { addLogicLink, addLogicNode, updateLogicNode } from "./concept-commands";
import {
  collapseNodeScope,
  expandNodeScope,
  flattenNodes,
  leafNodes,
  levelPathOfNode,
  linkScope,
  nodeInterior,
  pathKey,
  pathLabel,
  removeScope,
  resolveLevel,
  scopeCrumbs,
  scopeView,
  writeScopeView,
} from "./concept-scopes";

/**
 * 根作用域放一个"游乐园"（展开出子层），子作用域里放"马戏团"与"鬼屋"。
 *
 * 全部用普通节点搭：老写法里的 `createLogicModule`（分组框）不参与几何与层级，
 * 夹具里留着它只会让人以为作用域的归属还经过分组。
 */
function park(): {
  topology: LogicTopology; scopeId: string;
  villageNodeId: string; parkNodeId: string; circusNodeId: string; houseNodeId: string;
} {
  let topology = createEmptyTopology();
  const outer = addLogicNode(topology, [0, 0], { name: "游乐园", role: "hub" });
  topology = outer.topology;
  const village = addLogicNode(topology, [-4000, 0], { name: "小村", role: "start" });
  topology = village.topology;
  topology = updateLogicNode(topology, outer.node.id, { relativePosition: [0, 0] });
  topology = updateLogicNode(topology, village.node.id, { relativePosition: [-4000, 0] });
  const linked = addLogicLink(topology, village.node.id, outer.node.id, "normal");
  topology = linked ? linked.topology : topology;

  // 展开收的是**节点 id**：子层挂在节点上，一个作用域只属于一个节点
  const expanded = expandNodeScope(topology, outer.node.id, "游乐园内部");
  if (!expanded) throw new Error("展开失败");
  topology = expanded.topology;
  const scopeId = expanded.scope.id;

  // 子作用域内部：节点与链路都写在那一层里，再走唯一的写回路径
  let view = scopeView(topology, scopeId);
  const circus = addLogicNode(view, [0, 0], { name: "马戏团", role: "combat" });
  view = circus.topology;
  const house = addLogicNode(view, [2000, 0], { name: "鬼屋", role: "reward" });
  view = house.topology;
  view = updateLogicNode(view, circus.node.id, { relativePosition: [0, 0] });
  view = updateLogicNode(view, house.node.id, { relativePosition: [2000, 0] });
  const inner = addLogicLink(view, circus.node.id, house.node.id, "normal");
  view = inner ? inner.topology : view;
  topology = writeScopeView(topology, scopeId, view);

  return {
    topology, scopeId,
    villageNodeId: village.node.id,
    parkNodeId: outer.node.id, circusNodeId: circus.node.id, houseNodeId: house.node.id,
  };
}

describe("层级：一张画布上的焦点路径", () => {
  it("空路径就是整图，能看到根层全部节点与链路", () => {
    const { topology } = park();
    const level = resolveLevel(topology, []);
    expect(level.kind).toBe("logic");
    expect(level.scopeId).toBeNull();
    expect(level.nodeId).toBeNull();
    expect(level.nodes.map((node) => node.name)).toEqual(["游乐园", "小村"]);
    expect(level.links).toHaveLength(1);
    expect(level.steps).toEqual([]);
    expect(level.brokenAt).toBeNull();
  });

  it("进入有内部的节点 = 换到那一层的逻辑，人没离开画布", () => {
    const { topology, parkNodeId, scopeId } = park();
    const level = resolveLevel(topology, [parkNodeId]);
    expect(level.kind).toBe("logic");
    expect(level.scopeId).toBe(scopeId);
    expect(level.nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    expect(level.steps.map((step) => step.nodeName)).toEqual(["游乐园"]);
    expect(level.steps[0].kind).toBe("logic");
  });

  it("进入没有内部的节点 = 几何层，同时仍知道自己属于哪一层", () => {
    const { topology, parkNodeId, circusNodeId, scopeId } = park();
    const level = resolveLevel(topology, [parkNodeId, circusNodeId]);
    expect(level.kind).toBe("geometry");
    expect(level.nodeId).toBe(circusNodeId);
    // 几何层不切换作用域：仍然看得到它所在那一层的其他节点
    expect(level.scopeId).toBe(scopeId);
    expect(level.nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    expect(level.steps.map((step) => step.kind)).toEqual(["logic", "geometry"]);
  });

  it("多层嵌套逐层解析，每层各看各的内容", () => {
    const { topology, parkNodeId, circusNodeId } = park();
    // 把"鬼屋"再展开一层，做成三层
    const houseNodeId = topology.scopes[0].nodes.find((node) => node.name === "鬼屋")?.id as string;
    const deeper = expandNodeScope(topology, houseNodeId, "鬼屋内部");
    expect(deeper).not.toBeNull();
    // 在鬼屋内部放一个区域
    const innerView = addLogicNode(scopeView(deeper!.topology, deeper!.scope.id), [0, 0], { name: "地下室", role: "secret" });
    const withRoom = writeScopeView(deeper!.topology, deeper!.scope.id, innerView.topology);

    // 第一层：整图
    expect(resolveLevel(withRoom, []).nodes.map((node) => node.name)).toEqual(["游乐园", "小村"]);
    // 第二层：游乐园内部
    expect(resolveLevel(withRoom, [parkNodeId]).nodes.map((node) => node.name)).toEqual(["马戏团", "鬼屋"]);
    // 第三层：鬼屋内部
    const third = resolveLevel(withRoom, [parkNodeId, houseNodeId]);
    expect(third.kind).toBe("logic");
    expect(third.nodes.map((node) => node.name)).toEqual(["地下室"]);
    expect(third.steps.map((step) => step.nodeName)).toEqual(["游乐园", "鬼屋"]);
    // 马戏团没有内部，进去就是几何层
    expect(resolveLevel(withRoom, [parkNodeId, circusNodeId]).kind).toBe("geometry");
  });

  it("路径失效时安全退回，不抛错也不假装还在那一层", () => {
    const { topology, parkNodeId } = park();
    const level = resolveLevel(topology, [parkNodeId, "lnode_不存在"]);
    expect(level.brokenAt).toBe(1);
    // 退回上一层，而不是整图
    expect(level.scopeId).toBe(topology.scopes[0].id);
  });

  it("层级的可见内容会随拓扑变化自动跟上，不需要另存状态", () => {
    const { topology, parkNodeId } = park();
    const before = resolveLevel(topology, [parkNodeId]).nodes.length;
    const view = scopeView(topology, topology.scopes[0].id);
    const grown = writeScopeView(topology, topology.scopes[0].id, addLogicNode(view, [4000, 0], { name: "售票处" }).topology);
    expect(resolveLevel(grown, [parkNodeId]).nodes.length).toBe(before + 1);
  });

  it("层级树能从节点反查出它显示在哪一层", () => {
    const { topology, parkNodeId, circusNodeId, villageNodeId } = park();
    // 游乐园自己在根层可见；要看到它的内部才需要进入它
    expect(levelPathOfNode(topology, parkNodeId)).toEqual([]);
    expect(levelPathOfNode(topology, villageNodeId)).toEqual([]);
    // 马戏团在游乐园内部才可见
    expect(levelPathOfNode(topology, circusNodeId)).toEqual([parkNodeId]);
    expect(levelPathOfNode(topology, "lnode_不存在")).toBeNull();
  });

  it("节点内部是什么可以直接问出来", () => {
    const { topology, parkNodeId, circusNodeId } = park();
    expect(nodeInterior(topology, parkNodeId)).toMatchObject({ kind: "logic", childCount: 2, linkCount: 1 });
    expect(nodeInterior(topology, circusNodeId)).toMatchObject({ kind: "geometry", childCount: 0 });
  });
});

describe("嵌套：旧草稿兼容", () => {
  it("根作用域没有 id/name/scopes 的旧草稿仍能解析，不会被静默丢弃", () => {
    const legacy = {
      nodes: [],
      links: [],
      keys: [],
      startNodeId: null,
      inputs: { revision: 2, items: [], digest: "abc", updatedAt: new Date(0).toISOString() },
      proposals: [],
    };
    const parsed = logicTopologySchema.safeParse(legacy);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.id).toBe("scope_root");
    expect(parsed.data.name).toBe("根作用域");
    expect(parsed.data.scopes).toEqual([]);
    // 旧数据本身必须原样保留
    expect(parsed.data.inputs.revision).toBe(2);
  });
});

describe("嵌套：展开与收起", () => {
  it("展开会把子作用域挂到节点上，节点自己的几何不受影响", () => {
    const { topology, parkNodeId, scopeId } = park();
    const node = topology.nodes.find((item) => item.id === parkNodeId);
    expect(node?.childScopeId).toBe(scopeId);
    expect(topology.scopes).toHaveLength(1);
    expect(topology.scopes[0].nodes.map((item) => item.name)).toEqual(["马戏团", "鬼屋"]);
    expect(collectScopeIssues(topology)).toHaveLength(0);
  });

  it("收起只解除引用，作用域留在池子里", () => {
    const { topology, parkNodeId, scopeId } = park();
    const collapsed = collapseNodeScope(topology, parkNodeId);
    expect(collapsed.nodes.find((item) => item.id === parkNodeId)?.childScopeId).toBeUndefined();
    expect(collapsed.scopes.some((scope) => scope.id === scopeId)).toBe(true);
  });

  it("移除作用域会解除全部引用", () => {
    const { topology, parkNodeId, scopeId } = park();
    const removed = removeScope(topology, scopeId);
    expect(removed.scopes).toHaveLength(0);
    expect(removed.nodes.find((item) => item.id === parkNodeId)?.childScopeId).toBeUndefined();
  });

  it("已经展开过的节点不能重复展开", () => {
    const { topology, parkNodeId } = park();
    expect(expandNodeScope(topology, parkNodeId)).toBeNull();
  });
});

describe("嵌套：自包含检测", () => {
  it("作用域直接或间接包含自己会被报出来", () => {
    const { topology, scopeId } = park();
    // 在子作用域里再加一个节点，指回这个作用域本身
    let view = scopeView(topology, scopeId);
    const created = addLogicNode(view, [5000, 0], { name: "回环" });
    view = created.topology;
    const cyclic = linkScope(writeScopeView(topology, scopeId, view), created.node.id, scopeId);
    expect(collectScopeIssues(cyclic).some((issue) => issue.includes("包含了自己"))).toBe(true);
  });

  it("引用不存在的子作用域会被报出来", () => {
    const { topology, parkNodeId } = park();
    const dangling: LogicTopology = {
      ...topology,
      nodes: topology.nodes.map((node) => node.id === parkNodeId ? { ...node, childScopeId: "scope_missing" } : node),
    };
    expect(collectScopeIssues(dangling).some((issue) => issue.includes("不存在的子作用域"))).toBe(true);
  });

  it("同一个作用域被两个节点抢会被报出来", () => {
    const { topology, parkNodeId, scopeId } = park();
    const second = addLogicNode(topology, [9000, 0], { name: "第二座游乐园", childScopeId: scopeId });
    expect(collectScopeIssues(second.topology).some((issue) => issue.includes("只能属于一个节点"))).toBe(true);
    expect(second.topology.nodes.some((node) => node.id === parkNodeId)).toBe(true);
  });
});

describe("嵌套：路径与展平", () => {
  it("展平会沿节点累积 relativePosition 并给出层级路径", () => {
    const { topology } = park();
    const flat = flattenNodes(topology);

    // fixture 里直接标好了落位：小村 (-4000,0)、游乐园 (0,0)、鬼屋 (2000,0)
    const village = flat.find((entry) => entry.node.name === "小村");
    expect(village?.origin).toEqual([-4000, 0]);
    expect(village?.path).toHaveLength(0);

    // 鬼屋 = 游乐园原点 (0,0) + 它自己的 (2000,0)
    const house = flat.find((entry) => entry.node.name === "鬼屋");
    expect(house?.origin).toEqual([2000, 0]);
    expect(house?.path).toHaveLength(1);
    expect(house?.path[0].scopeName).toBe("游乐园内部");
  });

  it("展开的节点本身不再是叶子", () => {
    const { topology } = park();
    const leaves = leafNodes(topology);
    expect(leaves.map((entry) => entry.node.name)).not.toContain("游乐园");
    expect(new Set(leaves.map((entry) => entry.node.name))).toEqual(new Set(["小村", "马戏团", "鬼屋"]));
  });

  it("面包屑能指到子作用域，步长装的是节点身份", () => {
    const { topology, scopeId, parkNodeId } = park();
    const crumbs = scopeCrumbs(topology, scopeId);
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0].nodeId).toBe(parkNodeId);
    expect(crumbs[0].nodeName).toBe("游乐园");
    expect(crumbs[0].scopeName).toBe("游乐园内部");
    expect(pathLabel(crumbs)).toBe("游乐园");
    expect(pathKey(crumbs)).toBe(parkNodeId);
  });

  it("作用域不再能被第二个节点复用：展平只出一条分支", () => {
    const { topology, scopeId } = park();
    const second = addLogicNode(topology, [9000, 0], { name: "游乐园副本", childScopeId: scopeId });
    expect(flattenNodes(second.topology).filter((entry) => entry.node.name === "鬼屋")).toHaveLength(1);
    expect(collectScopeIssues(second.topology).some((issue) => issue.includes("只能属于一个节点"))).toBe(true);
  });});

describe("嵌套：指纹", () => {
  it("层级变化会让拓扑指纹变化（上游提案因此过期）", () => {
    const { topology, scopeId } = park();
    const before = computeTopologyDigest(topology);
    const view = scopeView(topology, scopeId);
    const renamed = updateLogicNode(view, view.nodes[0].id, { name: "改过名的马戏团" });
    const modified = writeScopeView(topology, scopeId, renamed);
    expect(computeTopologyDigest(modified)).not.toBe(before);
  });
});
