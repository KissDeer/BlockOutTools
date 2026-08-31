export const DEFAULT_BLOCKOUT_PROFILE = Object.freeze({
  name: "默认第三人称角色",
  enabled: true,
  enforceUeImport: true,
  capsuleRadius: 42,
  capsuleHalfHeight: 96,
  eyeHeight: 64,
  maxStepHeight: 45,
  jumpHeight: 100,
  minDoorWidth: 100,
  minDoorHeight: 210,
  minCorridorWidth: 120,
  minHeadroom: 200,
  maxStairRiser: 20,
  minStairTread: 28,
  minLandingDepth: 100,
  maxRampSlope: 35,
});

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function normalizeBlockoutProfile(value = {}) {
  const profile = { ...DEFAULT_BLOCKOUT_PROFILE };
  profile.name = String(value.name ?? profile.name).trim() || profile.name;
  profile.enabled = value.enabled == null ? profile.enabled : value.enabled === true;
  profile.enforceUeImport = value.enforceUeImport == null ? profile.enforceUeImport : value.enforceUeImport === true;
  for (const key of Object.keys(DEFAULT_BLOCKOUT_PROFILE)) {
    if (["name", "enabled", "enforceUeImport"].includes(key)) continue;
    profile[key] = finitePositive(value[key], DEFAULT_BLOCKOUT_PROFILE[key]);
  }
  return profile;
}

export function blockoutProfile(level) {
  return normalizeBlockoutProfile(level?.blockoutProfile);
}

function finding(severity, code, shape, message, values = {}) {
  return {
    severity,
    code,
    itemId: String(shape.id ?? ""),
    layerId: shape.layerId ?? null,
    label: String(shape.name ?? shape.label ?? shape.id ?? "未命名积木"),
    message,
    values,
  };
}

function validateDoorway(shape, profile, findings) {
  const size = shape.ueBlockout?.parameters?.DoorwaySize;
  if (!Array.isArray(size)) return;
  const width = Number(size[1]);
  const height = Number(size[2]);
  if (width < profile.minDoorWidth) {
    findings.push(finding("error", "door-width", shape, `门洞宽 ${width}cm，小于规范 ${profile.minDoorWidth}cm`, { actual: width, required: profile.minDoorWidth }));
  }
  if (height < Math.max(profile.minDoorHeight, profile.minHeadroom)) {
    const required = Math.max(profile.minDoorHeight, profile.minHeadroom);
    findings.push(finding("error", "door-height", shape, `门洞高 ${height}cm，小于净空 ${required}cm`, { actual: height, required }));
  }
}

function validateLinearStairs(shape, profile, findings) {
  const parameters = shape.ueBlockout?.parameters ?? {};
  const size = parameters.StairsSize;
  const steps = Number(parameters.NumberOfSteps);
  if (!Array.isArray(size) || !Number.isFinite(steps) || steps <= 0) return;
  const [width, run, rise] = size.map(Number);
  const riser = rise / steps;
  const tread = run / steps;
  if (width < profile.minCorridorWidth) {
    findings.push(finding("warning", "stair-width", shape, `楼梯宽 ${width}cm，小于通行宽度 ${profile.minCorridorWidth}cm`, { actual: width, required: profile.minCorridorWidth }));
  }
  if (riser > profile.maxStairRiser) {
    findings.push(finding("error", "stair-riser", shape, `单级高度 ${riser.toFixed(1)}cm，超过 ${profile.maxStairRiser}cm`, { actual: riser, required: profile.maxStairRiser }));
  }
  if (tread < profile.minStairTread) {
    findings.push(finding("error", "stair-tread", shape, `踏步进深 ${tread.toFixed(1)}cm，小于 ${profile.minStairTread}cm`, { actual: tread, required: profile.minStairTread }));
  }
}

function validateManualStairs(shape, profile, findings) {
  const parameters = shape.ueBlockout?.parameters ?? {};
  const width = Number(parameters.StepWidth);
  const tread = Number(parameters.StepDepth) + Number(parameters.StepDepthSpacing ?? 0);
  const riser = Number(parameters.StepHeight) + Number(parameters.StepHeightSpacing ?? 0);
  if (width < profile.minCorridorWidth) {
    findings.push(finding("warning", "stair-width", shape, `楼梯宽 ${width}cm，小于通行宽度 ${profile.minCorridorWidth}cm`, { actual: width, required: profile.minCorridorWidth }));
  }
  if (riser > profile.maxStairRiser) {
    findings.push(finding("error", "stair-riser", shape, `单级高度 ${riser.toFixed(1)}cm，超过 ${profile.maxStairRiser}cm`, { actual: riser, required: profile.maxStairRiser }));
  }
  if (tread < profile.minStairTread) {
    findings.push(finding("error", "stair-tread", shape, `踏步进深 ${tread.toFixed(1)}cm，小于 ${profile.minStairTread}cm`, { actual: tread, required: profile.minStairTread }));
  }
}

function validateRamp(shape, profile, findings) {
  const size = shape.ueBlockout?.parameters?.RampSize;
  if (!Array.isArray(size)) return;
  const [run, width, rise] = size.map(Number);
  const slope = Math.atan2(Math.abs(rise), Math.max(0.001, Math.abs(run))) * 180 / Math.PI;
  if (width < profile.minCorridorWidth) {
    findings.push(finding("warning", "ramp-width", shape, `坡道宽 ${width}cm，小于通行宽度 ${profile.minCorridorWidth}cm`, { actual: width, required: profile.minCorridorWidth }));
  }
  if (slope > profile.maxRampSlope) {
    findings.push(finding("error", "ramp-slope", shape, `坡度 ${slope.toFixed(1)}°，超过 ${profile.maxRampSlope}°`, { actual: slope, required: profile.maxRampSlope }));
  }
}

function validateTaggedSpace(shape, profile, findings) {
  if (!Number.isFinite(Number(shape.width)) || !Number.isFinite(Number(shape.height))) return;
  const shortSide = Math.min(Math.abs(Number(shape.width)), Math.abs(Number(shape.height)));
  if (shape.layoutRole === "corridor" && shortSide < profile.minCorridorWidth) {
    findings.push(finding("error", "corridor-width", shape, `走廊净宽 ${shortSide}cm，小于 ${profile.minCorridorWidth}cm`, { actual: shortSide, required: profile.minCorridorWidth }));
  }
  if (shape.layoutRole === "landing" && shortSide < profile.minLandingDepth) {
    findings.push(finding("error", "landing-depth", shape, `落脚平台进深 ${shortSide}cm，小于 ${profile.minLandingDepth}cm`, { actual: shortSide, required: profile.minLandingDepth }));
  }
}

export function validateBlockoutLevel(level, profileValue = level?.blockoutProfile) {
  const profile = normalizeBlockoutProfile(profileValue);
  const findings = [];
  if (!profile.enabled) return { profile, findings, errorCount: 0, warningCount: 0 };
  for (const shape of level?.shapes ?? []) {
    const blockType = shape.ueBlockout?.blockType;
    if (blockType === "doorway") validateDoorway(shape, profile, findings);
    if (blockType === "stairs-linear") validateLinearStairs(shape, profile, findings);
    if (blockType === "stairs-linear-manual") validateManualStairs(shape, profile, findings);
    if (blockType === "ramp") validateRamp(shape, profile, findings);
    validateTaggedSpace(shape, profile, findings);
  }
  return {
    profile,
    findings,
    errorCount: findings.filter((item) => item.severity === "error").length,
    warningCount: findings.filter((item) => item.severity === "warning").length,
  };
}
