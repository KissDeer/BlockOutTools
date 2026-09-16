import { z } from "zod";

/**
 * 积木的 schema。
 *
 * 单独一个文件是为了切断循环：`concept.ts` 需要它（节点自己装几何），
 * 而 `project-schema.ts` 又需要 `concept.ts` 的拓扑 schema。
 */

export const finiteNumber = z.number().finite();
export const positiveNumber = finiteNumber.positive();
export const vec2 = z.tuple([finiteNumber, finiteNumber]);
export const vec3 = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
export const rgba = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)]);
export const transform = z.object({ position: vec3, rotation: finiteNumber });

const blockBase = z.object({
  id: z.string().min(1), name: z.string().min(1), transform,
  provenance: z.object({ sourceId: z.string(), featureId: z.string().min(1), status: z.enum(["estimated", "confirmed"]), note: z.string() }).optional(),
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
