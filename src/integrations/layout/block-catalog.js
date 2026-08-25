const DEFAULT_COLOR = "#8E8E86";
const DEFAULT_OPACITY = 0.5;

const ORIGINAL_BLOCKS = Object.freeze([
  { id: "original-rectangle", source: "original", kind: "shape", shapeType: "rect", label: "矩形", width: 200, height: 150 },
  { id: "original-circle", source: "original", kind: "shape", shapeType: "circle", label: "圆形", radius: 75 },
  { id: "original-wall", source: "original", kind: "shape", shapeType: "wall", label: "墙体", width: 300, height: 20, wallHeight: 280 },
  { id: "original-ramp", source: "original", kind: "shape", shapeType: "stairs", label: "直坡道", width: 150, height: 300, stairsType: "straight", stairsMode: "ramp" },
  { id: "original-steps", source: "original", kind: "shape", shapeType: "stairs", label: "直楼梯", width: 150, height: 300, stairsType: "straight", stairsMode: "steps" },
  { id: "original-switchback", source: "original", kind: "shape", shapeType: "stairs", label: "回旋楼梯", width: 250, height: 300, stairsType: "switchback", stairsMode: "steps" },
  { id: "original-spiral", source: "original", kind: "shape", shapeType: "stairs", label: "螺旋楼梯", width: 250, height: 250, stairsType: "spiral", stairsMode: "steps" },
  { id: "original-player", source: "original", kind: "entity", entityType: "player", label: "玩家起点" },
  { id: "original-enemy", source: "original", kind: "entity", entityType: "enemy", label: "敌人" },
  { id: "original-pickup", source: "original", kind: "entity", entityType: "pickup", label: "拾取物" },
  { id: "original-trigger", source: "original", kind: "entity", entityType: "trigger", label: "触发器" },
  { id: "original-light", source: "original", kind: "entity", entityType: "light", label: "灯光" },
  { id: "original-prop", source: "original", kind: "entity", entityType: "prop", label: "道具" },
  { id: "original-character", source: "original", kind: "entity", entityType: "character", label: "角色" },
]);

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
  );
  return value;
}

function usableSize(value, fallback) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : fallback;
}

function parameterDefinitions(block) {
  return [...(block.parameters ?? []), ...(block.commonParameters ?? [])];
}

export function createDefaultBlockParameters(block) {
  return Object.fromEntries(
    parameterDefinitions(block).map((parameter) => [parameter.key, cloneValue(parameter.default)]),
  );
}

function normalizeNumber(value, definition, fallback) {
  let number = Number(value);
  if (!Number.isFinite(number)) number = fallback;
  if (Number.isFinite(definition.min)) number = Math.max(definition.min, number);
  if (Number.isFinite(definition.max)) number = Math.min(definition.max, number);
  if (definition.type === "integer") number = Math.round(number);
  return number;
}

function normalizeParameterValue(value, definition) {
  if (definition.type === "boolean") return value === true;
  if (["string", "asset", "enum"].includes(definition.type)) {
    const text = String(value ?? definition.default);
    if (definition.type === "enum" && !definition.options?.some((option) => option.value === text)) {
      return definition.default;
    }
    return text;
  }
  if (definition.type === "color") {
    const source = Array.isArray(value) ? value : definition.default;
    return [0, 1, 2, 3].map((index) => {
      const fallback = definition.default[index] ?? (index === 3 ? 1 : 0);
      return Number.isFinite(Number(source[index])) ? Math.min(1, Math.max(0, Number(source[index]))) : fallback;
    });
  }
  if (definition.type === "vector2" || definition.type === "vector3") {
    const length = definition.type === "vector2" ? 2 : 3;
    const source = Array.isArray(value) ? value : definition.default;
    return Array.from({ length }, (_, index) => normalizeNumber(source[index], definition, definition.default[index]));
  }
  return normalizeNumber(value, definition, definition.default);
}

