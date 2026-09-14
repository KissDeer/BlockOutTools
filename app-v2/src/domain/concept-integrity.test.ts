import { describe, expect, it } from "vitest";
import { createEmptyScope, createEmptyTopology, logicTopologySchema, type LogicScope, type LogicTopology } from "./concept";
import { addLogicKey, addLogicLink, addLogicNode, createLogicModule } from "./concept-commands";
import { canDeliver } from "./concept-validation";
import { createDemoProject } from "./demo-project";
import { projectSchema } from "./project-schema";

function nested() {
  let child: LogicTopology = { ...createEmptyScope("child", "鬼屋"), scopes: [] };
  child = addLogicNode(child, [0, 0], { name: "入口" }).topology;
  child = addLogicNode(child, [300, 0], { name: "出口" }).topology;
  child = addLogicLink(child, child.nodes[0].id, child.nodes[1].id, "locked-door")!.topology;
  child = addLogicKey(child, child.nodes[0].id, child.links[0].id, "钥匙")!.topology;
  child = createLogicModule(child, "内厅", child.nodes.map((node) => node.id)).topology;
  const { scopes: _pool, ...scope } = child;
  const root = createEmptyTopology();
  root.scopes.push(scope);
  root.modules.push({ id: "parent", name: "游乐园", nodeIds: [], note: "", childScopeId: scope.id });
  return root;
}

describe("嵌套拓扑的导入完整性", () => {
  const corruptions: [string, (scope: LogicScope) => void][] = [
    ["重复节点", (scope) => scope.nodes.push(structuredClone(scope.nodes[0]))],
    ["重复链路", (scope) => scope.links.push(structuredClone(scope.links[0]))],
    ["重复钥匙", (scope) => scope.keys.push(structuredClone(scope.keys[0]))],
    ["重复模块", (scope) => scope.modules.push(structuredClone(scope.modules[0]))],
    ["链路端点缺失", (scope) => { scope.links[0].to = "missing"; }],
    ["自连接", (scope) => { scope.links[0].to = scope.links[0].from; }],
    ["锁钥缺失", (scope) => { scope.links[0].requires = "missing"; }],
    ["取钥位置缺失", (scope) => { scope.keys[0].foundAt = "missing"; }],
    ["解锁目标缺失", (scope) => { scope.keys[0].unlocks = ["missing"]; }],
    ["起点缺失", (scope) => { scope.startNodeId = "missing"; }],
    ["模块区域缺失", (scope) => scope.modules[0].nodeIds.push("missing")],
    ["区域重复分配", (scope) => scope.modules.push({ ...scope.modules[0], id: "another" })],
  ];
  it.each(corruptions)("子层%s会被导入校验拦下并注明所在层", (_name, corrupt) => {
    const root = nested();
    corrupt(root.scopes[0]);
    const result = logicTopologySchema.safeParse(root);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "scopes" && issue.message.includes("鬼屋"))).toBe(true);
    expect(canDeliver(root).ok).toBe(false);
  });

  it("合法共享子层和不同作用域的相同本地身份可保存", () => {
    const root = nested();
    root.modules.push({ ...root.modules[0], id: "parent_copy" });
    root.scopes.push({ ...structuredClone(root.scopes[0]), id: "other_child", name: "另一栋鬼屋" });
    root.modules.push({ ...root.modules[0], id: "other_parent", childScopeId: "other_child" });
    expect(projectSchema.safeParse({ ...createDemoProject(), concept: root }).success).toBe(true);
    expect(canDeliver(root).ok).toBe(true);
  });

  it.each(["node", "module"])("子层的%s不能绑定不存在的阶段二模块", (kind) => {
    const root = nested();
    if (kind === "node") root.scopes[0].nodes[0].moduleId = "missing";
    else root.scopes[0].modules[0].moduleDefinitionId = "missing";
    const result = projectSchema.safeParse({ ...createDemoProject(), concept: root });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message.includes("鬼屋") && issue.message.includes("不存在"))).toBe(true);
  });
});

describe("递归交付", () => {
  it("子层死锁可以作为草稿保存，但阻止根层交付；复用分支只报一次", () => {
    const root = nested();
    root.modules.push({ ...root.modules[0], id: "second_parent" });
    root.scopes[0].keys[0].foundAt = root.scopes[0].nodes[1].id;
    expect(projectSchema.safeParse({ ...createDemoProject(), concept: root }).success).toBe(true);
    const gate = canDeliver(root);
    expect(gate.ok).toBe(false);
    expect(gate.blockers.filter((issue) => issue.rule === "TOPO_KEY_DEADLOCK")).toHaveLength(1);
    expect(gate.blockers.every((issue) => issue.message.includes("鬼屋"))).toBe(true);
    root.modules = [];
    expect(canDeliver(root).ok).toBe(true);
  });

  it("递归包含和缺失子层不能通过交付", () => {
    const root = nested();
    root.scopes[0].modules[0].childScopeId = "child";
    expect(canDeliver(root).blockers.some((issue) => issue.rule === "TOPO_SCOPE_STRUCTURE")).toBe(true);
    root.scopes = [];
    expect(canDeliver(root).ok).toBe(false);
  });
});
