import assert from "node:assert/strict";
import test from "node:test";

import {
  addModulePort,
  connectModulePorts,
  createEmptyStructureModule,
  createModuleFromLayer,
  duplicateModuleInstance,
  materializeModulePortShapes,
  removeModuleInstance,
  removeStructureModule,
  resolveStructureAssemblyGraph,
  resolveStructureGraphLevel,
  structureGraph,
  syncModulePortsFromShapes,
  updateConnectionWaypoints,
  updateStructureAssembly,
  updateStructureModule,
} from "../src/integrations/layout/structure-module-model.js";

function baseLevel() {
  return {
    name: "Modules",
    shapes: [{
      id: "floor",
      type: "rect",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      rotation: 0,
      layerId: "floor-layer",
    }],
    entities: [],
    layers: [{ id: "floor-layer", name: "标准楼层", height: 0, visible: true }],
  };
}

function createTwoInstances(type, targetPort = { x: -200, y: 0, z: 0 }) {
  let result = createModuleFromLayer(baseLevel(), "floor-layer", {
    moduleId: "module-floor",
    instanceId: "instance-a",
  });
  let level = addModulePort(result.level, result.moduleId, {
    id: "port-east",
    position: { x: 200, y: 0, z: 0 },
    facing: 0,
  }).level;
  level = addModulePort(level, result.moduleId, {
    id: "port-west",
    position: targetPort,
    facing: 180,
  }).level;
  level = duplicateModuleInstance(level, result.instanceId, {
    instanceId: "instance-b",
    offsetX: 1000,
    offsetY: 500,
  }).level;
  return connectModulePorts(level, {
    id: `connection-${type}`,
    type,
    from: { instanceId: "instance-a", portId: "port-east" },
    to: { instanceId: "instance-b", portId: "port-west" },
  }).level;
}

test("creates a reusable module definition and duplicate instance from a layer", () => {
  const created = createModuleFromLayer(baseLevel(), "floor-layer", {
    moduleId: "module-floor",
    instanceId: "instance-a",
  });
  const duplicated = duplicateModuleInstance(created.level, created.instanceId, {
    instanceId: "instance-b",
  });
  const graph = structureGraph(duplicated.level);

  assert.equal(graph.modules.length, 1);
  assert.equal(graph.instances.length, 2);
  assert.equal(graph.instances[1].moduleId, "module-floor");
  assert.deepEqual(graph.modules[0].origin, { x: 200, y: 150, z: 0 });
  assert.equal(graph.modules[0].ownsSourceLayer, false);
});

test("creates an empty owned module and first instance at an assembly position", () => {
  const created = createEmptyStructureModule(baseLevel(), {
    moduleId: "module-empty",
    instanceId: "instance-empty",
    sourceLayerId: "module-layer-empty",
    name: "塔楼",
    transform: { x: 850, y: -320, z: 600, rotation: 90 },
  });
  const graph = structureGraph(created.level);

  assert.deepEqual(graph.modules[0], {
    id: "module-empty",
    name: "塔楼",
    sourceLayerId: "module-layer-empty",
    ownsSourceLayer: true,
    origin: { x: 0, y: 0, z: 0 },
    ports: [],
  });
  assert.deepEqual(graph.instances[0].transform, { x: 850, y: -320, z: 600, rotation: 90 });
  assert.equal(created.level.layers.at(-1).name, "塔楼 · 内部");
});

test("renaming an owned module also renames its internal source layer", () => {
  const created = createEmptyStructureModule(baseLevel(), {
    moduleId: "module-empty",
    sourceLayerId: "module-layer-empty",
  });
  const renamed = updateStructureModule(created.level, "module-empty", { name: "钟楼" });

  assert.equal(structureGraph(renamed).modules[0].name, "钟楼");
  assert.equal(renamed.layers.find((layer) => layer.id === "module-layer-empty").name, "钟楼 · 内部");
});

test("materializes legacy graph ports as editable shapes and syncs shape edits", () => {
  let created = createEmptyStructureModule(baseLevel(), {
    moduleId: "module-empty",
    instanceId: "instance-empty",
    sourceLayerId: "module-layer-empty",
  });
  created = addModulePort(created.level, "module-empty", {
    id: "port-east",
    name: "东门",
    position: { x: 200, y: 80, z: 40 },
    facing: 90,
  });
  const materialized = materializeModulePortShapes(created.level, "module-empty");
  const portShape = materialized.shapes.find((shape) => shape.modulePort?.id === "port-east");
  const edited = {
    ...materialized,
    shapes: materialized.shapes.map((shape) => shape.id === portShape.id ? {
      ...shape,
      x: 300,
      y: 188,
      rotation: 180,
      modulePort: { ...shape.modulePort, name: "新东门", z: 120 },
    } : shape),
  };
  const synchronized = syncModulePortsFromShapes(edited, "module-empty");
  const port = structureGraph(synchronized).modules[0].ports[0];

  assert.equal(portShape.x + portShape.width / 2, 200);
  assert.equal(portShape.y + portShape.height / 2, 80);
  assert.deepEqual(port, {
    id: "port-east",
    name: "新东门",
    position: { x: 350, y: 200, z: 120 },
    facing: 180,
  });
});