export function normalizeBlockParameters(block, parameters = {}) {
  return Object.fromEntries(parameterDefinitions(block).map((definition) => [
    definition.key,
    normalizeParameterValue(parameters[definition.key] ?? definition.default, definition),
  ]));
}

function blockGeometry(blockType, parameters) {
  const vector = (key, fallback) => Array.isArray(parameters[key]) ? parameters[key] : fallback;
  const number = (key, fallback) => Number.isFinite(parameters[key]) ? parameters[key] : fallback;
  let width = 100;
  let depth = 100;
  let height = 100;

  switch (blockType) {
    case "box":
      [width, depth, height] = vector("BoxSize", [100, 100, 100]);
      break;
    case "cone":
      width = depth = number("ConeRadius", 50) * 2;
      height = number("ConeHeight", 100);
      break;
    case "corner-curved":
      width = depth = number("CornerCurvedRadius", 100);
      height = number("CornerCurvedHeight", 100);
      break;
    case "corner-ramp":
      [width, depth, height] = vector("CornerRampSize", [100, 100, 100]);
      break;
    case "cylinder":
      width = depth = number("CylinderRadius", 50) * 2;
      height = number("CylinderHeight", 100);
      break;
    case "doorway": {
      const size = vector("DoorwaySize", [50, 200, 250]);
      width = size[0];
      depth = size[1] + number("SideThickness", 50) * 2;
      height = size[2] + number("TopThickness", 50);
      break;
    }
    case "railing":
      width = number("RailingSections", 2) * number("SectionLenght", 120);
      depth = 20;
      height = 100 + Math.abs(number("SkewElevation", 0));
      break;
    case "ramp":
      [width, depth, height] = vector("RampSize", [100, 100, 100]);
      break;
    case "skewbox": {
      const length = vector("SkewboxLenght", [100, 0, 50]);
      const start = vector("StartSize", [100, 100]);
      const end = vector("EndSize", [100, 100]);
      width = Math.abs(length[0]);
      depth = Math.max(start[0], end[0]) + Math.abs(length[1]);
      height = Math.max(start[1], end[1]) + Math.abs(length[2]);
      break;
    }
    case "sphere":
      width = depth = number("SphereRadius", 50) * 2;
      height = number("SphereRadius", 50) * (parameters.bIsHemisphere ? 1 : 2);
      break;
    case "stairs-curved": {
      const outerRadius = number("InnerRadius", 50) + number("StepWidth", 100);
      width = depth = outerRadius * 2;
      height = number("StairsHeight", 100);
      break;
    }
    case "stairs-linear":
      [width, depth, height] = vector("StairsSize", [100, 100, 100]);
      break;
    case "stairs-linear-manual": {
      const count = number("NumberOfSteps", 10);
      width = number("StepWidth", 100);
      depth = count * (number("StepDepth", 10) + number("StepDepthSpacing", 0));
      height = count * (number("StepHeight", 10) + number("StepHeightSpacing", 0));
      break;
    }
    case "tube": {
      const outerRadius = number("Radius", 50) + number("Thickness", 10);
      width = depth = outerRadius * 2;
      height = number("Height", 100);
      break;
    }
    case "window": {
      const size = vector("WindowSize", [50, 200, 250]);
      width = size[0];
      depth = size[1] + number("SideThickness", 50) * 2;
      height = size[2] + number("TopThickness", 50) + number("BottomThickness", 100);
      break;
    }
    default:
      break;
  }
  return {
    width: usableSize(Math.abs(width), 100),
    depth: usableSize(Math.abs(depth), 100),
    height: usableSize(Math.abs(height), 100),
  };
}

