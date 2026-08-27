function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function rotateAround(point, center, degrees) {
  const radians = finite(degrees) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return {
    x: round(center.x + x * cosine - y * sine),
    y: round(center.y + x * sine + y * cosine),
  };
}

export function modulePortArrowPoints(shape) {
  const x = finite(shape?.x);
  const y = finite(shape?.y);
  const width = Math.max(1, Math.abs(finite(shape?.width, 100)));
  const height = Math.max(1, Math.abs(finite(shape?.height, 24)));
  const center = { x: x + width / 2, y: y + height / 2 };
  const headLength = Math.min(width * 0.52, Math.max(width * 0.28, height * 0.9));
  const headBaseX = x + width - headLength;
  const bodyHalfHeight = height * 0.26;
  return [
    { x, y: center.y - bodyHalfHeight },
    { x: headBaseX, y: center.y - bodyHalfHeight },
    { x: headBaseX, y },
    { x: x + width, y: center.y },
    { x: headBaseX, y: y + height },
    { x: headBaseX, y: center.y + bodyHalfHeight },
    { x, y: center.y + bodyHalfHeight },
  ].map((point) => rotateAround(point, center, shape?.rotation));
}

export function modulePortArrowPath(shape) {
  const points = modulePortArrowPoints(shape);
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")} Z`;
}

function shapeGroup(root, shapeId) {
  const clip = root.getElementById?.(`clip-${shapeId}`)
    ?? root.querySelector?.(`[id="clip-${CSS.escape(String(shapeId))}"]`);
  return clip?.closest("g.selectable-element") ?? clip?.closest("g") ?? null;
}

export function decorateModulePortShapes(shapes, root = document) {
  let decorated = 0;
  for (const shape of shapes ?? []) {
    if (!shape?.modulePort || !shape.id) continue;
    const group = shapeGroup(root, shape.id);
    if (!group) continue;
    const path = modulePortArrowPath(shape);
    group.dataset.modulePortDirection = "positive-x";
    group.setAttribute("aria-label", `${shape.modulePort.name ?? "出入口"}，箭头为正方向`);
    for (const clipId of [`clip-${shape.id}`, `base-clip-${shape.id}`]) {
      const clipPath = root.getElementById?.(clipId)
        ?? root.querySelector?.(`[id="${CSS.escape(clipId)}"]`);
      clipPath?.querySelector("path")?.setAttribute("d", path);
    }
    group.querySelector(":scope > path")?.setAttribute("d", path);
    decorated += 1;
  }
  return decorated;
}
