import type { BlockoutProject } from "./types";
import { assertNotLegacyProject, projectSchema } from "./project-schema";

const DRAFT_KEY = "blockout-tools-v2:draft:1";

/**
 * 唯一的读入口。两道门都要走：
 * 1. 旧格式先给人话原因（`assertNotLegacyProject`），否则拿到的只是一串 Zod 路径；
 * 2. 剩下的交给 schema，`concept` 必填 —— 缺几何的项目在这里就被挡下，不会静默变成空项目。
 */
function parseProject(raw: unknown): BlockoutProject {
  assertNotLegacyProject(raw);
  return projectSchema.parse(raw);
}

export function loadDraft(): BlockoutProject | null {
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return null;
    return parseProject(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function saveDraft(project: BlockoutProject): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
}

export function archiveDraft(project: BlockoutProject): void {
  localStorage.setItem(`blockout-v2:recovery:${project.projectId}`, JSON.stringify(project));
}

export function parseProjectFile(text: string): BlockoutProject {
  return parseProject(JSON.parse(text));
}

export function downloadProject(project: BlockoutProject): void {
  downloadJson(project, `${project.name.replace(/[\\/:*?"<>|]+/g, "-") || "blockout-project"}.blockout.json`);
}

export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
