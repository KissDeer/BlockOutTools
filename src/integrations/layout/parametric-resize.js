import { resizeParametricShape } from "./block-catalog.js";
import { getEditorState, screenToWorld } from "./editor-store-adapter.js";

function rotateVector(x, y, degrees) {
  const radians = degrees * Math.PI / 180;
  return {
    x: x * Math.cos(radians) - y * Math.sin(radians),
    y: x * Math.sin(radians) + y * Math.cos(radians),
  };
}

function resizedShape(shape, block, handle, delta, gridSize, freeResize) {
  const startWidth = shape.width;
  const startDepth = shape.height;
  const affectsWidth = handle.includes("e") || handle.includes("w");
  const affectsDepth = handle.includes("n") || handle.includes("s");
  const widthSign = handle.includes("w") ? -1 : 1;
  const depthSign = handle.includes("n") ? -1 : 1;
  const localDelta = rotateVector(delta.x, delta.y, -(shape.rotation ?? 0));
  const snap = (value) => {
    if (freeResize || !Number.isFinite(gridSize) || gridSize <= 0) return Math.max(1, value);
    return Math.max(gridSize, Math.round(value / gridSize) * gridSize);
  };
  const width = affectsWidth ? snap(startWidth + localDelta.x * widthSign) : startWidth;
  const depth = affectsDepth ? snap(startDepth + localDelta.y * depthSign) : startDepth;
  const localCenterShift = {
    x: affectsWidth ? (width - startWidth) * widthSign / 2 : 0,
    y: affectsDepth ? (depth - startDepth) * depthSign / 2 : 0,
  };
  const centerShift = rotateVector(localCenterShift.x, localCenterShift.y, shape.rotation ?? 0);
  const center = {
    x: shape.x + startWidth / 2 + centerShift.x,
    y: shape.y + startDepth / 2 + centerShift.y,
  };
  return resizeParametricShape({
    ...shape,
    x: center.x - width / 2,
    y: center.y - depth / 2,
    width,
    height: depth,
  }, block, width, depth);
}

export function installParametricResize(blocks) {
  const byType = new Map(blocks.filter((block) => block.source === "ue")
    .map((block) => [block.blockType, block]));

  const handlePointerDown = (event) => {
    const handleElement = event.target.closest?.("svg[data-canvas-touch] [data-handle]");
    const handle = handleElement?.dataset.handle;
    if (!handle || handle === "rotate") return;

    const state = getEditorState();
    const selectedIds = Array.isArray(state.selectedIds) ? state.selectedIds : [];
    if (selectedIds.length !== 1) return;
    const shape = state.level.shapes.find((item) => item.id === selectedIds[0]);
    const block = byType.get(shape?.ueBlockout?.blockType);
    if (!shape || !block || shape.type !== "rect") return;

    const svg = handleElement.closest("svg[data-canvas-touch]");
    const startPoint = screenToWorld(svg, event.clientX, event.clientY);
    let latestLevel = state.level;

    const handlePointerMove = (moveEvent) => {
      const point = screenToWorld(svg, moveEvent.clientX, moveEvent.clientY);
      const nextShape = resizedShape(
        shape,
        block,
        handle,
        { x: point.x - startPoint.x, y: point.y - startPoint.y },
        state.level.gridSize,
        moveEvent.ctrlKey || moveEvent.metaKey,
      );
      latestLevel = {
        ...getEditorState().level,
        shapes: getEditorState().level.shapes.map((item) => item.id === shape.id ? nextShape : item),
      };
      const currentState = getEditorState();
      currentState.setLevel(latestLevel);
      currentState.setSelectedIds([shape.id]);
      moveEvent.preventDefault();
      moveEvent.stopImmediatePropagation();
    };

    const finish = (upEvent) => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      const currentState = getEditorState();
      currentState.addToHistory(latestLevel);
      currentState.setSelectedIds([shape.id]);
      upEvent.preventDefault();
      upEvent.stopImmediatePropagation();
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  document.addEventListener("pointerdown", handlePointerDown, true);
  return () => document.removeEventListener("pointerdown", handlePointerDown, true);
}
