import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RefreshCw, X } from "lucide-react";
import { buildDeploymentGeometry } from "../../domain/deployment-geometry";
import { resolveAssembly } from "../../domain/assembly-resolver";
import { worldPortPose } from "../../domain/assembly-resolver";
import { validateProject } from "../../domain/validation";
import { IconButton } from "../../components/IconButton";
import { useProjectStore } from "../../store/project-store";

function threeColor(color: [number, number, number, number]): THREE.Color {
  return new THREE.Color(color[0], color[1], color[2]);
}

export default function PreviewPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((state) => state.project);
  const revision = useProjectStore((state) => state.previewRevision);
  // Display controls operate on the last explicitly refreshed project, not live edits.
  const previewProject = useProjectStore((state) => state.previewProject);
  const previewModuleId = useProjectStore((state) => state.previewModuleId);
  const draftPreview = useProjectStore((state) => Boolean(state.moduleDraft));
  const snapshot = previewProject ?? project;
  const dirty = useProjectStore((state) => state.previewDirty);
  const toggle = useProjectStore((state) => state.togglePreview);
  const refresh = useProjectStore((state) => state.refreshPreview);
  const [primitiveCount, setPrimitiveCount] = useState(0);
  const [assemblyIssueCount, setAssemblyIssueCount] = useState(0);
  const [spatialIssueCount, setSpatialIssueCount] = useState(0);
  const [isolateId, setIsolateId] = useState("");
  const [showPorts, setShowPorts] = useState(true);
  const [cutHeight, setCutHeight] = useState("");
  const effectiveIsolateId = snapshot.instances.some((item) => item.id === isolateId) ? isolateId : "";

  useEffect(() => {
    if (isolateId && !snapshot.instances.some((item) => item.id === isolateId)) setIsolateId("");
  }, [snapshot, isolateId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || revision === 0) return;
    const scene = new THREE.Scene();
    const background = new THREE.Color("#151816");
    scene.background = background;
    const camera = new THREE.PerspectiveCamera(42, 1, 1, 30000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xe8f4eb, 0x252825, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(1800, 3200, 2200);
    scene.add(keyLight);

    const content = new THREE.Group();
    scene.add(content);
    const resolution = resolveAssembly(snapshot);
    const instances = resolution.instances.filter((item) => !effectiveIsolateId || item.id === effectiveIsolateId);
    const primitives = buildDeploymentGeometry(snapshot, instances);
    setPrimitiveCount(primitives.length);
    setAssemblyIssueCount(resolution.issues.length);
    setSpatialIssueCount(validateProject(snapshot).filter((issue) => !previewModuleId || issue.moduleId === previewModuleId).length);
    renderer.localClippingEnabled = cutHeight !== "";
    const clippingPlanes = cutHeight === "" ? [] : [new THREE.Plane(new THREE.Vector3(0, -1, 0), Number(cutHeight))];
    for (const primitive of primitives) {
      const geometry = new THREE.BoxGeometry(primitive.size[0], primitive.size[2], primitive.size[1]);
      const materials = Array.from({ length: 6 }, (_, side) => new THREE.MeshStandardMaterial({ color: threeColor(side === 2 ? primitive.topColor : primitive.color), roughness: 0.82, metalness: 0.02, clippingPlanes }));
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.name = primitive.label;
      mesh.position.set(primitive.position[0], primitive.position[2], -primitive.position[1]);
      mesh.rotation.y = (primitive.rotation * Math.PI) / 180;
      content.add(mesh);
      if (primitive.size[2] > 60 && !primitive.id.includes(":step-")) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x18201c, transparent: true, opacity: 0.42, clippingPlanes }));
        edges.position.copy(mesh.position);
        edges.rotation.copy(mesh.rotation);
        content.add(edges);
      }
    }
    if (showPorts) for (const instance of instances) {
      const module = snapshot.modules.find((item) => item.id === instance.definitionId);
      for (const port of module?.blocks ?? []) {
        if (port.type !== "port") continue;
        const pose = worldPortPose(instance.assemblyTransform, port);
        const radians = pose.rotation * Math.PI / 180;
        const arrow = new THREE.ArrowHelper(new THREE.Vector3(Math.cos(radians), 0, -Math.sin(radians)), new THREE.Vector3(pose.position[0], pose.position[2] + 8, -pose.position[1]), 120, 0xeeb84f, 36, 24);
        content.add(arrow);
      }
    }

    const box = new THREE.Box3().setFromObject(content);
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const span = box.isEmpty() ? 2000 : Math.max(...box.getSize(new THREE.Vector3()).toArray());
    const cameraDistance = span * 1.65;
    const cameraOffset = new THREE.Vector3(1.05, 0.85, 1.05).normalize().multiplyScalar(cameraDistance);
    camera.position.copy(center).add(cameraOffset);
    camera.far = Math.max(30000, span * 6);
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    scene.fog = new THREE.Fog(background, cameraDistance * 0.82, cameraDistance * 2.1);

    const gridSize = Math.max(12000, Math.ceil(span * 1.6 / 1000) * 1000);
    const grid = new THREE.GridHelper(gridSize, Math.max(120, Math.round(gridSize / 100)), 0x465049, 0x282e2a);
    grid.position.y = -2;
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(center);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 80;
    controls.maxDistance = Math.max(20000, span * 5);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [revision, snapshot, effectiveIsolateId, showPorts, cutHeight, previewModuleId]);

  return (
    <aside className="preview-panel" aria-label="三维预览">
      <header className="panel-header preview-header">
        <div><strong>{previewModuleId ? "模块局部 3D" : "整体 3D 预览"}</strong><span>{revision === 0 ? "尚未生成，点击刷新" : `${primitiveCount} 个预览几何 · ${previewModuleId ? "局部厘米坐标" : `${assemblyIssueCount} 项实际对接提示`} · ${spatialIssueCount} 项规范提示`}{draftPreview ? " · 当前已采用几何，不含草案" : ""}</span></div>
        <div className="toolbar-group">
          <select aria-label="预览模块" value={effectiveIsolateId} onChange={(event) => setIsolateId(event.target.value)}><option value="">{previewModuleId ? "当前模块" : "全部已放置模块"}</option>{snapshot.instances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label><input type="checkbox" checked={showPorts} onChange={(event) => setShowPorts(event.target.checked)} />端口方向</label>
          <input aria-label="剖切高度" type="number" placeholder="剖切高度 cm" value={cutHeight} onChange={(event) => setCutHeight(event.target.value)} style={{ width: 110 }} />
          <button type="button" className={`refresh-preview ${dirty ? "is-dirty" : ""}`} onClick={refresh}><RefreshCw size={15} />{dirty || revision === 0 ? "刷新" : "重新生成"}</button>
          <IconButton label="收起 3D 预览" onClick={toggle}><X size={17} /></IconButton>
        </div>
      </header>
      <div className="preview-host">
        <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
        {revision === 0 ? <div className="preview-empty"><BoxGlyph /><strong>3D 尚未生成</strong><span>点击刷新，预览当前模块的局部形态或整体已放置模块。</span></div> : primitiveCount === 0 ? <div className="preview-empty"><BoxGlyph /><strong>{previewModuleId ? "当前模块还没有实体积木" : "整体还没有可预览的几何"}</strong><span>{previewModuleId ? "添加盒体、门洞或直梯后刷新；无需先放入整体。" : "放置模块后刷新，或进入模块查看局部 3D。"}</span></div> : null}
      </div>
      <footer className="preview-footer"><span>左键旋转 · 右键平移 · 滚轮缩放 · {previewModuleId ? "局部预览不表示外部接口已对接" : "对接检查不表示玩法路径可走"}</span>{dirty ? <em>当前项目有未刷新的修改</em> : !previewModuleId && assemblyIssueCount > 0 ? <em>{assemblyIssueCount} 条端口约束未闭合</em> : <strong>检查楼梯落脚点与通道净空</strong>}</footer>
    </aside>
  );
}

function BoxGlyph() {
  return <div className="box-glyph" aria-hidden="true"><i /><i /><i /></div>;
}
