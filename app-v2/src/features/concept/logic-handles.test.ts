import { describe, expect, it } from "vitest";
import { computeTopologyDigest, createEmptyTopology, logicTopologySchema } from "../../domain/concept";
import { addLogicLink, addLogicNode } from "../../domain/concept-commands";
import { asLogicHandleSide, resolveLogicHandles } from "./logic-handles";

describe("逻辑节点四向连接点", () => {
  it.each([
    [[300, 40], "right", "left"],
    [[-300, 40], "left", "right"],
    [[40, 300], "bottom", "top"],
    [[40, -300], "top", "bottom"],
  ] as const)("旧连线按相对位置 %j 选择相向连接点", (to, sourceHandle, targetHandle) => {
    expect(resolveLogicHandles({}, [0, 0], [...to])).toEqual({ sourceHandle, targetHandle });
  });

  it("手动选择的连接点在 JSON 保存读取后保留，移动节点不重新选边", () => {
    const first = addLogicNode(createEmptyTopology(), [0, 0]);
    const second = addLogicNode(first.topology, [0, 300]);
    const result = addLogicLink(second.topology, first.node.id, second.node.id, "normal", {
      sourceHandle: "left", targetHandle: "bottom",
    })!;
    const restored = logicTopologySchema.parse(JSON.parse(JSON.stringify(result.topology)));
    expect(resolveLogicHandles(restored.links[0], [0, 0], [300, 0])).toEqual({ sourceHandle: "left", targetHandle: "bottom" });
    expect(restored.links[0].traversal).toBe("both");
    const oldLink = { ...restored.links[0] };
    delete oldLink.sourceHandle;
    delete oldLink.targetHandle;
    const legacy = logicTopologySchema.parse({ ...restored, links: [oldLink] });
    expect(computeTopologyDigest(restored)).toBe(computeTopologyDigest(legacy));
    expect(resolveLogicHandles(legacy.links[0], [0, 0], [0, 300])).toEqual({ sourceHandle: "bottom", targetHandle: "top" });
  });

  it("只接受四个已知连接点", () => {
    expect(asLogicHandleSide("top")).toBe("top");
    expect(asLogicHandleSide(null)).toBeUndefined();
    expect(asLogicHandleSide("unknown")).toBeUndefined();
  });
});
