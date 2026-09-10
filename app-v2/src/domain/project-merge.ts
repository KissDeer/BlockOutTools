import type { BlockoutProject } from "./types";
import { projectSchema } from "./project-schema";
import { stableJson } from "./stable-json";

const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Arrays of identified objects merge by identity; vectors and paths merge as a field. */
export function mergeProjects(base: BlockoutProject, local: BlockoutProject, incoming: BlockoutProject): { project: BlockoutProject; conflicts: string[] } {
  if (base.projectId !== local.projectId || base.projectId !== incoming.projectId) throw new Error("只能合并同一项目的版本");
  const conflicts: string[] = [];
  function merge(a: unknown, b: unknown, c: unknown, path: string): unknown {
    if (same(b, c) || same(a, c)) return b;
    if (same(a, b)) return c;
    if (path.endsWith(".updatedAt")) return [String(b), String(c)].sort().at(-1);
    if (path.endsWith(".revision") && typeof b === "number" && typeof c === "number") return Math.max(b, c) + 1;
    if (Array.isArray(a) && Array.isArray(b) && Array.isArray(c) && [...a, ...b, ...c].every((item) => object(item) && typeof item.id === "string")) {
      const ids = [...new Set([...b, ...c].map((item) => item.id))];
      return ids.map((id) => merge(a.find((item) => item.id === id), b.find((item) => item.id === id), c.find((item) => item.id === id), `${path}[${id}]`)).filter((item) => item !== undefined);
    }
    if (object(a) && object(b) && object(c)) {
      return Object.fromEntries([...new Set([...Object.keys(b), ...Object.keys(c)])].map((key) => [key, merge(a[key], b[key], c[key], `${path}.${key}`)]).filter(([, value]) => value !== undefined));
    }
    conflicts.push(path);
    return b;
  }
  const result = merge(base, local, incoming, "project");
  const parsed = projectSchema.safeParse(result);
  if (!parsed.success) return { project: local, conflicts: [...conflicts, ...parsed.error.issues.map((issue) => issue.message)] };
  return { project: parsed.data, conflicts };
}
