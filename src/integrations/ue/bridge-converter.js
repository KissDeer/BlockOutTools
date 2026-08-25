const CATEGORY_COLORS = Object.freeze({
  architecture: "#7C6F64",
  box: "#8E8E86",
  cone: "#B7791F",
  corner: "#2563EB",
  cylinder: "#0F766E",
  hemisphere: "#7C3AED",
  railing: "#475569",
  ramp: "#D97706",
  sphere: "#9333EA",
  step: "#EA580C",
  tube: "#0891B2",
  wedge: "#DC2626",
});

const DEFAULT_LAYER_ID = "ue-layer-0";

const EXPORT_UNIT_TO_CENTIMETERS = Object.freeze({
  mm: 0.1,
  cm: 1,
  m: 100,
  inch: 2.54,
  feet: 30.48,
  uu: 1,
});

function assertFiniteNumber(value, field) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number.`);
  }
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function resolveUnitConversion(level) {
  const configured = level.exportScale;
  const unitsPerCentimeter = Number(configured?.unitsPerPixel);
  const sourceUnit = EXPORT_UNIT_TO_CENTIMETERS[configured?.unit] ? configured.unit : "cm";
  const normalizedUnits = Number.isFinite(unitsPerCentimeter) && unitsPerCentimeter > 0
    ? unitsPerCentimeter
    : 1;
  return {
    sourceUnitsPerCentimeter: normalizedUnits,
    sourceUnit,
    unrealCentimetersPerLayoutCentimeter: normalizedUnits * EXPORT_UNIT_TO_CENTIMETERS[sourceUnit],
  };
}

function scaleCentimeterParameters(block, parameters, scale) {
  const scaled = { ...parameters };
  for (const definition of [...block.parameters, ...block.commonParameters]) {
    if (definition.unit !== "cm" || !(definition.key in scaled)) continue;
    const value = scaled[definition.key];
    scaled[definition.key] = Array.isArray(value)
      ? value.map((component) => round(component * scale))
      : round(value * scale);
  }
  return scaled;
}

function vectorFrom(value, field) {
  if (Array.isArray(value) && value.length === 3) {
    value.forEach((item, index) => assertFiniteNumber(item, `${field}[${index}]`));
    return value;
  }

  if (value && typeof value === "object") {
    const vector = [value.x, value.y, value.z];
    vector.forEach((item, index) => assertFiniteNumber(item, `${field}.${"xyz"[index]}`));
    return vector;
  }

  throw new TypeError(`${field} must contain x, y and z values.`);
}

function normalizeCatalog(catalog) {
  const assets = Array.isArray(catalog) ? catalog : catalog?.assets;
  if (!Array.isArray(assets)) {
    throw new TypeError("UE catalog must contain an assets array.");
  }

  return new Map(
    assets.map((asset) => {
      const path = asset.path ?? asset.assetPath;
      const boundsMin = vectorFrom(asset.bounds_min ?? asset.boundsMinCm, `${path}.boundsMin`);
      const boundsMax = vectorFrom(asset.bounds_max ?? asset.boundsMaxCm, `${path}.boundsMax`);
      return [path, {
        ...asset,
        path,
        boundsMin,
        boundsMax,
        nativeSize: boundsMax.map((maximum, index) => maximum - boundsMin[index]),
      }];
    }),
  );
}

export function createMappingIndex(mapping) {
  if (!mapping || !Array.isArray(mapping.assets)) {
    throw new TypeError("UE blockout mapping must contain an assets array.");
  }

  const byId = new Map();
  const byPath = new Map();
  for (const entry of mapping.assets) {
    if (!entry.id || !entry.assetPath) {
      throw new TypeError("Every UE blockout mapping needs id and assetPath.");
    }
    if (byId.has(entry.id) || byPath.has(entry.assetPath)) {
      throw new TypeError(`Duplicate UE blockout mapping: ${entry.id}`);
    }
    byId.set(entry.id, entry);
    byPath.set(entry.assetPath, entry);
  }

  return { byId, byPath };
}

export function validateLayoutLevel(level) {
  if (!level || typeof level !== "object") {
    throw new TypeError("LayoutTools document must be an object.");
  }
  for (const field of ["shapes", "entities", "layers"]) {
    if (!Array.isArray(level[field])) {
      throw new TypeError(`LayoutTools document is missing ${field}.`);
    }
  }
  return level;
}

function resolveMapping(shape, mapping, index) {
  const metadata = shape.ueBlockout ?? {};
  if (metadata.assetId && index.byId.has(metadata.assetId)) {
    return index.byId.get(metadata.assetId);
  }
  if (metadata.assetPath && index.byPath.has(metadata.assetPath)) {
    return index.byPath.get(metadata.assetPath);
  }

  let fallbackId = mapping.fallbacks?.rect;
  if (shape.isStairs) {
    fallbackId = shape.stairsMode === "steps"
      ? mapping.fallbacks?.stairsSteps
      : mapping.fallbacks?.stairsRamp;
  } else if (shape.wallCenterline?.length >= 2) {
    fallbackId = mapping.fallbacks?.wall;
  } else if (shape.type === "circle") {
    fallbackId = mapping.fallbacks?.circle;
  }
  return index.byId.get(fallbackId);
}

function layerHeight(level, layerId) {
  return level.layers.find((layer) => layer.id === layerId)?.height ?? 0;
}

function shapeHeight(shape, level, projectConfig, catalogAsset) {
  const explicitHeight = shape.ueBlockout?.heightCm ?? shape.wallHeight;
  if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
    return explicitHeight;
  }

  if (shape.isStairs && shape.stairsTargetLayerId) {
    const heightDelta = Math.abs(
      layerHeight(level, shape.stairsTargetLayerId) - layerHeight(level, shape.layerId),
    );
    if (heightDelta > 0) {
      return heightDelta;
    }
  }

  if (shape.wallCenterline?.length >= 2) {
    return projectConfig.defaults.wallHeightCm;
  }
  return shape.ueBlockout ? catalogAsset.nativeSize[2] : projectConfig.defaults.blockHeightCm;
}

function createActorPlan({
  actorFolder,
  actorTag,
  asset,
  centerWeb,
  dimensions,
  label,
  rotationWeb,
  sourceId,
  sourceKind,
  zBase,
}) {
  const scale = dimensions.map((dimension, index) => dimension / asset.nativeSize[index]);
  if (scale.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError(`Invalid dimensions for ${sourceId}: ${dimensions.join(", ")}`);
  }

  const yaw = -rotationWeb;
  const radians = yaw * Math.PI / 180;
  const localCenter = asset.boundsMin.map(
    (minimum, index) => (minimum + asset.boundsMax[index]) * 0.5 * scale[index],
  );
  const rotatedCenterX = localCenter[0] * Math.cos(radians) - localCenter[1] * Math.sin(radians);
  const rotatedCenterY = localCenter[0] * Math.sin(radians) + localCenter[1] * Math.cos(radians);
  const centerUnreal = [centerWeb[0], -centerWeb[1]];

  return {
    id: sourceId,
    sourceId,
    sourceKind,
    label,
    assetPath: asset.path,
    folder: actorFolder,
    tags: [actorTag, `LayoutToolsId:${sourceId}`],
    location: [
      round(centerUnreal[0] - rotatedCenterX),
      round(centerUnreal[1] - rotatedCenterY),
      round(zBase - asset.boundsMin[2] * scale[2]),
    ],
    rotation: [0, round(yaw), 0],
    scale3d: scale.map((value) => round(value)),
    desiredSizeCm: dimensions.map((value) => round(value)),
  };
}

function shapeFootprint(shape) {
  if (shape.type === "circle") {
    assertFiniteNumber(shape.x, `${shape.id}.x`);
    assertFiniteNumber(shape.y, `${shape.id}.y`);
    assertFiniteNumber(shape.radius, `${shape.id}.radius`);
    return {
      center: [shape.x, shape.y],
      width: shape.radius * 2,
      depth: shape.radius * 2,
    };
  }

  for (const field of ["x", "y", "width", "height"]) {
    assertFiniteNumber(shape[field], `${shape.id}.${field}`);
  }
  return {
    center: [shape.x + shape.width / 2, shape.y + shape.height / 2],
    width: shape.width,
    depth: shape.height,
  };
}

function createParametricIndex(parametricSchema) {
  if (!parametricSchema || !Array.isArray(parametricSchema.blocks)) {
    throw new TypeError("UE parametric schema must contain a blocks array.");
  }
  const catalog = createUnifiedBlockCatalog(parametricSchema).filter((block) => block.source === "ue");
  return {
    catalog,
    byType: new Map(catalog.map((block) => [block.blockType, block])),
    byClassPath: new Map(catalog.map((block) => [block.blueprintClassPath, block])),
  };
}

function createParametricActorPlan(
  shape,
  block,
  parameters,
  levelFolder,
  projectConfig,
  zBase,
  unitScaleCm,
) {
  const footprint = shapeFootprint(shape);
  const normalizedParameters = normalizeBlockParameters(block, parameters);
  return {
    id: String(shape.id),
    sourceId: String(shape.id),
    sourceKind: "parametric",
    actorKind: "parametric",
    blockType: block.blockType,
    label: shape.label ?? block.ueLabel,
    blueprintAssetPath: block.blueprintAssetPath,
    blueprintClassPath: block.blueprintClassPath,
    folder: levelFolder,
    tags: [projectConfig.actorTag, `LayoutToolsId:${shape.id}`, `BlockoutType:${block.blockType}`],
    location: [
      round(footprint.center[0] * unitScaleCm),
      round(-footprint.center[1] * unitScaleCm),
      round(zBase * unitScaleCm),
    ],
    rotation: [0, round(-(shape.rotation ?? 0)), 0],
    scale3d: [1, 1, 1],
    parameters: scaleCentimeterParameters(block, normalizedParameters, unitScaleCm),
  };
}

function wallSegmentPlans(shape, context) {
  const plans = [];
  const points = shape.wallCenterline;
  const thickness = (shape.wallThickness ?? shape.strokeWidth ?? 12) * context.unitScaleCm;
  const height = shapeHeight(shape, context.level, context.projectConfig, context.catalogAsset)
    * context.unitScaleCm;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length < 0.01) {
      context.warnings.push(`${shape.id}: skipped zero-length wall segment ${index}.`);
      continue;
    }
    plans.push(createActorPlan({
      actorFolder: context.actorFolder,
      actorTag: context.actorTag,
      asset: context.catalogAsset,
      centerWeb: [
        (start.x + end.x) / 2 * context.unitScaleCm,
        (start.y + end.y) / 2 * context.unitScaleCm,
      ],
      dimensions: [length * context.unitScaleCm, thickness, height],
      label: `${shape.label ?? "Wall"}_${index + 1}`,
      rotationWeb: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
      sourceId: `${shape.id}:segment:${index}`,
      sourceKind: "wall-segment",
      zBase: context.zBase,
    }));
  }
  return plans;
}

export function buildImportPlan(levelValue, mapping, catalog, projectConfig, parametricSchema) {
  const level = validateLayoutLevel(levelValue);
  const mappingIndex = createMappingIndex(mapping);
  const catalogIndex = normalizeCatalog(catalog);
  const actors = [];
  const warnings = [];
  const levelFolder = `${projectConfig.actorFolder}/${sanitizeName(level.name || "Untitled_Level")}`;
  const parametricIndex = createParametricIndex(parametricSchema);
  const unitConversion = resolveUnitConversion(level);
  const unitScaleCm = unitConversion.unrealCentimetersPerLayoutCentimeter;

  for (const shape of level.shapes) {
    if (shape.ueBlockout?.kind === "parametric" || shape.ueBlockout?.blockType) {
      const block = parametricIndex.byType.get(shape.ueBlockout.blockType);
      if (!block) {
        warnings.push(`${shape.id ?? "unknown"}: unknown parametric block type ${shape.ueBlockout.blockType}.`);
        continue;
      }
      try {
        actors.push(createParametricActorPlan(
          shape,
          block,
          shape.ueBlockout.parameters,
          levelFolder,
          projectConfig,
          layerHeight(level, shape.layerId),
          unitScaleCm,
        ));
      } catch (error) {
        warnings.push(`${shape.id ?? "unknown"}: ${error.message}`);
      }
      continue;
    }
    const mappingEntry = resolveMapping(shape, mapping, mappingIndex);
    if (!mappingEntry) {
      warnings.push(`${shape.id ?? "unknown"}: no UE mapping was found.`);
      continue;
    }
    const catalogAsset = catalogIndex.get(mappingEntry.assetPath);
    if (!catalogAsset) {
      warnings.push(`${shape.id ?? "unknown"}: UE asset is missing: ${mappingEntry.assetPath}`);
      continue;
    }

    const zBase = layerHeight(level, shape.layerId) * unitScaleCm;
    const context = {
      actorFolder: levelFolder,
      actorTag: projectConfig.actorTag,
      catalogAsset,
      level,
      projectConfig,
      warnings,
      zBase,
      unitScaleCm,
    };
    if (shape.wallCenterline?.length >= 2 && !shape.ueBlockout?.assetId && !shape.ueBlockout?.assetPath) {
      actors.push(...wallSegmentPlans(shape, context));
      continue;
    }

    try {
      const footprint = shapeFootprint(shape);
      const height = shapeHeight(shape, level, projectConfig, catalogAsset) * unitScaleCm;
      actors.push(createActorPlan({
        actorFolder: levelFolder,
        actorTag: projectConfig.actorTag,
        asset: catalogAsset,
        centerWeb: footprint.center.map((value) => value * unitScaleCm),
        dimensions: [footprint.width * unitScaleCm, footprint.depth * unitScaleCm, height],
        label: shape.label ?? mappingEntry.id,
        rotationWeb: shape.rotation ?? 0,
        sourceId: String(shape.id ?? `shape-${actors.length + 1}`),
        sourceKind: shape.isStairs ? "stairs" : shape.type,
        zBase,
      }));
    } catch (error) {
      warnings.push(`${shape.id ?? "unknown"}: ${error.message}`);
    }
  }

  for (const entity of level.entities) {
    if (entity.ueBlockout?.assetId || entity.ueBlockout?.assetPath) {
      warnings.push(`${entity.id ?? "unknown"}: mapped entities are not supported yet; use a shape.`);
    }
  }

  return {
    schemaVersion: 2,
    mode: "dry-run",
    projectName: projectConfig.projectName,
    sourceLevelName: level.name ?? "Untitled Level",
    actorFolder: levelFolder,
    actorCount: actors.length,
    actors,
    warnings,
    unitConversion,
  };
}

function sanitizeName(value) {
  return String(value).trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "Untitled_Level";
}

function assetDisplayName(assetPath) {
  return assetPath.split("/").at(-1) ?? assetPath;
}

function findOrCreateLayer(layers, height, tolerance) {
  let layer = layers.find((candidate) => Math.abs(candidate.height - height) <= tolerance);
  if (!layer) {
    layer = {
      id: `ue-layer-${layers.length}`,
      name: `UE Z ${round(height, 2)}cm`,
      visible: true,
      locked: false,
      height: round(height),
      color: "#8E8E86",
      showWalls: true,
    };
    layers.push(layer);
  }
  return layer;
}

export function actorSnapshotToLayoutLevel(snapshot, mapping, catalog, projectConfig, parametricSchema) {
  const actors = Array.isArray(snapshot) ? snapshot : snapshot?.actors;
  if (!Array.isArray(actors)) {
    throw new TypeError("UE actor snapshot must contain an actors array.");
  }
  const mappingIndex = createMappingIndex(mapping);
  const catalogIndex = normalizeCatalog(catalog);
  const layers = [];
  const shapes = [];
  const warnings = [];
  const parametricIndex = createParametricIndex(parametricSchema);

  for (const actor of actors) {
    const parametricBlock = parametricIndex.byClassPath.get(actor.blueprintClassPath);
    if (parametricBlock) {
      try {
        const location = vectorFrom(actor.location, `${actor.label}.location`);
        const rotation = vectorFrom(actor.rotation, `${actor.label}.rotation`);
        const layer = findOrCreateLayer(
          layers,
          location[2],
          projectConfig.defaults.layerMergeToleranceCm,
        );
        const webCenter = { x: location[0], y: -location[1] };
        const base = parametricBlock.shapeType === "circle"
          ? {
            id: actor.sourceId ?? `ue-${shapes.length + 1}`,
            type: "circle",
            x: webCenter.x,
            y: webCenter.y,
            radius: 50,
            area: Math.PI * 2500,
          }
          : {
            id: actor.sourceId ?? `ue-${shapes.length + 1}`,
            type: "rect",
            x: webCenter.x - 50,
            y: webCenter.y - 50,
            width: 100,
            height: 100,
            area: 10000,
          };
        const shape = applyBlockParametersToShape({
          ...base,
          label: actor.label ?? parametricBlock.label,
          rotation: round(-rotation[1]),
          color: "#8E8E86",
          opacity: 0.5,
          layerId: layer.id,
        }, parametricBlock, actor.parameters);
        shape.ueBlockout.sourceActorPath = actor.path;
        shapes.push(shape);
      } catch (error) {
        warnings.push(`${actor.label ?? actor.path ?? "unknown"}: ${error.message}`);
      }
      continue;
    }
    const mappingEntry = mappingIndex.byPath.get(actor.assetPath);
    const asset = catalogIndex.get(actor.assetPath);
    if (!mappingEntry || !asset) {
      warnings.push(`${actor.label ?? actor.path ?? "unknown"}: asset is not in the bridge mapping.`);
      continue;
    }

    const location = vectorFrom(actor.location, `${actor.label}.location`);
    const scale = vectorFrom(actor.scale3d, `${actor.label}.scale3d`);
    const rotation = vectorFrom(actor.rotation, `${actor.label}.rotation`);
    const yaw = rotation[1];
    const radians = yaw * Math.PI / 180;
    const localCenter = asset.boundsMin.map(
      (minimum, index) => (minimum + asset.boundsMax[index]) * 0.5 * scale[index],
    );
    const centerX = location[0] + localCenter[0] * Math.cos(radians) - localCenter[1] * Math.sin(radians);
    const centerY = location[1] + localCenter[0] * Math.sin(radians) + localCenter[1] * Math.cos(radians);
    const width = Math.abs(asset.nativeSize[0] * scale[0]);
    const depth = Math.abs(asset.nativeSize[1] * scale[1]);
    const height = Math.abs(asset.nativeSize[2] * scale[2]);
    const zBase = location[2] + asset.boundsMin[2] * scale[2];
    const layer = findOrCreateLayer(
      layers,
      zBase,
      projectConfig.defaults.layerMergeToleranceCm,
    );
    const base = {
      id: actor.sourceId ?? `ue-${shapes.length + 1}`,
      type: mappingEntry.webType,
      label: actor.label ?? assetDisplayName(actor.assetPath),
      rotation: round(-yaw),
      color: CATEGORY_COLORS[mappingEntry.category] ?? "#8E8E86",
      opacity: 0.5,
      layerId: layer.id,
      ueBlockout: {
        assetId: mappingEntry.id,
        assetPath: mappingEntry.assetPath,
        heightCm: round(height),
        sourceActorPath: actor.path,
      },
    };
    if (mappingEntry.webType === "circle") {
      const radius = Math.max(width, depth) / 2;
      shapes.push({
        ...base,
        x: round(centerX),
        y: round(-centerY),
        radius: round(radius),
        area: round(Math.PI * radius * radius),
      });
    } else {
      shapes.push({
        ...base,
        x: round(centerX - width / 2),
        y: round(-centerY - depth / 2),
        width: round(width),
        height: round(depth),
        area: round(width * depth),
      });
    }
  }

  if (layers.length === 0) {
    layers.push({
      id: DEFAULT_LAYER_ID,
      name: "Base Layer",
      visible: true,
      locked: false,
      height: 0,
      color: "#8E8E86",
      showWalls: true,
    });
  }
  layers.sort((left, right) => left.height - right.height);

  return {
    level: {
      name: `${projectConfig.projectName}_Blockout_Export`,
      gridSize: 50,
      showDimensions: true,
      rotationStep: 15,
      shapes,
      entities: [],
      layers,
      layerGroups: [],
      groups: [],
      doorColorConfigs: [{ color: "#D92D20", height: 210 }],
      windowColorConfigs: [{ color: "#2563EB", sillHeight: 90, height: 120 }],
      polygonData: [],
    },
    warnings,
  };
}

export function createBlockPaletteLevel(mapping, catalog, projectConfig, parametricSchema) {
  const parametricIndex = createParametricIndex(parametricSchema);
  const shapes = [];
  const warnings = [];
  const columns = 5;
  const cellWidth = 360;
  const cellHeight = 360;
  const margin = 40;

  for (const [index, block] of parametricIndex.catalog.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const centerX = margin + column * cellWidth + cellWidth / 2;
    const centerY = margin + row * cellHeight + cellHeight / 2;
    const placed = createPlacedBlock(block, { x: centerX, y: centerY }, DEFAULT_LAYER_ID);
    placed.item.id = `ue-block-${block.blockType}`;
    placed.item.label = block.label;
    shapes.push(placed.item);
  }

  return {
    level: {
      name: `${projectConfig.projectName}_BlockoutTools_Palette`,
      gridSize: 50,
      showDimensions: true,
      rotationStep: 15,
      shapes,
      entities: [],
      layers: [{
        id: DEFAULT_LAYER_ID,
        name: "UE BlockoutTools",
        visible: true,
        locked: false,
        height: 0,
        color: "#8E8E86",
        showWalls: true,
      }],
      layerGroups: [],
      groups: [],
      doorColorConfigs: [{ color: "#D92D20", height: 210 }],
      windowColorConfigs: [{ color: "#2563EB", sillHeight: 90, height: 120 }],
      polygonData: [],
    },
    warnings,
  };
}
import {
  applyBlockParametersToShape,
  createPlacedBlock,
  createUnifiedBlockCatalog,
  normalizeBlockParameters,
} from "../layout/block-catalog.js";
