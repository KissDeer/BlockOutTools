import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Box, Cuboid, Redo2, RefreshCw, Undo2 } from "lucide-react";
import { IconButton } from "./components/IconButton";
import { ProjectFileActions } from "./features/files/ProjectFileActions";
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
import { LevelBreadcrumb } from "./features/concept/LevelBreadcrumb";
import { LevelTree } from "./features/concept/LevelTree";
import { SplitPane } from "./components/SplitPane";
import { resolveLevel } from "./domain/concept-scopes";
import { createEmptyTopology } from "./domain/concept";
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
  const levelPath = useProjectStore((state) => state.levelPath);
  const conceptPane = useProjectStore((state) => state.conceptPane);
  const activeModuleId = useProjectStore((state) => state.activeModuleId);
  const detachedModuleId = useProjectStore((state) => state.detachedModuleId);
  const activeInstanceId = useProjectStore((state) => state.activeInstanceId);
  const currentGeometry = useProjectStore((state) => state.currentGeometry);
  const splitRatio = useProjectStore((state) => state.splitRatio);
  const setSplitRatio = useProjectStore((state) => state.setSplitRatio);
  /** 入口栏的两个小圆点：这一格有没有东西可看 */
  const inputCount = useProjectStore((state) => state.project.concept?.inputs.items.length ?? 0);
  const candidate = useProjectStore((state) => state.candidate);
  const selectedInstanceId = useProjectStore((state) => state.selectedInstanceId);
  const selectedConnectionId = useProjectStore((state) => state.selectedConnectionId);
  const moduleDraft = useProjectStore((state) => state.moduleDraft);
  const previewOpen = useProjectStore((state) => state.previewOpen);
  const previewDirty = useProjectStore((state) => state.previewDirty);
  const pastCount = useProjectStore((state) => state.past.length);
  const futureCount = useProjectStore((state) => state.future.length);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [uePlanOpen, setUePlanOpen] = useState(false);
  const [placementNotice, setPlacementNotice] = useState("");
  const [assemblyOpen, setAssemblyOpen] = useState(false);
  const currentTopology = useCurrentTopology();
  const topologyIssues = summarizeIssues(validateTopology(currentTopology));
  const store = useProjectStore.getState;

  /**
   * 当前层级。整张画布只有这一处决定"现在画什么"：
   * 逻辑层画这一层的逻辑拓扑，几何层画某个节点内部的体块。
   */
  const level = useMemo(
    () => resolveLevel(project.concept ?? createEmptyTopology(), levelPath),
    [project.concept, levelPath],
  );
  // 几何层有两种来路：进到了某个节点的内部，或者是没有逻辑节点的旧模块
  const detachedLevel = detachedModuleId !== null;
  const geometryOnly = level.kind === "geometry" || detachedLevel;
  /**
   * 分屏：现在站在一个有子逻辑的节点里。
   *
   * 节点同时装几何和子逻辑（2026-09-17 二次修订），所以这一层有**两面**：
   * 左边是它内部的子区域与链路，右边是它自己的体块。两边同一个坐标系。
   * 叶子节点（没有子层）不需要分屏，进去就是全宽拼接图。
   */
  const splitOpen = !detachedLevel && currentGeometry !== null;
  const auxiliary = !geometryOnly && !splitOpen && (conceptPane === "inputs" || conceptPane === "recognition");
  const activeInstance = project.instances.find((item) => item.id === activeInstanceId);
  const activeModule = project.modules.find((item) => item.id === (activeModuleId ?? activeInstance?.definitionId));
  const selectedModuleId = project.instances.find((item) => item.id === selectedInstanceId)?.definitionId;

  useEffect(() => setNameDraft(project.name), [project.name]);
  useEffect(() => { setPlacementNotice(""); setUePlanOpen(false); }, [project.projectId, levelPath.join("/")]);
  useEffect(() => { if (!geometryOnly) setAssemblyOpen(false); }, [geometryOnly]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable) || document.querySelector('[role="dialog"]')) return;
      const state = store();
      if (state.previewOpen || uePlanOpen || state.moduleDraft) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return; }
      if (geometryOnly) {
        if (modifier && key === "c") { event.preventDefault(); state.copySelectedBlocks(); }
        if (modifier && key === "v") { event.preventDefault(); state.pasteBlocks(); }
        if (modifier && key === "d") { event.preventDefault(); state.duplicateSelectedBlocks(); }
        if (key === "delete" || key === "backspace") { event.preventDefault(); state.deleteSelectedBlocks(); }
        if (!modifier && ["w", "e", "r"].includes(key)) state.setTransformMode(key === "w" ? "move" : key === "e" ? "rotate" : "scale");
        return;
      }
      // 分屏时键盘归左边那半（逻辑图）：积木编辑要先点进右边，避免两边抢同一个 Delete
      if (state.conceptPane === "topology" && (key === "delete" || key === "backspace")) {
        event.preventDefault();
        if (state.selectedLogicLinkId) state.removeLogicLink(state.selectedLogicLinkId);
        else if (state.selectedLogicNodeId) state.removeLogicNode(state.selectedLogicNodeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [uePlanOpen, store, geometryOnly]);

  function placeActiveModule() {
    if (!activeModule) return;
    const id = store().placeModule(activeModule.id);
    if (id) { setPlacementNotice(""); store().showAssembly(); }
    else setPlacementNotice("此模块在多个子层路径中复用，请在整体列表选择具体路径放置。");
  }

  return (
    <main className={`app-shell workflow-shell level-${level.kind}${assemblyOpen ? " assembly-open" : ""} ${previewOpen ? "preview-open" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup"><Cuboid size={19} /><strong>BlockOutTools</strong><span>V2</span></div>
        <LevelBreadcrumb />
        <div className="project-title"><input value={nameDraft} aria-label="项目名称" onChange={(event) => setNameDraft(event.target.value)} onBlur={() => store().renameProject(nameDraft)} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></div>
        <div className="topbar-actions">
          <ProjectFileActions />
          <div className="toolbar-group">
            <IconButton label="撤销" disabled={!pastCount || !!moduleDraft} onClick={() => store().undo()}><Undo2 size={17} /></IconButton>
            <IconButton label="重做" disabled={!futureCount || !!moduleDraft} onClick={() => store().redo()}><Redo2 size={17} /></IconButton>
          </div>
          <IssueIndicator />
          {detachedLevel ? <button type="button" className={`text-command ${assemblyOpen ? "is-active" : ""}`} onClick={() => setAssemblyOpen((open) => !open)}>整体摆放</button> : null}
          <button type="button" className={`text-command ${previewOpen ? "is-active" : ""}`} onClick={() => store().togglePreview()}><Box size={16} />3D 预览{previewDirty ? <i /> : null}</button>
          <IconButton label="刷新 3D 预览" onClick={() => store().refreshPreview()}><RefreshCw size={17} /></IconButton>
          <button type="button" className="text-command" onClick={() => setUePlanOpen((open) => !open)}>UE 计划</button>
        </div>
      </header>
      <div className="workflow-project-context"><ProjectContextBar /></div>
      <aside className={`left-sidebar ${geometryOnly || splitOpen ? "module-reference-sidebar" : ""}`}>
        {/* 层级树常驻：无论在逻辑层还是某个节点内部，都要能看见全局、随时跳走 */}
        <LevelTree />
        {detachedLevel && activeModule ? <>
          <ModuleContextPanel key={`${project.projectId}:${activeModule.id}`} moduleId={activeModule.id} />
          <fieldset className="module-palette-fieldset" disabled={!!moduleDraft}><ModulePalette /></fieldset>
        </> : (geometryOnly || splitOpen) ? <fieldset className="module-palette-fieldset" disabled={!!moduleDraft}><ModulePalette /></fieldset> : (auxiliary ? null : <ConceptSidebar />)}
      </aside>
      <section className="workspace workflow-workspace">
        {placementNotice && <p className="workflow-notice" role="status">{placementNotice}</p>}
        {detachedLevel && activeModule && <ModuleDraftPanel key={`${project.projectId}:${activeModule.id}`} moduleId={activeModule.id} />}
        {/*
          主流程的入口。上传拓扑图与识别候选两块的零件一直都在，但在此之前**没有任何按钮能走到**
          （`setConceptPane` 全仓库没有调用者）—— 这正是"面板存在 ≠ 已实现"那条的实例。
        */}
        {!geometryOnly && (
          <nav className="workflow-navigation" aria-label="逻辑拓扑工作面">
            <div className="stage-switch" role="tablist" aria-label="工作面">
              <button type="button" role="tab" aria-selected={conceptPane === "topology"} className={conceptPane === "topology" ? "is-active" : ""} onClick={() => store().setConceptPane("topology")}>逻辑拓扑</button>
              <button type="button" role="tab" aria-selected={conceptPane === "inputs"} className={conceptPane === "inputs" ? "is-active" : ""} onClick={() => store().setConceptPane("inputs")}>输入上下文{inputCount ? <i className="stage-dot" /> : null}</button>
              <button type="button" role="tab" aria-selected={conceptPane === "recognition"} className={conceptPane === "recognition" ? "is-active" : ""} onClick={() => store().setConceptPane("recognition")}>识别候选{candidate ? <i className="stage-dot" /> : null}</button>
            </div>
            <span>{conceptPane === "topology"
              ? "上传拓扑图是入口；之后的唯一事实来源是这里的节点列表。"
              : conceptPane === "inputs"
                ? "图片与文字材料只作一次性入口，采用之后不再维护第二份状态。"
                : "先同步输入给本地服务，再拉取候选逐个核对。"}</span>
          </nav>
        )}
        <div className="workflow-canvas">
          <CanvasBoundary key={`${project.projectId}:${level.kind}:${level.scopeId ?? "root"}:${level.nodeId ?? ""}:${conceptPane}:${splitOpen ? currentGeometry?.id ?? "" : ""}`}>
            <Suspense fallback={<div className="workspace-loading">正在载入编辑工作面…</div>}>
              {auxiliary
                ? (conceptPane === "inputs" ? <ConceptInputsBoard /> : <ConceptRecognitionBoard />)
                : splitOpen && currentGeometry
                  ? <SplitPane
                    ratio={splitRatio}
                    onRatioChange={setSplitRatio}
                    left={<ConceptCanvas />}
                    right={<ModuleEditor geometry={currentGeometry} />}
                  />
                  : geometryOnly
                    ? (assemblyOpen ? <AssemblyCanvas /> : currentGeometry ? <ModuleEditor geometry={currentGeometry} /> : <div className="workspace-loading">这个节点还没有内部。</div>)
                    : <ConceptCanvas />}
            </Suspense>
          </CanvasBoundary>
        </div>
      </section>
      <aside className="inspector">
        {auxiliary
          ? (conceptPane === "inputs" ? <ConceptInputInspector /> : <ConceptCandidateInspector />)
          : splitOpen
            ? <fieldset className="block-inspector-fieldset"><BlockInspector /><details className="inspector-section"><summary>这一层的逻辑</summary><UnifiedTopologyInspector /></details></fieldset>
            : geometryOnly
              ? (assemblyOpen
                ? <>{selectedConnectionId ? <ConnectionInspector /> : <InstanceInspector />}
                  {selectedModuleId && <details className="assembly-reference"><summary>所选模块资料与接口要求</summary><ModuleContextPanel key={`${project.projectId}:${selectedModuleId}`} moduleId={selectedModuleId} /></details>}</>
                : <fieldset className="block-inspector-fieldset" disabled={!!moduleDraft}>{moduleDraft && <p className="workflow-notice">正在预览草案；采用或取消后继续编辑。</p>}<BlockInspector /></fieldset>)
              : <UnifiedTopologyInspector />}
      </aside>
      {previewOpen && <Suspense fallback={<aside className="preview-panel loading-panel">正在载入 3D 预览…</aside>}><PreviewPanel /></Suspense>}
      {uePlanOpen && <UEDryRunPanel onClose={() => setUePlanOpen(false)} />}
      <footer className="statusbar">
        <span>{splitOpen
          ? `${level.nodes.length} 子区域 · ${level.links.length} 链路 ｜ ${currentGeometry?.blocks.length ?? 0} 积木`
          : geometryOnly
            ? `${currentGeometry?.blocks.length ?? 0} 积木 · ${levelPath.at(-1) ? `${level.nodes.length + 1} 项中的 1 项` : ""}`
            : `${level.nodes.length} 区域 · ${level.links.length} 链路 · ${level.scopeId ? "内部" : "整图"}`}</span>
        <span>{splitOpen ? "左右两边是同一个节点的两面：左边子区域，右边它自己的几何" : geometryOnly ? "正在这个节点的内部使用局部厘米坐标" : "逻辑排版与空间坐标独立；节点内显示已拼好的内容"}</span>
        <span className="status-warning">{moduleDraft ? "草案预览 · 尚未写入" : previewDirty ? "3D 需要刷新" : topologyIssues.error ? `${topologyIssues.error} 个逻辑错误` : "3D 已同步"}</span>
      </footer>
    </main>
  );
}
