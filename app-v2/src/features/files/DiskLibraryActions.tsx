import { useEffect, useRef, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import { archiveDraft, downloadProject, loadDraft } from "../../domain/persistence";
import { mergeProjects } from "../../domain/project-merge";
import { stableJson } from "../../domain/stable-json";
import { createId } from "../../domain/ids";
import { useProjectStore } from "../../store/project-store";
import { IconButton } from "../../components/IconButton";
import { listProjects, readProject, writeProject, type DiskProject, type LibraryList } from "./local-library";
import { readDiskBaseline, writeDiskBaseline } from "./disk-baseline";

export function DiskLibraryActions() {
  const project = useProjectStore((state) => state.project);
  const binding = useRef<DiskProject | null>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryList | null>(null);
  const [message, setMessage] = useState("尚未保存到磁盘");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saveTick, setSaveTick] = useState(0);

  async function bind(value: DiskProject) {
    binding.current = value;
    await writeDiskBaseline(value);
    setBlocked(false);
  }

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const saved = await readDiskBaseline();
      if (!saved) return;
      const disk = await readProject(saved.key);
      if (cancelled) return;
      const draft = useProjectStore.getState().project;
      if (!loadDraft()) { await bind(disk); useProjectStore.getState().replaceProject(disk.project); setMessage("已恢复上次磁盘项目"); return; }
      if (draft.projectId !== saved.project.projectId) return;
      binding.current = saved;
      const merged = mergeProjects(saved.project, draft, disk.project);
      if (merged.conflicts.length) throw new Error(`恢复冲突，草稿已保留：${merged.conflicts.join("、")}`);
      await bind(disk);
      useProjectStore.getState().replaceProject(merged.project);
      setMessage("已恢复磁盘项目与未保存草稿");
    };
    void restore().catch((error) => { if (!cancelled) { setBlocked(true); setMessage(String(error)); setOpen(true); } }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    if (busy.current) return;
    busy.current = true;
    const current = useProjectStore.getState().project;
    const base = binding.current?.project.projectId === current.projectId ? binding.current : null;
    try {
      setMessage("正在写入磁盘…");
      await bind(await writeProject(current, base?.revision ?? null));
      setMessage("磁盘已保存 · 模块分文件");
    } catch (error) { setBlocked(true); setOpen(true); setMessage(error instanceof Error ? error.message : "磁盘保存失败"); }
    finally { busy.current = false; setSaveTick((value) => value + 1); }
  }

  useEffect(() => {
    if (!ready || blocked || binding.current?.project.projectId !== project.projectId || stableJson(binding.current.project) === stableJson(project)) return;
    const timer = setTimeout(() => void save(), 900);
    return () => clearTimeout(timer);
  }, [project, ready, blocked, saveTick]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (binding.current?.project.projectId === project.projectId && stableJson(binding.current.project) !== stableJson(project)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", beforeUnload); };
  });

  async function showLibrary() {
    setOpen(true);
    try { setLibrary(await listProjects()); } catch (error) { setMessage(String(error)); }
  }

  async function openDisk(key: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      const current = useProjectStore.getState().project;
      if (binding.current?.project.projectId === current.projectId && stableJson(binding.current.project) !== stableJson(current)) await bind(await writeProject(current, binding.current.revision));
      const disk = await readProject(key);
      if (useProjectStore.getState().project !== current) throw new Error("加载期间当前项目发生修改，请再次选择要打开的文件");
      archiveDraft(current);
      await bind(disk); useProjectStore.getState().replaceProject(disk.project); setMessage("已打开磁盘项目"); setOpen(false);
    } catch (error) { setMessage(String(error)); }
    finally { busy.current = false; }
  }

  async function mergeDisk() {
    const base = binding.current;
    if (!base) return;
    try {
      const disk = await readProject(base.key);
      const result = mergeProjects(base.project, useProjectStore.getState().project, disk.project);
      if (result.conflicts.length) { setMessage(`同字段冲突，未覆盖任何版本。请先导出草稿并在 Git 中解决：${result.conflicts.join("、")}`); return; }
      await bind(disk); useProjectStore.getState().acceptProject(result.project); setMessage("已合并不同字段的修改，可撤销；即将保存");
    } catch (error) { setMessage(String(error)); }
  }

  async function saveAs() {
    if (busy.current) return;
    busy.current = true;
    const current = useProjectStore.getState().project;
    try {
      if (binding.current?.project.projectId === current.projectId && stableJson(binding.current.project) !== stableJson(current)) await bind(await writeProject(current, binding.current.revision));
      const copy = { ...structuredClone(current), projectId: createId("project"), name: `${current.name} 副本`, updatedAt: new Date().toISOString() };
      const disk = await writeProject(copy, null);
      if (useProjectStore.getState().project !== current) throw new Error("副本已保存，但当前编辑发生变化，暂未切换；可在列表打开副本");
      archiveDraft(current);
      await bind(disk); useProjectStore.getState().replaceProject(disk.project); setMessage("已另存为独立项目，模块与积木内容保留");
      setLibrary(await listProjects());
    } catch (error) { setMessage(String(error)); }
    finally { busy.current = false; }
  }

  return <>
    <IconButton label="本地项目库" onClick={() => void showLibrary()}><FolderOpen size={17} /></IconButton>
    <IconButton label="保存到磁盘 Ctrl+S" onClick={() => { setOpen(true); void save(); }}><Save size={17} /></IconButton>
    <span className="disk-save-state" title={message}>{blocked ? "磁盘待处理" : binding.current?.project.projectId === project.projectId ? "磁盘自动保存" : "仅浏览器草稿"}</span>
    {open ? <section className="utility-panel" role="dialog" aria-label="本地项目库">
      <header><strong>本地项目库</strong><button onClick={() => setOpen(false)}>关闭</button></header>
      <p className={blocked ? "status-warning" : ""}>{message}</p>
      <p className="field-help">{library?.root ?? "默认保存到仓库 data/projects-v2；首次保存后自动写入磁盘。"}</p>
      <button onClick={() => void save()}>保存当前项目</button>
      <button onClick={() => void saveAs()}>另存为独立项目</button>
      {binding.current ? <button onClick={() => void mergeDisk()}>读取磁盘并合并</button> : null}
      <button onClick={() => downloadProject(project)}>导出当前草稿备份</button>
      <button onClick={() => void showLibrary()}>刷新文件列表</button>
      {library?.items.map((item) => <button className="library-item" key={item.key} onClick={() => void openDisk(item.key)}>{item.name}<small>{item.updatedAt}</small></button>)}
      <p className="field-help">清单原子保存，模块按内容分别存储。外部修改会停止自动保存。同字段冲突保留双方版本，使用 Git 处理。</p>
    </section> : null}
  </>;
}