export function resizeParametricShape(shape, block, widthValue, depthValue) {
  if (!shape?.ueBlockout || !block?.blockType) {
    throw new TypeError("A parameterized shape and block definition are required.");
  }
  const width = usableSize(Math.abs(widthValue), shape.width ?? 100);
  const depth = usableSize(Math.abs(depthValue), shape.height ?? 100);
  const parameters = normalizeBlockParameters(block, shape.ueBlockout.parameters);
  const vector = (key) => [...parameters[key]];

  switch (block.blockType) {
    case "box":
      parameters.BoxSize = [width, depth, vector("BoxSize")[2]];
      break;
    case "corner-ramp":
      parameters.CornerRampSize = [width, depth, vector("CornerRampSize")[2]];
      break;
    case "ramp":
      parameters.RampSize = [width, depth, vector("RampSize")[2]];
      break;
    case "stairs-linear":
      parameters.StairsSize = [width, depth, vector("StairsSize")[2]];
      break;
    case "doorway":
      parameters.DoorwaySize = [
        width,
        Math.max(1, depth - parameters.SideThickness * 2),
        vector("DoorwaySize")[2],
      ];
      break;
    case "window":
      parameters.WindowSize = [
        width,
        Math.max(1, depth - parameters.SideThickness * 2),
        vector("WindowSize")[2],
      ];
      break;
    case "railing":
      parameters.SectionLenght = width / Math.max(1, parameters.RailingSections);
      break;
    case "skewbox": {
      const geometry = blockGeometry(block.blockType, parameters);
      const depthScale = depth / geometry.depth;
      const length = vector("SkewboxLenght");
      const start = vector("StartSize");
      const end = vector("EndSize");
      parameters.SkewboxLenght = [width, length[1] * depthScale, length[2]];
      parameters.StartSize = [start[0] * depthScale, start[1]];
      parameters.EndSize = [end[0] * depthScale, end[1]];
      break;
    }
    case "stairs-linear-manual": {
      const count = Math.max(1, parameters.NumberOfSteps);
      parameters.StepWidth = width;
      parameters.StepDepth = Math.max(1, depth / count - parameters.StepDepthSpacing);
      break;
    }
    case "corner-curved":
      parameters.CornerCurvedRadius = Math.max(width, depth);
      break;
    case "cone":
      parameters.ConeRadius = Math.max(width, depth) / 2;
      break;
    case "cylinder":
      parameters.CylinderRadius = Math.max(width, depth) / 2;
      break;
    case "sphere":
      parameters.SphereRadius = Math.max(width, depth) / 2;
      break;
    case "stairs-curved":
      parameters.StepWidth = Math.max(1, Math.max(width, depth) / 2 - parameters.InnerRadius);
      break;
    case "tube":
      parameters.Radius = Math.max(1, Math.max(width, depth) / 2 - parameters.Thickness);
      break;
    default:
      return { ...shape, width, height: depth, area: width * depth };
  }

  return applyBlockParametersToShape(shape, block, parameters);
}

function linearToHex(value) {
  const channel = (number) => Math.round(Math.min(1, Math.max(0, number)) * 255)
    .toString(16).padStart(2, "0");
  return `#${channel(value[0])}${channel(value[1])}${channel(value[2])}`.toUpperCase();
}

