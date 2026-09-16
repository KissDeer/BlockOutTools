import { z } from "zod";
import { logicKeySchema, logicLinkSchema, logicNodeSchema } from "./concept";
import { blockSchema, designMaterialSchema } from "./project-schema";
import type { Block } from "./types";
import type { ModuleContext } from "./workflow-context";

export interface ModuleDraft {
  version: 1;
  requestId: string;
  projectId: string;
  moduleId: string;
  contextDigest: string;
  geometryDigest: string;
  source: "agent" | "template";
  blocks: Block[];
  assumptions: string[];
}

export interface ModuleDraftRequest {
  version: 1;
  requestId: string;
  projectId: string;
  moduleId: string;
  contextDigest: string;
  geometryDigest: string;
  intent: string;
  context: ModuleContext;
  existingBlocks: Block[];
  createdAt: string;
  instructions: string[];
}

const identityFields = {
  version: z.literal(1), requestId: z.string().min(1), projectId: z.string().min(1), moduleId: z.string().min(1),
  contextDigest: z.string().min(1), geometryDigest: z.string().min(1),
};

export const moduleDraftSchema = z.object({
  ...identityFields, source: z.enum(["agent", "template"]), blocks: z.array(blockSchema).min(1).max(2000), assumptions: z.array(z.string()).max(200),
}).strict();

export const moduleDraftRequestSchema = z.object({
  ...identityFields, intent: z.string(), existingBlocks: z.array(blockSchema), createdAt: z.string().datetime(), instructions: z.array(z.string()),
  context: z.object({
    moduleId: z.string(), moduleName: z.string(), sourceId: z.string(), scopeIds: z.array(z.string()),
    goal: z.string(), constraints: z.string(), purpose: z.string(), goals: z.string(),
    nodes: z.array(logicNodeSchema), internalLinks: z.array(logicLinkSchema), externalLinks: z.array(logicLinkSchema), keys: z.array(logicKeySchema),
    materials: z.array(designMaterialSchema.extend({ source: z.string(), calibration: z.unknown().optional() })),
    sources: z.array(z.string()), warnings: z.array(z.string()), contextDigest: z.string(), ambiguous: z.boolean(),
  }),
}).strict().refine((request) => request.moduleId === request.context.moduleId && request.contextDigest === request.context.contextDigest, "请求目标与上下文不一致");
