import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import {
  connectionType,
  resolveStructureAssemblyGraph,
  resolveStructureGraphLevel,
  structureGraph,
  worldPort,
} from "./structure-module-model.js";

const DEFAULT_FLOOR_THICKNESS = 10;
const DEFAULT_WALL_HEIGHT = 300;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
  const number = Math.abs(finite(value, fallback));
  return number > 0 ? number : fallback;
}

function shapeParameters(shape) {
  return shape.ueBlockout?.parameters ?? shape.blockoutParameters ?? {};
}

function shapeHeight(shape) {
  const parameters = shapeParameters(shape);
  if (Array.isArray(parameters.BoxSize)) return positive(parameters.BoxSize[2], DEFAULT_FLOOR_THICKNESS);
  if (parameters.CylinderHeight != null) return positive(parameters.CylinderHeight, DEFAULT_FLOOR_THICKNESS);
  if (Array.isArray(parameters.StairsSize)) return positive(parameters.StairsSize[2], DEFAULT_FLOOR_THICKNESS);
  if (shape.wallHeight != null) return positive(shape.wallHeight, DEFAULT_WALL_HEIGHT);
  if (shape.extrusionHeight != null) return positive(shape.extrusionHeight, DEFAULT_FLOOR_THICKNESS);
  return shape.isWall ? DEFAULT_WALL_HEIGHT : DEFAULT_FLOOR_THICKNESS;
}

function verticalCenter(shape, baseHeight, height) {
  return shape.layoutRole === "floor"
    ? baseHeight - height / 2
    : baseHeight + height / 2;
}

function materialColor(shape, fallback = "#87928d") {
  const color = new THREE.Color(fallback);
  const parameters = shapeParameters(shape);
  const blockoutColor = parameters.blockout_material_color;
  if (Array.isArray(blockoutColor) && blockoutColor.length >= 3) {
    color.setRGB(finite(blockoutColor[0], 0.55), finite(blockoutColor[1], 0.58), finite(blockoutColor[2], 0.56));
    return color;
  }
  try {
    color.set(String(shape.color ?? shape.fill ?? fallback));
  } catch {
    color.set(fallback);
  }
  return color;
}

