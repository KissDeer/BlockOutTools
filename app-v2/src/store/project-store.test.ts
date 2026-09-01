import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoProject } from "../domain/demo-project";

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("project store clipboard actions", () => {
  it("copies and pastes a module instance without copying its connections", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    const { useProjectStore } = await import("./project-store");
    const project = createDemoProject();
    useProjectStore.setState({
      project,
      view: "assembly",
      activeInstanceId: null,
      selectedInstanceId: project.instances[0].id,
      selectedBlockIds: [],
      instanceClipboardId: null,
      blockClipboard: [],
      past: [],
      future: [],
    });

    useProjectStore.getState().copySelectedInstance();
    useProjectStore.getState().pasteInstance();

    const next = useProjectStore.getState();
    expect(next.project.instances).toHaveLength(3);
    expect(next.project.connections).toHaveLength(1);
    expect(next.project.instances[2].definitionId).toBe(project.instances[0].definitionId);
    expect(next.project.instances[2].id).not.toBe(project.instances[0].id);
    expect(next.selectedInstanceId).toBe(next.project.instances[2].id);
  });

  it("duplicates selected module blocks with new stable identities", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });
    const { useProjectStore } = await import("./project-store");
    const project = createDemoProject();
    const source = project.modules[0].blocks[0];
    useProjectStore.setState({
      project,
      view: "module",
      activeInstanceId: project.instances[0].id,
      selectedInstanceId: project.instances[0].id,
      selectedBlockIds: [source.id],
      instanceClipboardId: null,
      blockClipboard: [],
      past: [],
      future: [],
    });

    useProjectStore.getState().duplicateSelectedBlocks();

    const next = useProjectStore.getState();
    const duplicated = next.project.modules[0].blocks.at(-1);
    expect(next.project.modules[0].blocks).toHaveLength(7);
    expect(duplicated?.id).not.toBe(source.id);
    expect(duplicated?.name).toBe(`${source.name} 副本`);
    expect(next.selectedBlockIds).toEqual([duplicated?.id]);
  });
});
