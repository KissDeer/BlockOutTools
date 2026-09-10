import { parseProjectFile } from "../../domain/persistence";
import type { BlockoutProject } from "../../domain/types";

export interface DiskProject { project: BlockoutProject; revision: string; key: string }
export interface LibraryList { root: string; items: { key: string; name: string; updatedAt: string }[] }

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "本地项目库不可用");
  return result;
}
export async function listProjects(): Promise<LibraryList> { return request("/api/projects"); }
export async function readProject(key: string): Promise<DiskProject> {
  const result = await request(`/api/projects/${encodeURIComponent(key)}`);
  return { ...result, project: parseProjectFile(JSON.stringify(result.project)) };
}
export async function writeProject(project: BlockoutProject, revision: string | null): Promise<DiskProject> {
  return request("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project, revision }) });
}