test("removing a port shape removes published ports and their connections", () => {
  const connected = createTwoInstances("door");
  let materialized = materializeModulePortShapes(connected, "module-floor");
  materialized = {
    ...materialized,
    shapes: materialized.shapes.filter((shape) => shape.modulePort?.id !== "port-east"),
  };
  const synchronized = syncModulePortsFromShapes(materialized, "module-floor");
  const graph = structureGraph(synchronized);

  assert.equal(graph.modules[0].ports.some((port) => port.id === "port-east"), false);
  assert.equal(graph.connections.length, 0);
});

test("copied port shapes receive independent stable port ids", () => {
  let created = createEmptyStructureModule(baseLevel(), {
    moduleId: "module-empty",
    sourceLayerId: "module-layer-empty",
  });
  const original = {
    id: "port-shape-a",
    type: "rect",
    x: 0,
    y: 0,
    width: 100,
    height: 24,
    rotation: 0,
    layerId: "module-layer-empty",
    modulePort: { id: "port-shared", name: "门", z: 0 },
  };
  created.level.shapes.push(original, { ...structuredClone(original), id: "port-shape-b", x: 200 });
  const synchronized = syncModulePortsFromShapes(created.level, "module-empty");
  const portIds = synchronized.shapes.filter((shape) => shape.modulePort).map((shape) => shape.modulePort.id);

  assert.deepEqual(portIds, ["port-shared", "port-port-shape-b"]);
  assert.deepEqual(structureGraph(synchronized).modules[0].ports.map((port) => port.id), portIds);
  assert.equal(new Set(portIds).size, 2);
});

test("deleting an owned module removes its private source layer and contents", () => {
  const created = createEmptyStructureModule(baseLevel(), {
    moduleId: "module-empty",
    sourceLayerId: "module-layer-empty",
  });
  const withContent = {
    ...created.level,
    shapes: [...created.level.shapes, { id: "inside", layerId: "module-layer-empty", type: "rect" }],
    entities: [...created.level.entities, { id: "inside-entity", layerId: "module-layer-empty" }],
  };
  const removed = removeStructureModule(withContent, "module-empty");

  assert.equal(removed.layers.some((layer) => layer.id === "module-layer-empty"), false);
  assert.equal(removed.shapes.some((shape) => shape.id === "inside"), false);
  assert.equal(removed.entities.some((entity) => entity.id === "inside-entity"), false);
});

test("deleting an imported module preserves its existing source layer", () => {
  const created = createModuleFromLayer(baseLevel(), "floor-layer", { moduleId: "module-floor" });
  const removed = removeStructureModule(created.level, "module-floor");

  assert.equal(removed.layers.some((layer) => layer.id === "floor-layer"), true);
  assert.equal(removed.shapes.some((shape) => shape.id === "floor"), true);
});

test("connection keeps diagram placement while preview resolution aligns facing ports", () => {
  const level = createTwoInstances("door");
  const diagramTarget = structureGraph(level).instances.find((instance) => instance.id === "instance-b");
  const target = resolveStructureAssemblyGraph(level).instances.find((instance) => instance.id === "instance-b");

  assert.deepEqual(diagramTarget.transform, { x: 1200, y: 650, z: 0, rotation: 0 });
  assert.deepEqual(target.transform, { x: 600, y: 150, z: 0, rotation: 0 });
  assert.equal(structureGraph(level).connections[0].type, "door");
});

test("elevator connection overlaps XY projection and adds vertical separation", () => {
  const graph = resolveStructureAssemblyGraph(createTwoInstances("elevator"));
  const target = graph.instances.find((instance) => instance.id === "instance-b");

  assert.deepEqual(target.transform, { x: 600, y: 150, z: 300, rotation: 0 });
});

test("drop connection aligns the target below the source in the chosen direction", () => {
  const graph = resolveStructureAssemblyGraph(createTwoInstances("drop"));
  const target = graph.instances.find((instance) => instance.id === "instance-b");

  assert.deepEqual(target.transform, { x: 850, y: 150, z: -300, rotation: 0 });
});

test("resolves reused modules into independent world-space layers for UE import", () => {
  const level = materializeModulePortShapes(createTwoInstances("elevator"), "module-floor");
  const resolved = resolveStructureGraphLevel(level);

  assert.equal(resolved.layers.length, 2);
  assert.deepEqual(resolved.layers.map((layer) => layer.height), [0, 300]);
  assert.equal(resolved.shapes.length, 2);
  assert.equal(resolved.shapes.some((shape) => shape.modulePort), false);
  assert.deepEqual(
    resolved.shapes.map((shape) => [shape.x, shape.y, shape.layerId]),
    [[0, 0, "structure-instance-a"], [400, 0, "structure-instance-b"]],
  );
  assert.equal(resolved.structureResolved, true);
});

