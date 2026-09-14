import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Download, FileUp, FolderOpen, RefreshCw, Save } from "lucide-react";
import { archiveDraft, downloadProject, loadDraft } from "../../domain/persistence";
import { mergeProjects } from "../../domain/project-merge";
import { stableJson } from "../../domain/stable-json";
import { createId } from "../../domain/ids";
import { useProjectStore } from "../../store/project-store";
import { listProjects, readProject, writeProject, type DiskProject, type LibraryList } from "./local-library";
import { readDiskBaseline, writeDiskBaseline } from "./disk-baseline";

export function DiskLibraryActions({ onImport }: { onImport: () => void }) {
  const project = useProjectStore((state) => state.project);
  const draftStatus = useProjectStore((state) => state.saveStatus);
  const binding = useRef<DiskProject | null>(null);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryList | null>(null);
  const [message, setMessage] = useState("尚未保存到磁盘");
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saveTick, setSaveTick] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onPointer); };
  }, [open]);

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

  const diskBound = binding.current?.project.projectId === project.projectId;
  const diskPending = diskBound && stableJson(binding.current?.project) !== stableJson(project);
  const saving = message === "正在写入磁盘…" || draftStatus === "saving";
  const saveState = blocked || draftStatus === "error" ? "error" : saving || diskPending ? "saving" : "saved";
  const saveLabel = blocked ? "磁盘保存待处理" : draftStatus === "error" ? "草稿保存失败"
    : saving ? "正在保存…" : diskPending ? "等待自动保存" : diskBound ? "已保存到磁盘" : "仅存浏览器草稿";

  return <>
    <span className={`save-state project-save-state is-${saveState}`} role="status" title={`${saveLabel}。${message}`}><Save size={14} /><span>{saveLabel}</span></span>
    <button ref={triggerRef} type="button" className={`text-command file-menu-trigger ${open ? "is-active" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="project-files-panel" onClick={() => open ? setOpen(false) : void showLibrary()}><FolderOpen size={16} />文件<ChevronDown size={13} /></button>
    {open ? <section ref={panelRef} id="project-files-panel" className="utility-panel project-files-panel" role="dialog" aria-label="项目文件">
      <header><strong>项目文件</strong><button type="button" onClick={() => setOpen(false)}>关闭</button></header>
      <p className={blocked ? "status-warning" : ""} role="status">{message}</p>
      <div className="project-file-commands">
        <button type="button" onClick={() => void save()}><Save size={16} /><span>保存到磁盘<small>首次保存后自动保存</small></span><kbd>Ctrl+S</kbd></button>
        <button type="button" onClick={() => void saveAs()}><Copy size={16} /><span>另存为独立项目<small>保留原项目，创建副本</small></span></button>
        <button type="button" onClick={() => { setOpen(false); onImport(); }}><FileUp size={16} /><span>导入 V2 JSON<small>打开电脑上的项目文件</small></span></button>
        <button type="button" onClick={() => downloadProject(project)}><Download size={16} /><span>导出项目备份<small>下载当前项目的 V2 JSON</small></span></button>
        {diskBound ? <button type="button" onClick={() => void mergeDisk()}><RefreshCw size={16} /><span>读取磁盘并合并<small>合并外部修改；冲突时保留草稿</small></span></button> : null}
      </div>
      <div className="project-library-heading"><strong>打开已保存项目</strong><button type="button" onClick={() => void showLibrary()}><RefreshCw size={14} />刷新列表</button></div>
      {library?.items.length === 0 ? <p className="field-help">暂无磁盘项目，先保存当前项目。</p> : null}
      {library?.items.map((item) => <button type="button" className="library-item" key={item.key} onClick={() => void openDisk(item.key)}>{item.name}<small>{item.updatedAt}</small></button>)}
      <p className="field-help">{library?.root ?? "项目保存在仓库 data/projects-v2。"}</p>
      <p className="field-help">浏览器草稿用于恢复编辑；保存到磁盘后才会出现在项目列表中。外部修改有冲突时，先导出备份再处理。</p>
    </section> : null}
  </>;
}
