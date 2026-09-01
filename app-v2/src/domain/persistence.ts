import type { BlockoutProject } from "./types";
import { projectSchema } from "./project-schema";

const DRAFT_KEY = "blockout-tools-v2:draft:1";

export function loadDraft(): BlockoutProject | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = projectSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDraft(project: BlockoutProject): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
}

export function parseProjectFile(text: string): BlockoutProject {
  return projectSchema.parse(JSON.parse(text));
}

export function downloadProject(project: BlockoutProject): void {
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.name.replace(/[\\/:*?"<>|]+/g, "-") || "blockout-project"}.blockout.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