test("moving a diagram node does not disturb other nodes and preview still resolves the branch", () => {
  const connected = createTwoInstances("stairs");
  const moved = updateStructureAssembly(connected, "instance-a", {
    transform: { x: 1000, y: 700, z: 100, rotation: 90 },
  });
  const diagramTarget = structureGraph(moved).instances.find((instance) => instance.id === "instance-b");
  const target = resolveStructureAssemblyGraph(moved).instances.find((instance) => instance.id === "instance-b");

  assert.deepEqual(diagramTarget.transform, { x: 1200, y: 650, z: 0, rotation: 0 });
  assert.deepEqual(target.transform, { x: 1000, y: 1500, z: 400, rotation: 90 });
});

test("stores and edits connection route bends independently from assembled transforms", () => {
  const connected = createTwoInstances("stairs");
  const connectionId = structureGraph(connected).connections[0].id;
  const routed = updateConnectionWaypoints(connected, connectionId, [
    { x: 700, y: 150 },
    { x: 700, y: 500 },
  ]);
  const graph = structureGraph(routed);

  assert.deepEqual(graph.connections[0].waypoints, [
    { x: 700, y: 150 },
    { x: 700, y: 500 },
  ]);
  assert.deepEqual(
    resolveStructureAssemblyGraph(routed).instances.find((instance) => instance.id === "instance-b").transform,
    { x: 1000, y: 150, z: 300, rotation: 0 },
  );
});

test("resolves a branched route graph through distinct published ports", () => {
  const created = createModuleFromLayer(baseLevel(), "floor-layer", {
    moduleId: "module-floor",
    instanceId: "instance-a",
  });
  let level = addModulePort(created.level, created.moduleId, {
    id: "port-east",
    position: { x: 200, y: 0, z: 0 },
    facing: 0,
  }).level;
  level = addModulePort(level, created.moduleId, {
    id: "port-west",
    position: { x: -200, y: 0, z: 0 },
    facing: 180,
  }).level;
  level = addModulePort(level, created.moduleId, {
    id: "port-south",
    position: { x: 0, y: 150, z: 0 },
    facing: 90,
  }).level;
  level = addModulePort(level, created.moduleId, {
    id: "port-north",
    position: { x: 0, y: -150, z: 0 },
    facing: 270,
  }).level;
  level = duplicateModuleInstance(level, created.instanceId, {
    instanceId: "instance-b",
    offsetX: 1400,
    offsetY: 200,
  }).level;
  level = duplicateModuleInstance(level, created.instanceId, {
    instanceId: "instance-c",
    offsetX: 300,
    offsetY: 1300,
  }).level;
  level = connectModulePorts(level, {
    id: "route-east",
    type: "road",
    from: { instanceId: "instance-a", portId: "port-east" },
    to: { instanceId: "instance-b", portId: "port-west" },
    waypoints: [{ x: 800, y: 150 }],
  }).level;
  level = connectModulePorts(level, {
    id: "route-south",
    type: "stairs",
    from: { instanceId: "instance-a", portId: "port-south" },
    to: { instanceId: "instance-c", portId: "port-north" },
    waypoints: [{ x: 200, y: 600 }],
  }).level;

  const diagram = structureGraph(level);
  const assembled = resolveStructureAssemblyGraph(level);
  assert.equal(diagram.connections.length, 2);
  assert.deepEqual(
    assembled.instances.find((instance) => instance.id === "instance-b").transform,
    { x: 1100, y: 150, z: 0, rotation: 0 },
  );
  assert.deepEqual(
    assembled.instances.find((instance) => instance.id === "instance-c").transform,
    { x: 200, y: 850, z: 300, rotation: 0 },
  );
});

test("removing an instance also removes its connections", () => {
  const connected = createTwoInstances("door");
  const graph = structureGraph(removeModuleInstance(connected, "instance-b"));

  assert.equal(graph.instances.length, 1);
  assert.equal(graph.connections.length, 0);
});

test("does not export a module template when it has no instances", () => {
  const created = createModuleFromLayer(baseLevel(), "floor-layer", {
    moduleId: "module-floor",
    instanceId: "instance-a",
  });
  const withoutInstances = removeModuleInstance(created.level, "instance-a");
  const resolved = resolveStructureGraphLevel(withoutInstances);

  assert.equal(resolved.layers.length, 0);
  assert.equal(resolved.shapes.length, 0);
  assert.equal(resolved.structureResolved, true);
});

test("applies the provisional offsets for every connection form", () => {
  const expected = new Map([
    ["door", { x: 600, z: 0 }],
    ["one-way-door", { x: 600, z: 0 }],
    ["stairs", { x: 1000, z: 300 }],
    ["spiral-stairs", { x: 600, z: 300 }],
    ["elevator", { x: 600, z: 300 }],
    ["one-way-elevator", { x: 600, z: 300 }],
    ["road", { x: 1100, z: 0 }],
    ["drop", { x: 850, z: -300 }],
  ]);

  for (const [type, transform] of expected) {
    const target = resolveStructureAssemblyGraph(createTwoInstances(type)).instances
      .find((instance) => instance.id === "instance-b");
    assert.equal(target.transform.x, transform.x, type);
    assert.equal(target.transform.y, 150, type);
    assert.equal(target.transform.z, transform.z, type);
  }
});
