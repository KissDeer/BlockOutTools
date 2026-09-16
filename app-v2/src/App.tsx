import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Box, ChevronLeft, Cuboid, Redo2, RefreshCw, Undo2 } from "lucide-react";
import { IconButton } from "./components/IconButton";
import { ProjectFileActions } from "./features/files/ProjectFileActions";
import { AssemblySidebar } from "./features/assembly/AssemblySidebar";
import { ConnectionInspector } from "./features/assembly/ConnectionInspector";
import { InstanceInspector } from "./features/assembly/InstanceInspector";
import { ModulePalette } from "./features/module-editor/ModulePalette";
import { ModuleDraftPanel } from "./features/module-editor/ModuleDraftPanel";
import { BlockInspector } from "./features/module-editor/BlockInspector";
import { ProjectContextBar } from "./features/context/ProjectContextBar";
import { ModuleContextPanel } from "./features/context/ModuleContextPanel";
import { UEDryRunPanel } from "./features/ue/UEDryRunPanel";
import { IssueIndicator } from "./features/validation/IssueIndicator";
import { ConceptCanvas } from "./features/concept/ConceptCanvas";
import { UnifiedTopologyInspector } from "./features/concept/UnifiedTopologyInspector";
import { ConceptCandidateInspector } from "./features/concept/ConceptCandidateInspector";
import { ConceptInputInspector } from "./features/concept/ConceptInputInspector";
import { ConceptInputsBoard } from "./features/concept/ConceptInputsBoard";
import { ConceptRecognitionBoard } from "./features/concept/ConceptRecognitionBoard";
import { ConceptSidebar } from "./features/concept/ConceptSidebar";
import { summarizeIssues, validateTopology } from "./domain/concept-validation";
import { useCurrentTopology } from "./features/concept/use-current-topology";
import { useProjectStore } from "./store/project-store";
import "./styles/workflow.css";

const PreviewPanel = lazy(() => import("./features/preview/PreviewPanel"));
const AssemblyCanvas = lazy(() => import("./features/assembly/AssemblyCanvas").then((module) => ({ default: module.AssemblyCanvas })));
const ModuleEditor = lazy(() => import("./features/module-editor/ModuleEditor").then((module) => ({ default: module.ModuleEditor })));

class CanvasBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  render() {
    if (!this.state.message) return this.props.children;
    return <div className="workspace-loading" role="alert"><p>画布未能载入，项目数据仍保留。</p><small>{this.state.message}</small><button type="button" className="secondary-command" onClick={() => this.setState({ message: null })}>重试画布</button></div>;
  }
}