function addRect(group, shape, baseHeight) {
  const width = positive(shape.width, 100);
  const depth = positive(shape.height, 100);
  const height = shapeHeight(shape);
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({
    color: materialColor(shape),
    roughness: 0.86,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    finite(shape.x) + width / 2,
    verticalCenter(shape, baseHeight, height),
    finite(shape.y) + depth / 2,
  );
  mesh.rotation.y = -THREE.MathUtils.degToRad(finite(shape.rotation));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addCircle(group, shape, baseHeight) {
  const radius = positive(shape.radius, 50);
  const height = shapeHeight(shape);
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
  const material = new THREE.MeshStandardMaterial({
    color: materialColor(shape),
    roughness: 0.86,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(finite(shape.x), verticalCenter(shape, baseHeight, height), finite(shape.y));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

export function createLinearStairStepDescriptors(shape, baseHeight = 0) {
  const parameters = shapeParameters(shape);
  const stairsSize = Array.isArray(parameters.StairsSize) ? parameters.StairsSize : [];
  const width = positive(stairsSize[0], positive(shape.width, 100));
  const depth = positive(stairsSize[1], positive(shape.height, 100));
  const rise = positive(stairsSize[2], DEFAULT_FLOOR_THICKNESS);
  const stepCount = Math.max(1, Math.round(positive(parameters.NumberOfSteps, 1)));
  const stepDepth = depth / stepCount;
  const stepRise = rise / stepCount;
  const footprintWidth = positive(shape.width, width);
  const footprintDepth = positive(shape.height, depth);
  const centerX = finite(shape.x) + footprintWidth / 2;
  const centerY = finite(shape.y) + footprintDepth / 2;
  const rotationDegrees = finite(shape.rotation);
  const rotationRadians = THREE.MathUtils.degToRad(rotationDegrees);

  return Array.from({ length: stepCount }, (_, index) => {
    const height = stepRise * (index + 1);
    const forward = -depth / 2 + stepDepth * (index + 0.5);
    return {
      index,
      width,
      depth: stepDepth,
      height,
      x: centerX - Math.sin(rotationRadians) * forward,
      y: finite(baseHeight) + height / 2,
      z: centerY + Math.cos(rotationRadians) * forward,
      rotationY: -rotationRadians,
      bottom: finite(baseHeight),
      top: finite(baseHeight) + height,
    };
  });
}

function addLinearStairs(group, shape, baseHeight) {
  const stairs = new THREE.Group();
  stairs.name = `stairs:${shape.id ?? shape.name ?? "linear"}`;
  const material = new THREE.MeshStandardMaterial({
    color: materialColor(shape, "#8d8d88"),
    roughness: 0.86,
    metalness: 0,
  });
  for (const descriptor of createLinearStairStepDescriptors(shape, baseHeight)) {
    const geometry = new THREE.BoxGeometry(descriptor.width, descriptor.height, descriptor.depth);
    const step = new THREE.Mesh(geometry, material);
    step.name = `${stairs.name}:step-${descriptor.index + 1}`;
    step.position.set(descriptor.x, descriptor.y, descriptor.z);
    step.rotation.y = descriptor.rotationY;
    step.castShadow = true;
    step.receiveShadow = true;
    stairs.add(step);
  }
  group.add(stairs);
}

function addWallSegments(group, shape, baseHeight) {
  const points = shape.wallCenterline;
  if (!Array.isArray(points) || points.length < 2) return;
  const thickness = positive(shape.wallThickness ?? shape.strokeWidth, 20);
  const height = shapeHeight(shape);
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const deltaX = finite(to.x) - finite(from.x);
    const deltaY = finite(to.y) - finite(from.y);
    const length = Math.hypot(deltaX, deltaY);
    if (length < 0.01) continue;
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const material = new THREE.MeshStandardMaterial({
      color: materialColor(shape, "#343a37"),
      roughness: 0.9,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      (finite(from.x) + finite(to.x)) / 2,
      baseHeight + height / 2,
      (finite(from.y) + finite(to.y)) / 2,
    );
    mesh.rotation.y = -Math.atan2(deltaY, deltaX);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function addShape(group, shape, baseHeight) {
  if (shape.ueBlockout?.blockType === "stairs-linear") {
    addLinearStairs(group, shape, baseHeight);
  } else if (Array.isArray(shape.wallCenterline)) {
    addWallSegments(group, shape, baseHeight);
  } else if (shape.type === "circle") {
    addCircle(group, shape, baseHeight);
  } else if (Number.isFinite(Number(shape.x)) && Number.isFinite(Number(shape.y))) {
    addRect(group, shape, baseHeight);
  }
}

function connectionColor(typeId) {
  const type = connectionType(typeId);
  if (type.directional === "vertical") return 0xe5a14e;
  if (type.directional) return 0xe3746d;
  return 0x62c4a6;
}

function addConnections(group, graphValue) {
  const graph = graphValue?.modules ? graphValue : structureGraph(graphValue);
  for (const connection of graph.connections) {
    try {
      const from = worldPort(graph, connection.from);
      const to = worldPort(graph, connection.to);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(from.x, from.z + 24, from.y),
        new THREE.Vector3(to.x, to.z + 24, to.y),
      ]);
      const material = new THREE.LineBasicMaterial({ color: connectionColor(connection.type) });
      group.add(new THREE.Line(geometry, material));
    } catch {
      // Invalid legacy references remain visible in 2D diagnostics and are skipped here.
    }
  }
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose?.());
    else object.material?.dispose?.();
  });
  root.removeFromParent();
}

function fitCamera(camera, controls, root) {
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) {
    controls.target.set(0, 0, 0);
    camera.position.set(650, 520, 650);
    camera.near = 0.1;
    camera.far = 10000;
    camera.updateProjectionMatrix();
    controls.update();
    return;
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(200, size.length() / 2);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.9, radius * 1.15));
  camera.near = Math.max(0.1, radius / 500);
  camera.far = Math.max(10000, radius * 20);
  camera.updateProjectionMatrix();
  controls.update();
}

export function createStructurePreview3d(container, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x151917, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "structure-preview-canvas";
  renderer.domElement.setAttribute("aria-label", "楼层模块三维预览");
  container.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x151917, 5000, 18000);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.minDistance = 40;
  controls.maxDistance = 50000;

  scene.add(new THREE.HemisphereLight(0xf2f0e8, 0x28302c, 1.6));
  const keyLight = new THREE.DirectionalLight(0xfff4df, 2.2);
  keyLight.position.set(1600, 2400, 1200);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);
  const grid = new THREE.GridHelper(20000, 100, 0x46504b, 0x29302c);
  grid.material.transparent = true;
  grid.material.opacity = 0.52;
  scene.add(grid);

  let content = new THREE.Group();
  scene.add(content);
  let objectCount = 0;

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function render() {
    renderer.render(scene, camera);
  }

  function refresh(level) {
    disposeObject(content);
    content = new THREE.Group();
    content.name = "structure-preview-content";
    scene.add(content);
    const assembledGraph = resolveStructureAssemblyGraph(level);
    const resolved = resolveStructureGraphLevel(level, assembledGraph);
    const layerById = new Map((resolved.layers ?? []).map((layer) => [layer.id, layer]));
    for (const shape of resolved.shapes ?? []) {
      addShape(content, shape, finite(layerById.get(shape.layerId)?.height));
    }
    addConnections(content, assembledGraph);
    objectCount = content.children.length;
    fitCamera(camera, controls, content);
    resize();
    render();
    options.onRefresh?.({ objectCount });
    return { objectCount };
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  controls.addEventListener("change", render);
  camera.position.set(650, 520, 650);
  controls.update();
  resize();

  return {
    refresh,
    resize,
    render,
    get objectCount() {
      return objectCount;
    },
    dispose() {
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(content);
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
