import { z } from "zod";
import { logicTopologySchema } from "./concept";

const finiteNumber = z.number().finite();
const positiveNumber = finiteNumber.positive();
const vec2 = z.tuple([finiteNumber, finiteNumber]);
const vec3 = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const rgba = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
const transform = z.object({ position: vec3, rotation: finiteNumber });
const blockBase = z.object({ id: z.string().min(1), name: z.string().min(1), transform,
  provenance: z.object({ sourceId: z.string(), featureId: z.string().min(1), status: z.enum(["estimated", "confirmed"]), note: z.string() }).optional(),
});

export const referenceSchema = z.object({
  id: z.string().min(1), name: z.string().min(1),
  imageData: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(16_000_000),
  pixelSize: z.tuple([positiveNumber, positiveNumber]), origin: vec2,
  cmPerPixel: positiveNumber, rotation: finiteNumber, opacity: finiteNumber.min(0).max(1),
  visible: z.boolean(), confirmed: z.boolean(), legend: z.string(),
});

export const blockSchema = z.discriminatedUnion("type", [
  blockBase.extend({
    type: z.literal("box"),
    role: z.enum(["solid", "floor", "wall", "edging", "landing"]).optional(),
    elevationReference: z.enum(["bottom", "surface"]).optional(),
    parameters: z.object({ BoxSize: z.tuple([positiveNumber, positiveNumber, positiveNumber]), blockout_material_color: rgba, blockout_material_top_color: rgba }),
  }),
  blockBase.extend({
    type: z.literal("doorway"),
    parameters: z.object({ DoorwaySize: z.tuple([positiveNumber, positiveNumber, positiveNumber]), TopThickness: finiteNumber.nonnegative(), SideThickness: finiteNumber.nonnegative(), blockout_material_color: rgba, blockout_material_top_color: rgba }),
  }),
  blockBase.extend({
    type: z.literal("stairs-linear"),
    parameters: z.object({ StairsSize: z.tuple([positiveNumber, positiveNumber, positiveNumber]), NumberOfSteps: z.number().int().min(1).max(1000), StairsType: z.enum(["BOX", "CLOSED", "SLOPED"]), blockout_material_color: rgba, blockout_material_top_color: rgba }),
  }),
  blockBase.extend({
    type: z.literal("port"),
    parameters: z.object({ width: positiveNumber, depth: positiveNumber }),
  }),
]);

export const designMaterialSchema = z.object({
  id: z.string().min(1), name: z.string().min(1),
  kind: z.enum(["structure", "mood", "rules", "note"]),
  text: z.string(),
  imageData: z.string().max(16_000_000).refine((value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value), "图片格式无效"),
  moduleIds: z.array(z.string().min(1)),
});

export const projectSchema = z.object({
  schemaVersion: z.literal(2),
  projectId: z.string().min(1),
  name: z.string().min(1),
  assemblyAnchorInstanceId: z.string().min(1).optional(),
  modules: z.array(z.object({
    id: z.string().min(1), name: z.string().min(1), revision: z.number().int().nonnegative(),
    blocks: z.array(blockSchema), reference: referenceSchema.optional(), interpretation: z.record(z.string(), z.unknown()).optional(),
    designBrief: z.object({ purpose: z.string(), goals: z.string() }).optional(),
    shapeConfirmation: z.object({ digest: z.string().min(1), confirmedAt: z.string().datetime() }).optional(),
  })),
  instances: z.array(z.object({ id: z.string().min(1), definitionId: z.string().min(1), name: z.string().min(1), graphPosition: vec2, assemblyTransform: transform, scopePath: z.array(z.string().min(1)).optional() })),
  connections: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["door", "one-way-door", "locked-door", "shortcut", "stairs", "spiral-stairs", "elevator", "one-way-elevator", "road", "drop"]),
    sourceInstanceId: z.string().min(1),
    sourcePortId: z.string().min(1),
    targetInstanceId: z.string().min(1),
    targetPortId: z.string().min(1),
    waypoints: z.array(vec2),
    spacing: z.object({ forward: finiteNumber, lateral: finiteNumber, vertical: finiteNumber }).optional(),
  })),
  blockoutProfile: z.object({
    enabled: z.boolean(),
    enforceUeImport: z.boolean(),
    capsuleRadius: positiveNumber,
    capsuleHalfHeight: positiveNumber,
    maxStepHeight: positiveNumber,
    minDoorWidth: positiveNumber,
    minDoorHeight: positiveNumber,
    maxStairRise: positiveNumber,
    minStairTread: positiveNumber,
  }),
  updatedAt: z.string().datetime(),
  concept: logicTopologySchema.optional(),
  designContext: z.object({ goal: z.string(), constraints: z.string(), materials: z.array(designMaterialSchema) }).optional(),
}).superRefine((project, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) fail(`${label}身份重复`); };
  unique(project.modules.map((item) => item.id), "模块");
  unique(project.instances.map((item) => item.id), "实例");
  unique(project.connections.map((item) => item.id), "连接");
  unique(project.modules.flatMap((item) => item.blocks.map((block) => block.id)), "积木");
  unique(project.designContext?.materials.map((item) => item.id) ?? [], "设计资料");
  for (const instance of project.instances) if (!project.modules.some((module) => module.id === instance.definitionId)) fail(`实例 ${instance.id} 引用了不存在的模块`);
  if (project.assemblyAnchorInstanceId && !project.instances.some((item) => item.id === project.assemblyAnchorInstanceId)) fail("组装基准实例不存在");
  const occupied = new Set<string>();
  for (const connection of project.connections) {
    if (connection.sourceInstanceId === connection.targetInstanceId) fail("连接两端必须属于不同实例");
    for (const [instanceId, portId] of [[connection.sourceInstanceId, connection.sourcePortId], [connection.targetInstanceId, connection.targetPortId]]) {
      const instance = project.instances.find((item) => item.id === instanceId);
      const module = project.modules.find((item) => item.id === instance?.definitionId);
      if (!module?.blocks.some((item) => item.id === portId && item.type === "port")) fail(`连接 ${connection.id} 的出入口引用无效`);
      const key = JSON.stringify([instanceId, portId]);
      if (occupied.has(key)) fail(`出入口 ${portId} 被重复连接`);
      occupied.add(key);
    }
  }
  for (const scope of project.concept ? [project.concept, ...project.concept.scopes] : []) {
    for (const node of scope.nodes) {
      if (node.moduleId && !project.modules.some((module) => module.id === node.moduleId)) fail(`作用域“${scope.name}”（${scope.id}）的逻辑节点“${node.name}”引用了不存在的模块`);
    }
    for (const group of scope.modules) {
      if (group.moduleDefinitionId && !project.modules.some((module) => module.id === group.moduleDefinitionId)) fail(`作用域“${scope.name}”（${scope.id}）的拆解模块“${group.name}”引用了不存在的模块定义`);
    }
  }
});
