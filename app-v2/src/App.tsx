import { lazy, Suspense, useEffect, useState } from "react";
import { Box, ChevronLeft, Cuboid, Redo2, RefreshCw, Save, Undo2 } from "lucide-react";
import { IconButton } from "./components/IconButton";
import { ProjectFileActions } from "./features/files/ProjectFileActions";
import { AssemblySidebar } from "./features/assembly/AssemblySidebar";
import { ConnectionInspector } from "./features/assembly/ConnectionInspector";
import { InstanceInspector } from "./features/assembly/InstanceInspector";
import { ModulePalette } from "./features/module-editor/ModulePalette";
import { BlockInspector } from "./features/module-editor/BlockInspector";
import { UEDryRunPanel } from "./features/ue/UEDryRunPanel";
import { IssueIndicator } from "./features/validation/IssueIndicator";
import { useProjectStore } from "./store/project-store";

const PreviewPanel = lazy(() => import("./features/preview/PreviewPanel"));
const AssemblyCanvas = lazy(() => import("./features/assembly/AssemblyCanvas").then((module) => ({ default: module.AssemblyCanvas })));
const ModuleEditor = lazy(() => import("./features/module-editor/ModuleEditor").then((module) => ({ default: module.ModuleEditor })));

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function App() {
  const project = useProjectStore((state) => state.project);
  const view = useProjectStore((state) => state.view);
  const activeInstanceId = useProjectStore((state) => state.activeInstanceId);
  const selectedConnectionId = useProjectStore((state) => state.selectedConnectionId);
  const previewOpen = useProjectStore((state) => state.previewOpen);
  const previewDirty = useProjectStore((state) => state.previewDirty);
  const saveStatus = useProjectStore((state) => state.saveStatus);
  const pastCount = useProjectStore((state) => state.past.length);
  const futureCount = useProjectStore((state) => state.future.length);
  const rename = useProjectStore((state) => state.renameProject);
  const setView = useProjectStore((state) => state.setView);
  const setTransformMode = useProjectStore((state) => state.setTransformMode);
  const togglePreview = useProjectStore((state) => state.togglePreview);
  const refreshPreview = useProjectStore((state) => state.refreshPreview);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const deleteInstance = useProjectStore((state) => state.deleteSelectedInstance);
  const deleteConnection = useProjectStore((state) => state.deleteSelectedConnection);
  const duplicateInstance = useProjectStore((state) => state.duplicateSelectedInstance);
  const copyInstance = useProjectStore((state) => state.copySelectedInstance);
  const pasteInstance = useProjectStore((state) => state.pasteInstance);
  const deleteBlocks = useProjectStore((state) => state.deleteSelectedBlocks);
  const duplicateBlocks = useProjectStore((state) => state.duplicateSelectedBlocks);
  const copyBlocks = useProjectStore((state) => state.copySelectedBlocks);
  const pasteBlocks = useProjectStore((state) => state.pasteBlocks);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [uePlanOpen, setUePlanOpen] = useState(false);

  useEffect(() => setNameDraft(project.name), [project.name]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        view === "assembly" ? copyInstance() : copyBlocks();
        return;
      }
      if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        view === "assembly" ? pasteInstance() : pasteBlocks();
        return;
      }
      if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        view === "assembly" ? duplicateInstance() : duplicateBlocks();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        view === "assembly" ? (selectedConnectionId ? deleteConnection() : deleteInstance()) : deleteBlocks();
        return;
      }
      if (!modifier && ["w", "e", "r"].includes(event.key.toLowerCase())) {
        setTransformMode(event.key.toLowerCase() === "w" ? "move" : event.key.toLowerCase() === "e" ? "rotate" : "scale");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [copyBlocks, copyInstance, deleteBlocks, deleteConnection, deleteInstance, duplicateBlocks, duplicateInstance, pasteBlocks, pasteInstance, redo, selectedConnectionId, setTransformMode, undo, view]);

  const activeInstance = project.instances.find((item) => item.id === activeInstanceId);
  const activeModule = project.modules.find((item) => item.id === activeInstance?.definitionId);

  return (
    <main className={`app-shell view-${view} ${previewOpen ? "preview-open" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup"><Cuboid size={19} /><strong>BlockOutTools</strong><span>V2</span></div>
        {view === "module" ? (
          <button type="button" className="back-button" onClick={() => setView("assembly")}><ChevronLeft size={16} />返回组装</button>
        ) : null}
        <div className="project-title">
          <span>{view === "assembly" ? "组装" : activeModule?.name ?? "模块内部"}</span>
          <input
            value={nameDraft}
            aria-label="项目名称"
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={() => rename(nameDraft)}
            onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          />
        </div>
        <div className={`save-state is-${saveStatus}`}><Save size={14} /><span>{saveStatus === "saved" ? "本地草稿已保存" : saveStatus === "saving" ? "正在保存" : "保存失败"}</span></div>
        <div className="topbar-actions">
          <ProjectFileActions />
          <div className="toolbar-group">
            <IconButton label="撤销" disabled={!pastCount} onClick={undo}><Undo2 size={17} /></IconButton>
            <IconButton label="重做" disabled={!futureCount} onClick={redo}><Redo2 size={17} /></IconButton>
          </div>
          <IssueIndicator />
          <button type="button" className={`text-command ${previewOpen ? "is-active" : ""}`} onClick={togglePreview}><Box size={16} />3D 预览{previewDirty ? <i /> : null}</button>
          <IconButton label="刷新 3D 预览" onClick={refreshPreview}><RefreshCw size={17} /></IconButton>
          <button type="button" className={`text-command ${uePlanOpen ? "is-active" : ""}`} onClick={() => setUePlanOpen((open) => !open)}><Cuboid size={16} />UE 计划</button>
        </div>
      </header>

      <aside className="left-sidebar">{view === "assembly" ? <AssemblySidebar /> : <ModulePalette />}</aside>
      <section className="workspace">
        <Suspense fallback={<div className="workspace-loading">正在载入编辑工作面…</div>}>
          {view === "assembly" ? <AssemblyCanvas /> : <ModuleEditor />}
        </Suspense>
      </section>
      <aside className="inspector">{view === "assembly" ? (selectedConnectionId ? <ConnectionInspector /> : <InstanceInspector />) : <BlockInspector />}</aside>

      {previewOpen ? (
        <Suspense fallback={<aside className="preview-panel loading-panel">正在载入 3D 预览…</aside>}>
          <PreviewPanel />
        </Suspense>
      ) : null}
      {uePlanOpen ? <UEDryRunPanel onClose={() => setUePlanOpen(false)} /> : null}

      <footer className="statusbar">
        <span>{view === "assembly" ? `${project.instances.length} 个实例 · ${project.connections.length} 条连接` : `${activeModule?.blocks.length ?? 0} 个积木 · ${activeModule?.blocks.filter((block) => block.type === "port").length ?? 0} 个出入口`}</span>
        <span>厘米 · 画布轴</span>
        <span className={previewDirty ? "status-warning" : ""}>{previewDirty ? "3D 需要刷新" : "3D 已同步"}</span>
      </footer>
    </main>
  );
}