export function App() {
  const project = useProjectStore((state) => state.project);
  const stage = useProjectStore((state) => state.stage);
  const view = useProjectStore((state) => state.view);
  const conceptPane = useProjectStore((state) => state.conceptPane);
  const activeModuleId = useProjectStore((state) => state.activeModuleId);
  const activeInstanceId = useProjectStore((state) => state.activeInstanceId);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const selectedConnectionId = useProjectStore((state) => state.selectedConnectionId);
  const moduleReturn = useProjectStore((state) => state.moduleReturn);
  const moduleDraft = useProjectStore((state) => state.moduleDraft);
  const previewOpen = useProjectStore((state) => state.previewOpen);
  const previewDirty = useProjectStore((state) => state.previewDirty);
  const pastCount = useProjectStore((state) => state.past.length);
  const futureCount = useProjectStore((state) => state.future.length);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [uePlanOpen, setUePlanOpen] = useState(false);
  const [placementNotice, setPlacementNotice] = useState("");
  const currentTopology = useCurrentTopology();
  const topologyIssues = summarizeIssues(validateTopology(currentTopology));
  const conceptStage = stage === "concept";
  const moduleView = !conceptStage && view === "module";
  const activeInstance = project.instances.find((item) => item.id === activeInstanceId);
  const activeModule = project.modules.find((item) => item.id === (activeModuleId ?? activeInstance?.definitionId));
  const selectedModuleId = project.instances.find((item) => item.id === selectedInstanceId)?.definitionId;
  const auxiliary = conceptStage && (conceptPane === "inputs" || conceptPane === "recognition");
  const store = useProjectStore.getState;

  useEffect(() => setNameDraft(project.name), [project.name]);
  useEffect(() => { setPlacementNotice(""); setUePlanOpen(false); }, [project.projectId, activeModuleId]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable) || document.querySelector('[role="dialog"]')) return;
      const state = store();
      if (state.previewOpen || uePlanOpen || state.moduleDraft) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return; }
      if (state.stage === "concept") {
        if (state.conceptPane === "topology" && (key === "delete" || key === "backspace")) {
          event.preventDefault();
          if (state.selectedLogicLinkId) state.removeLogicLink(state.selectedLogicLinkId);
          else if (state.selectedLogicNodeId) state.removeLogicNode(state.selectedLogicNodeId);
        }
        return;
      }
      const assembly = state.view === "assembly";
      if (modifier && key === "c") { event.preventDefault(); assembly ? state.copySelectedInstance() : state.copySelectedBlocks(); }
      if (modifier && key === "v") { event.preventDefault(); assembly ? state.pasteInstance() : state.pasteBlocks(); }
      if (modifier && key === "d") { event.preventDefault(); assembly ? state.duplicateSelectedInstance() : state.duplicateSelectedBlocks(); }
      if (key === "delete" || key === "backspace") { event.preventDefault(); assembly ? (state.selectedConnectionId ? state.deleteSelectedConnection() : state.deleteSelectedInstance()) : state.deleteSelectedBlocks(); }
      if (!modifier && ["w", "e", "r"].includes(key)) state.setTransformMode(key === "w" ? "move" : key === "e" ? "rotate" : "scale");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [uePlanOpen, store]);

  function placeActiveModule() {
    if (!activeModule) return;
    const id = store().placeModule(activeModule.id);
    if (id) { setPlacementNotice(""); store().showAssembly(); }
    else setPlacementNotice("此模块在多个子层路径中复用，请在整体列表选择具体路径放置。");
  }

  return (
    <main className={`app-shell workflow-shell view-${view} ${previewOpen ? "preview-open" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup"><Cuboid size={19} /><strong>BlockOutTools</strong><span>V2</span></div>
        <div className="stage-switch" role="group" aria-label="工作区">
          <button type="button" className={conceptStage ? "is-active" : ""} onClick={() => store().setStage("concept")}>逻辑拓扑</button>
          <button type="button" className={conceptStage ? "" : "is-active"} onClick={() => store().setStage("build")}>拼接搭建</button>
        </div>
        <div className="project-title"><input value={nameDraft} aria-label="项目名称" onChange={(event) => setNameDraft(event.target.value)} onBlur={() => store().renameProject(nameDraft)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></div>
        <div className="topbar-actions">
          <ProjectFileActions />
          <div className="toolbar-group">
            <IconButton label="撤销" disabled={!pastCount || !!moduleDraft} onClick={() => store().undo()}><Undo2 size={17} /></IconButton>
            <IconButton label="重做" disabled={!futureCount || !!moduleDraft} onClick={() => store().redo()}><Redo2 size={17} /></IconButton>
          </div>
          <IssueIndicator />
          <button type="button" className={`text-command ${previewOpen ? "is-active" : ""}`} onClick={() => store().togglePreview()}><Box size={16} />3D 预览{previewDirty ? <i /> : null}</button>
          <IconButton label="刷新 3D 预览" onClick={() => store().refreshPreview()}><RefreshCw size={17} /></IconButton>
          {!conceptStage && <button type="button" className="text-command" onClick={() => setUePlanOpen((open) => !open)}>UE 计划</button>}
        </div>
      </header>
      <div className="workflow-project-context"><ProjectContextBar /></div>
      <aside className={`left-sidebar ${moduleView ? "module-reference-sidebar" : ""}`}>
        {conceptStage ? <ConceptSidebar /> : view === "assembly" ? <AssemblySidebar /> : activeModule ? <>
          <ModuleContextPanel key={`${project.projectId}:${activeModule.id}`} moduleId={activeModule.id} />
          <fieldset className="module-palette-fieldset" disabled={!!moduleDraft}><ModulePalette /></fieldset>
        </> : null}
      </aside>
      <section className="workspace workflow-workspace">
        <div className="workflow-navigation">
          {moduleView ? <>
            <button type="button" className="back-button" onClick={() => store().returnFromModule()}><ChevronLeft size={15} />{moduleReturn?.stage === "concept" ? "返回逻辑拓扑" : "返回整体"}</button>
            <strong>{activeModule?.name ?? "模块内部"}</strong>
            <span>局部空间 · cm</span>
            <button type="button" className="text-command" onClick={() => store().showAssembly()}>查看整体</button>
            <button type="button" className="text-command" onClick={placeActiveModule}>放入整体</button>
          </> : conceptStage ? <>
            <strong>{auxiliary ? conceptPane === "inputs" ? "历史资料管理" : "图片识别辅助" : "区域、连接与模块组织"}</strong>
            {auxiliary && <button type="button" className="back-button" onClick={() => store().setConceptPane("topology")}>返回逻辑拓扑</button>}
            <details className="workflow-tools"><summary>辅助工具</summary><div>
              <button type="button" onClick={() => store().setConceptPane("inputs")}>历史资料管理</button>
              <button type="button" onClick={() => store().setConceptPane("recognition")}>从图片识别拓扑</button>
            </div></details>
          </> : <><strong>整体拼接</strong><span>拖动关系图仅排版；实际位置在右侧修改</span></>}
        </div>
        {placementNotice && <p className="workflow-notice" role="status">{placementNotice}</p>}
        {moduleView && activeModule && <ModuleDraftPanel key={`${project.projectId}:${activeModule.id}`} moduleId={activeModule.id} />}
        <div className="workflow-canvas">
          <CanvasBoundary key={`${project.projectId}:${stage}:${view}:${activeModuleId}:${conceptPane}`}>
            <Suspense fallback={<div className="workspace-loading">正在载入编辑工作面…</div>}>
              {conceptStage ? conceptPane === "inputs" ? <ConceptInputsBoard /> : conceptPane === "recognition" ? <ConceptRecognitionBoard /> : <ConceptCanvas /> : view === "assembly" ? <AssemblyCanvas /> : <ModuleEditor />}
            </Suspense>
          </CanvasBoundary>
        </div>
      </section>
      <aside className="inspector">
        {conceptStage ? conceptPane === "inputs" ? <ConceptInputInspector /> : conceptPane === "recognition" ? <ConceptCandidateInspector /> : <UnifiedTopologyInspector /> : view === "assembly" ? <>
          {selectedConnectionId ? <ConnectionInspector /> : <InstanceInspector />}
          {selectedModuleId && <details className="assembly-reference"><summary>所选模块资料与接口要求</summary><ModuleContextPanel key={`${project.projectId}:${selectedModuleId}`} moduleId={selectedModuleId} /></details>}
        </> : <fieldset className="block-inspector-fieldset" disabled={!!moduleDraft}>{moduleDraft && <p className="workflow-notice">正在预览草案；采用或取消后继续编辑。</p>}<BlockInspector /></fieldset>}
      </aside>
      {previewOpen && <Suspense fallback={<aside className="preview-panel loading-panel">正在载入 3D 预览…</aside>}><PreviewPanel /></Suspense>}
      {uePlanOpen && <UEDryRunPanel onClose={() => setUePlanOpen(false)} />}
      <footer className="statusbar">
        <span>{conceptStage ? `${currentTopology.nodes.length} 区域 · ${currentTopology.modules.length} 模块 · ${currentTopology.links.length} 链路` : view === "assembly" ? `${project.instances.length} 已放置实例 · ${project.connections.length} 几何连接` : `${activeModule?.blocks.length ?? 0} 积木 · 影响 ${project.instances.filter((instance) => instance.definitionId === activeModule?.id).length} 个共享实例`}</span>
        <span>{conceptStage ? "逻辑排版与空间坐标独立" : moduleView ? "模块内部使用局部厘米坐标" : "逻辑连接不代表空间已对接"}</span>
        <span className="status-warning">{conceptStage ? topologyIssues.error ? `${topologyIssues.error} 个逻辑错误` : topologyIssues.warning ? `${topologyIssues.warning} 项待核对` : "逻辑校验通过" : moduleDraft ? "草案预览 · 尚未写入" : previewDirty ? "3D 需要刷新" : "3D 已同步"}</span>
      </footer>
    </main>
  );
}
