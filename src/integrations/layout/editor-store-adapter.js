function editorStore() {
  const store = window.__LAYOUT_TOOLS_STORE__;
  if (!store || typeof store.getState !== "function") {
    throw new Error("LayoutTools 编辑器尚未就绪");
  }
  return store;
}

export function getEditorState() {
  return editorStore().getState();
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getEditorLevelSnapshot() {
  return cloneJson(getEditorState().level);
}

export function replaceEditorLevel(level, options = {}) {
  if (!level || !Array.isArray(level.shapes) || !Array.isArray(level.entities) || !Array.isArray(level.layers)) {
    throw new TypeError("不是有效的 LayoutTools 关卡数据");
  }
  const state = getEditorState();
  const nextLevel = cloneJson(level);
  state.setLevel(nextLevel);
  state.setSelectedIds([]);
  state.setActiveTool("select");
  const activeLayerExists = nextLevel.layers.some((layer) => layer.id === state.activeLayerId);
  if (!activeLayerExists && nextLevel.layers[0]?.id) {
    state.setActiveLayerId(nextLevel.layers[0].id);
  }
  if (options.recordHistory === true) {
    state.addToHistory(nextLevel);
  }
  return nextLevel;
}

export function screenToWorld(svg, clientX, clientY) {
  const gridGroup = svg.querySelector(":scope > g > g");
  const matrix = gridGroup?.getScreenCTM?.();
  if (matrix) {
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  const state = getEditorState();
  const rect = svg.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.zoom,
    y: (clientY - rect.top - state.pan.y) / state.zoom,
  };
}

export function snapToGrid(point, gridSize) {
  const size = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 1;
  return {
    x: Math.round(point.x / size) * size,
    y: Math.round(point.y / size) * size,
  };
}

export function addPlacedBlock(placed) {
  const state = getEditorState();
  const level = state.level;
  const collection = placed.collection;
  if (collection !== "shapes" && collection !== "entities") {
    throw new TypeError(`Unsupported LayoutTools collection: ${collection}`);
  }

  const nextLevel = {
    ...level,
    [collection]: [...level[collection], placed.item],
  };
  state.setLevel(nextLevel);
  state.addToHistory(nextLevel);
  state.setSelectedIds([placed.item.id]);
  state.setActiveTool("select");
  return placed.item;
}

export function replacePlacedShape(shapeId, updater) {
  const state = getEditorState();
  const shapeIndex = state.level.shapes.findIndex((shape) => shape.id === shapeId);
  if (shapeIndex < 0) {
    throw new Error(`未找到积木：${shapeId}`);
  }
  const shapes = [...state.level.shapes];
  shapes[shapeIndex] = updater(shapes[shapeIndex]);
  const nextLevel = { ...state.level, shapes };
  state.setLevel(nextLevel);
  state.addToHistory(nextLevel);
  state.setSelectedIds([shapeId]);
  return shapes[shapeIndex];
}

export function subscribeToEditor(listener) {
  return editorStore().subscribe(listener);
}
