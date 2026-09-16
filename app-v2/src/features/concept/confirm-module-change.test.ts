import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyTopology } from "../../domain/concept";
import { addLogicNode, createLogicModule } from "../../domain/concept-commands";
import { createDemoProject } from "../../domain/demo-project";
import { confirmModuleChange } from "./confirm-module-change";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const project = createDemoProject();
  const added = addLogicNode(createEmptyTopology(), [0, 0]);
  const grouped = createLogicModule(added.topology, "已有白盒", [added.node.id]);
  grouped.topology.modules[0].moduleDefinitionId = project.modules[0].id;
  project.concept = grouped.topology;
  return { project, topology: grouped.topology, nodeId: added.node.id, groupId: grouped.module.id };
}

describe("module membership impact confirmation", () => {
  it("does not interrupt a layout-only drag within the same module", () => {
    const { project, topology, nodeId, groupId } = fixture();
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    expect(confirmModuleChange(project, topology, [nodeId], groupId)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("allows cancelling reassignment without changing topology, geometry or instances", () => {
    const { project, topology, nodeId } = fixture();
    const before = structuredClone(project);
    const confirm = vi.fn(() => false);
    vi.stubGlobal("window", { confirm });
    expect(confirmModuleChange(project, topology, [nodeId], null)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("不会自动搬移或删除"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining(project.modules[0].name));
    expect(project).toEqual(before);
  });

  it("also detects a source-linked block whose former group no longer binds the definition", () => {
    const { project, topology, nodeId } = fixture();
    delete topology.modules[0].moduleDefinitionId;
    project.modules[0].blocks[0].provenance = { sourceId: "draft", featureId: nodeId, status: "estimated", note: "" };
    const confirm = vi.fn(() => true);
    vi.stubGlobal("window", { confirm });
    expect(confirmModuleChange(project, topology, [nodeId], "new-group")).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
});
