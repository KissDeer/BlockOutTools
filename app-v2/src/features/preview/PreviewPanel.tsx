import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RefreshCw, X } from "lucide-react";
import { buildDeploymentGeometry } from "../../domain/deployment-geometry";
import { resolveAssembly } from "../../domain/assembly-resolver";
import { IconButton } from "../../components/IconButton";
import { useProjectStore } from "../../store/project-store";

function threeColor(color: [number, number, number, number]): THREE.Color {
  return new THREE.Color(color[0], color[1], color[2]);
}

export default function PreviewPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const project = useProjectStore((state) => state.project);
  const revision = useProjectStore((state) => state.previewRevision);
  const dirty = useProjectStore((state) => state.previewDirty);
  const toggle = useProjectStore((state) => state.togglePreview);
  const refresh = useProjectStore((state) => state.refreshPreview);
  const [primitiveCount, setPrimitiveCount] = useState(0);
  const [assemblyIssueCount, setAssemblyIssueCount] = useState(0);

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
    const resolution = resolveAssembly(project);
    const primitives = buildDeploymentGeometry(project, resolution.instances);
    setPrimitiveCount(primitives.length);
    setAssemblyIssueCount(resolution.issues.length);
    for (const primitive of primitives) {
      const geometry = new THREE.BoxGeometry(primitive.size[0], primitive.size[2], primitive.size[1]);
      const material = new THREE.MeshStandardMaterial({ color: threeColor(primitive.color), roughness: 0.82, metalness: 0.02 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = primitive.label;
      mesh.position.set(primitive.position[0], primitive.position[2], -primitive.position[1]);
      mesh.rotation.y = (-primitive.rotation * Math.PI) / 180;
      content.add(mesh);
      if (primitive.size[2] > 60 && !primitive.id.includes(":step-")) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0x18201c, transparent: true, opacity: 0.42 }));
        edges.position.copy(mesh.position);
        edges.rotation.copy(mesh.rotation);
        content.add(edges);
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
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [revision]);

  return (
    <aside className="preview-panel" aria-label="三维预览">
      <header className="panel-header preview-header">
        <div><strong>3D 预览</strong><span>{revision === 0 ? "尚未生成" : `${primitiveCount} 个预览几何 · ${assemblyIssueCount === 0 ? "端口拼装完成" : `${assemblyIssueCount} 条连接未闭合`}`}</span></div>
        <div className="toolbar-group">
          <button type="button" className={`refresh-preview ${dirty ? "is-dirty" : ""}`} onClick={refresh}><RefreshCw size={15} />{dirty || revision === 0 ? "刷新" : "重新生成"}</button>
          <IconButton label="收起 3D 预览" onClick={toggle}><X size={17} /></IconButton>
        </div>
      </header>
      <div ref={hostRef} className="preview-host">
        {revision === 0 ? <div className="preview-empty"><BoxGlyph /><strong>3D 尚未生成</strong><span>点击刷新，根据当前模块实例重建预览。</span></div> : null}
      </div>
      <footer className="preview-footer"><span>左键旋转 · 右键平移 · 滚轮缩放</span>{dirty ? <em>当前项目有未刷新的修改</em> : assemblyIssueCount > 0 ? <em>{assemblyIssueCount} 条端口约束未闭合</em> : <strong>按端口拼装 · 与项目同步</strong>}</footer>
    </aside>
  );
}

function BoxGlyph() {
  return <div className="box-glyph" aria-hidden="true"><i /><i /><i /></div>;
}
