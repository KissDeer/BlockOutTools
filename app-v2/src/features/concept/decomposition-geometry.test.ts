import { describe, expect, it } from "vitest";
import { dropModuleAt, moduleFrames } from "./decomposition-geometry";

describe("decomposition frame membership", () => {
  it("includes actual member sizes and leaves room for the title", () => {
    const [frame] = moduleFrames([{ id: "m", name: "M", nodeIds: ["a", "b"], note: "" }], [
      { id: "a", x: -200, y: -100, width: 186, height: 92 },
      { id: "b", x: 200, y: 300, width: 220, height: 180 },
    ]);
    expect(frame).toEqual({ id: "m", x: -228, y: -164, width: 676, height: 672 });
    expect(dropModuleAt({ x: 430, y: 490 }, [frame])).toBe("m");
    expect(dropModuleAt({ x: 449, y: 490 }, [frame])).toBeNull();
  });
  it("places empty modules separately without covering existing nodes", () => {
    const frames = moduleFrames(["a", "b"].map((id) => ({ id, name: id, nodeIds: [], note: "" })), [
      { id: "n", x: 400, y: 0, width: 200, height: 90 },
    ]);
    expect(frames[0].x).toBe(700);
    expect(frames[1].y).toBeGreaterThan(frames[0].y + frames[0].height);
  });
  it("resolves overlapping frames deterministically and prefers the smaller target", () => {
    const frames = [
      { id: "outer", x: 0, y: 0, width: 500, height: 500 },
      { id: "b", x: 20, y: 20, width: 100, height: 100 },
      { id: "a", x: 20, y: 20, width: 100, height: 100 },
    ];
    expect(dropModuleAt({ x: 50, y: 50 }, frames)).toBe("a");
    expect(dropModuleAt({ x: 50, y: 50 }, frames.reverse())).toBe("a");
    expect(dropModuleAt({ x: -1, y: 50 }, frames)).toBeNull();
  });
});
