function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function centerOf(item) {
  if (item.type === "circle") return { x: finite(item.x), y: finite(item.y) };
  if (item.position) return { x: finite(item.position.x), y: finite(item.position.y) };
  return { x: finite(item.x) + finite(item.width) / 2, y: finite(item.y) + finite(item.height) / 2 };
}

function itemBounds(item) {
  if (item.type === "circle") {
    const radius = Math.abs(finite(item.radius));
    return { minX: item.x - radius, minY: item.y - radius, maxX: item.x + radius, maxY: item.y + radius };
  }
  const points = item.wallCenterline ?? item.points ?? item.vertices ?? item.polygonPoints;
  if (Array.isArray(points) && points.length > 0) {
    const xs = points.map((point) => finite(point.x));
    const ys = points.map((point) => finite(point.y));
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  const center = centerOf(item);
  const width = Math.abs(finite(item.width));
  const height = Math.abs(finite(item.height));
  return { minX: center.x - width / 2, minY: center.y - height / 2, maxX: center.x + width / 2, maxY: center.y + height / 2 };
}

export function selectionBounds(level, selectedIds) {
  const ids = new Set(selectedIds ?? []);
  const items = [...(level.shapes ?? []), ...(level.entities ?? [])].filter((item) => ids.has(item.id));
  if (items.length === 0) return null;
  const bounds = items.map(itemBounds);
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, items };
}

function translatePoint(point, dx, dy) {
  return { ...point, x: finite(point.x) + dx, y: finite(point.y) + dy };
}

function translateItem(item, dx, dy) {
  const next = clone(item);
  if (next.position) next.position = translatePoint(next.position, dx, dy);
  else {
    if (Number.isFinite(Number(next.x))) next.x = finite(next.x) + dx;
    if (Number.isFinite(Number(next.y))) next.y = finite(next.y) + dy;
  }
  for (const key of ["wallCenterline", "points", "vertices", "polygonPoints"]) {
    if (Array.isArray(next[key])) next[key] = next[key].map((point) => translatePoint(point, dx, dy));
  }
  return next;
}

function mapSelected(level, selectedIds, updater) {
  const ids = new Set(selectedIds ?? []);
  return {
    ...level,
    shapes: (level.shapes ?? []).map((item) => ids.has(item.id) ? updater(item) : item),
    entities: (level.entities ?? []).map((item) => ids.has(item.id) ? updater(item) : item),
  };
}

export function moveSelection(level, selectedIds, target, gridSize = 0) {
  const bounds = selectionBounds(level, selectedIds);
  if (!bounds) return level;
  const snap = (value) => gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
  const targetX = target.x == null ? bounds.centerX : snap(Number(target.x));
  const targetY = target.y == null ? bounds.centerY : snap(Number(target.y));
  return mapSelected(level, selectedIds, (item) => translateItem(item, targetX - bounds.centerX, targetY - bounds.centerY));
}

