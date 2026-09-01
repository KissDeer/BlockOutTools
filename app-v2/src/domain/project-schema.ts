import { z } from "zod";

const finiteNumber = z.number().finite();
const positiveNumber = finiteNumber.positive();
const vec2 = z.tuple([finiteNumber, finiteNumber]);
const vec3 = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const rgba = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
const transform = z.object({ position: vec3, rotation: finiteNumber });
const blockBase = z.object({ id: z.string().min(1), name: z.string().min(1), transform });

const block = z.discriminatedUnion("type", [
  blockBase.extend({
    type: z.literal("box"),
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

export const projectSchema = z.object({
  schemaVersion: z.literal(2),
  projectId: z.string().min(1),
  name: z.string().min(1),
  modules: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), revision: z.number().int().nonnegative(), blocks: z.array(block) })),
  instances: z.array(z.object({ id: z.string().min(1), definitionId: z.string().min(1), name: z.string().min(1), graphPosition: vec2, assemblyTransform: transform })),
  connections: z.array(z.object({
    id: z.string().min(1),
    type: z.enum(["door", "one-way-door", "stairs", "spiral-stairs", "elevator", "one-way-elevator", "road", "drop"]),
    sourceInstanceId: z.string().min(1),
    sourcePortId: z.string().min(1),
    targetInstanceId: z.string().min(1),
    targetPortId: z.string().min(1),
    waypoints: z.array(vec2),
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
});