export function createUnifiedBlockCatalog(parametricSchema) {
  if (!parametricSchema || !Array.isArray(parametricSchema.blocks)) {
    throw new TypeError("UE parametric block schema must contain a blocks array.");
  }
  const ueBlocks = parametricSchema.blocks.map((entry) => ({
    ...entry,
    id: `ue-${entry.id}`,
    blockType: entry.id,
    source: "ue",
    kind: "shape",
    shapeType: entry.planShape === "circle" ? "circle" : "rect",
    category: "parametric",
    commonParameters: parametricSchema.commonParameters,
    available: true,
  }));
  return Object.freeze([...ORIGINAL_BLOCKS, ...ueBlocks]);
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function centeredRect(block, point, layerId) {
  const width = usableSize(block.width, 100);
  const height = usableSize(block.height, 100);
  return {
    id: createId(block.source === "ue" ? "ue-block" : "shape"),
    type: "rect",
    x: point.x - width / 2,
    y: point.y - height / 2,
    width,
    height,
    rotation: 0,
    color: DEFAULT_COLOR,
    opacity: DEFAULT_OPACITY,
    area: width * height,
    layerId,
  };
}

export function applyBlockParametersToShape(shape, block, parameterValues) {
  const parameters = normalizeBlockParameters(block, parameterValues);
  const geometry = blockGeometry(block.blockType, parameters);
  const center = shape.type === "circle"
    ? { x: shape.x, y: shape.y }
    : { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  const colorValue = parameters.blockout_material_color;
  const next = {
    ...shape,
    color: Array.isArray(colorValue) ? linearToHex(colorValue) : shape.color,
    ueBlockout: {
      kind: "parametric",
      blockType: block.blockType,
      blueprintAssetPath: block.blueprintAssetPath,
      blueprintClassPath: block.blueprintClassPath,
      parameters,
    },
  };
  if (block.shapeType === "circle") {
    const radius = Math.max(geometry.width, geometry.depth) / 2;
    Object.assign(next, { type: "circle", x: center.x, y: center.y, radius, area: Math.PI * radius * radius });
    delete next.width;
    delete next.height;
  } else {
    Object.assign(next, {
      type: "rect",
      x: center.x - geometry.width / 2,
      y: center.y - geometry.depth / 2,
      width: geometry.width,
      height: geometry.depth,
      area: geometry.width * geometry.depth,
    });
    delete next.radius;
  }
  return next;
}

export function createPlacedBlock(block, point, layerId, parameterValues) {
  if (!block || !layerId) throw new TypeError("Block and active layer are required.");
  if (block.kind === "entity") {
    return {
      collection: "entities",
      item: {
        id: createId("entity"),
        type: block.entityType,
        position: { x: point.x, y: point.y },
        rotation: 0,
        properties: {},
        layerId,
      },
    };
  }

  if (block.source === "ue") {
    const base = centeredRect({ ...block, width: 100, height: 100 }, point, layerId);
    return { collection: "shapes", item: applyBlockParametersToShape(base, block, parameterValues) };
  }

  let shape;
  if (block.shapeType === "circle") {
    const radius = usableSize(block.radius, Math.max(block.width ?? 100, block.height ?? 100) / 2);
    shape = {
      id: createId("shape"), type: "circle", x: point.x, y: point.y, radius,
      rotation: 0, color: DEFAULT_COLOR, opacity: DEFAULT_OPACITY,
      area: Math.PI * radius * radius, layerId,
    };
  } else if (block.shapeType === "wall") {
    const width = usableSize(block.width, 300);
    const thickness = usableSize(block.height, 20);
    shape = {
      ...centeredRect({ ...block, width, height: thickness }, point, layerId),
      type: "path",
      wallThickness: thickness,
      wallHeight: usableSize(block.wallHeight, 280),
      wallCenterline: [{ x: point.x - width / 2, y: point.y }, { x: point.x + width / 2, y: point.y }],
    };
  } else {
    shape = centeredRect(block, point, layerId);
  }
  if (block.shapeType === "stairs") {
    Object.assign(shape, {
      isStairs: true,
      stairsType: block.stairsType,
      stairsMode: block.stairsMode,
      stairsDirection: "vertical",
    });
  }
  return { collection: "shapes", item: shape };
}

export function getOriginalBlocks() {
  return ORIGINAL_BLOCKS;
}

export function normalizeAiLayout(level, catalog) {
  if (!level || !Array.isArray(level.shapes) || !Array.isArray(level.entities)) {
    throw new TypeError("AI layout must contain shapes and entities arrays.");
  }
  const ueByType = new Map(catalog.filter((block) => block.source === "ue").map((block) => [block.blockType, block]));
  const warnings = [];
  const shapes = level.shapes.map((shape) => {
    const requestedType = shape.ueBlockout?.blockType;
    if (!requestedType) return shape;
    const block = ueByType.get(requestedType);
    if (!block) {
      warnings.push(`未知 UE 参数化积木类型：${requestedType}`);
      const { ueBlockout: _ueBlockout, ...originalShape } = shape;
      return originalShape;
    }
    return applyBlockParametersToShape(shape, block, shape.ueBlockout?.parameters);
  });
  return { level: { ...level, shapes }, warnings };
}