function rotatePoint(point, center, degrees) {
  const radians = degrees * Math.PI / 180;
  const dx = finite(point.x) - center.x;
  const dy = finite(point.y) - center.y;
  return {
    ...point,
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function rotateSelection(level, selectedIds, degrees) {
  const bounds = selectionBounds(level, selectedIds);
  if (!bounds) return level;
  const center = { x: bounds.centerX, y: bounds.centerY };
  return mapSelected(level, selectedIds, (item) => {
    const itemCenter = rotatePoint(centerOf(item), center, degrees);
    let next = translateItem(item, itemCenter.x - centerOf(item).x, itemCenter.y - centerOf(item).y);
    next.rotation = finite(next.rotation) + degrees;
    for (const key of ["wallCenterline", "points", "vertices", "polygonPoints"]) {
      if (Array.isArray(item[key])) next[key] = item[key].map((point) => rotatePoint(point, center, degrees));
    }
    return next;
  });
}

function resizeParametricFootprint(item, width, height) {
  const next = clone(item);
  const parameters = next.ueBlockout?.parameters;
  const key = ({ box: "BoxSize", "stairs-linear": "StairsSize", ramp: "RampSize" })[next.ueBlockout?.blockType];
  if (key && Array.isArray(parameters?.[key])) parameters[key] = [width, height, parameters[key][2]];
  return next;
}

export function resizeSingleSelection(level, selectedIds, widthValue, heightValue, gridSize = 0) {
  const ids = new Set(selectedIds ?? []);
  if (ids.size !== 1) return level;
  const snap = (value) => gridSize > 0 ? Math.max(gridSize, Math.round(value / gridSize) * gridSize) : Math.max(1, value);
  return mapSelected(level, ids, (item) => {
    if (item.type === "circle") {
      const diameter = snap(Number(widthValue ?? heightValue ?? item.radius * 2));
      return { ...item, radius: diameter / 2, area: Math.PI * diameter * diameter / 4 };
    }
    if (!Number.isFinite(Number(item.width)) || !Number.isFinite(Number(item.height))) return item;
    const width = snap(Number(widthValue ?? item.width));
    const height = snap(Number(heightValue ?? item.height));
    const center = centerOf(item);
    return resizeParametricFootprint({ ...item, x: center.x - width / 2, y: center.y - height / 2, width, height, area: width * height }, width, height);
  });
}

export function alignSelection(level, selectedIds, axis) {
  const bounds = selectionBounds(level, selectedIds);
  if (!bounds || bounds.items.length < 2) return level;
  const target = axis === "x" ? bounds.centerX : bounds.centerY;
  return mapSelected(level, selectedIds, (item) => {
    const center = centerOf(item);
    return translateItem(item, axis === "x" ? target - center.x : 0, axis === "y" ? target - center.y : 0);
  });
}

export function distributeSelection(level, selectedIds, axis) {
  const bounds = selectionBounds(level, selectedIds);
  if (!bounds || bounds.items.length < 3) return level;
  const ordered = [...bounds.items].sort((left, right) => centerOf(left)[axis] - centerOf(right)[axis]);
  const start = centerOf(ordered[0])[axis];
  const end = centerOf(ordered.at(-1))[axis];
  const targets = new Map(ordered.map((item, index) => [item.id, start + (end - start) * index / (ordered.length - 1)]));
  return mapSelected(level, selectedIds, (item) => {
    const center = centerOf(item);
    return translateItem(item, axis === "x" ? targets.get(item.id) - center.x : 0, axis === "y" ? targets.get(item.id) - center.y : 0);
  });
}

export function snapSelection(level, selectedIds, mode, threshold = Infinity) {
  const bounds = selectionBounds(level, selectedIds);
  if (!bounds) return level;
  const ids = new Set(selectedIds ?? []);
  const others = [...(level.shapes ?? []), ...(level.entities ?? [])].filter((item) => !ids.has(item.id));
  const candidates = [];
  for (const item of others) {
    const other = itemBounds(item);
    if (mode === "vertex") {
      for (const x of [other.minX, other.maxX]) for (const y of [other.minY, other.maxY]) {
        candidates.push({ dx: x - bounds.centerX, dy: y - bounds.centerY });
      }
    } else {
      candidates.push(
        { dx: other.minX - bounds.maxX, dy: 0 }, { dx: other.maxX - bounds.minX, dy: 0 },
        { dx: 0, dy: other.minY - bounds.maxY }, { dx: 0, dy: other.maxY - bounds.minY },
      );
    }
  }
  const best = candidates.sort((left, right) => Math.hypot(left.dx, left.dy) - Math.hypot(right.dx, right.dy))[0];
  if (!best || Math.hypot(best.dx, best.dy) > threshold) return level;
  return mapSelected(level, selectedIds, (item) => translateItem(item, best.dx, best.dy));
}
