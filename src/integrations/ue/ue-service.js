import { Buffer } from "node:buffer";

import { UnrealMcpClient, readToolText } from "./mcp-client.js";

const CATALOG_PREFIX = "BLOCKOUT_CATALOG_JSON=";
const SNAPSHOT_PREFIX = "BLOCKOUT_SNAPSHOT_JSON=";
const STATUS_PREFIX = "BLOCKOUT_STATUS_JSON=";
const APPLY_PREFIX = "BLOCKOUT_APPLY_JSON=";

function extractPythonOutput(text) {
  try {
    const wrapper = JSON.parse(text);
    const output = wrapper.stdout ?? wrapper.output;
    if (typeof output === "string") {
      return extractPythonOutput(output);
    }
  } catch {
    // The MCP tool may return plain stdout rather than a JSON wrapper.
  }
  return text;
}

export function parsePrefixedJson(text, prefix) {
  const output = extractPythonOutput(text);
  const prefixIndex = output.indexOf(prefix);
  if (prefixIndex < 0) {
    throw new Error(`UE MCP response did not contain ${prefix}`);
  }
  const jsonStart = prefixIndex + prefix.length;
  const jsonEnd = output.indexOf("\n", jsonStart);
  const jsonText = output.slice(jsonStart, jsonEnd < 0 ? undefined : jsonEnd).trim();
  return JSON.parse(jsonText);
}

function createClient(projectConfig) {
  return new UnrealMcpClient({
    endpoint: process.env.BLOCKOUT_UE_MCP_URL ?? projectConfig.mcpEndpoint,
  });
}

async function withClient(projectConfig, callback) {
  const client = createClient(projectConfig);
  try {
    const serverInfo = await client.connect();
    return await callback(client, serverInfo);
  } finally {
    await client.disconnect();
  }
}

async function executePythonJson(client, prefix, code) {
  const result = await client.callTool("execute_python_code", { code });
  return parsePrefixedJson(readToolText(result), prefix);
}

export async function getUnrealStatus(projectConfig) {
  return withClient(projectConfig, async (client, serverInfo) => {
    const code = `import unreal, json
payload = {
    "project_file": unreal.Paths.get_project_file_path(),
    "project_name": unreal.SystemLibrary.get_game_name(),
    "engine_version": unreal.SystemLibrary.get_engine_version(),
}
print("${STATUS_PREFIX}" + json.dumps(payload, separators=(",", ":")))`;
    const editor = await executePythonJson(client, STATUS_PREFIX, code);
    const normalizePath = (value) => String(value).replaceAll("\\", "/").toLowerCase();
    return {
      connected: true,
      endpoint: process.env.BLOCKOUT_UE_MCP_URL ?? projectConfig.mcpEndpoint,
      protocolVersion: client.protocolVersion,
      serverInfo,
      editor,
      expectedProject: projectConfig.projectName,
      projectMatches: editor.project_name === projectConfig.projectName,
      projectPathMatches: normalizePath(editor.project_file) === normalizePath(projectConfig.uprojectPath),
    };
  });
}

export async function catalogBlockoutAssets(projectConfig) {
  const assetRoot = projectConfig.assetRoot;
  const code = `import unreal, json
assets = []
for object_path in unreal.EditorAssetLibrary.list_assets("${assetRoot}", recursive=False, include_folder=False):
    asset = unreal.load_asset(object_path)
    if not isinstance(asset, unreal.StaticMesh):
        continue
    bounds = asset.get_bounding_box()
    size = bounds.max - bounds.min
    assets.append({
        "path": object_path.split(".")[0],
        "name": asset.get_name(),
        "bounds_min": [bounds.min.x, bounds.min.y, bounds.min.z],
        "bounds_max": [bounds.max.x, bounds.max.y, bounds.max.z],
        "native_size_cm": [size.x, size.y, size.z],
        "materials": [str(slot.material_slot_name) for slot in asset.get_editor_property("static_materials")],
    })
print("${CATALOG_PREFIX}" + json.dumps(assets, separators=(",", ":")))`;

  return withClient(projectConfig, async (client) => ({
    assetRoot,
    assets: await executePythonJson(client, CATALOG_PREFIX, code),
  }));
}

export async function snapshotBridgeActors(projectConfig, parametricSchema) {
  const actorTag = JSON.stringify(projectConfig.actorTag);
  const actorFolder = JSON.stringify(projectConfig.actorFolder);
  const parametricProperties = JSON.stringify(Object.fromEntries(
    parametricSchema.blocks.map((block) => [
      block.blueprintClassPath,
      [...block.parameters, ...parametricSchema.commonParameters].map((parameter) => parameter.key),
    ]),
  ));
  const code = `import unreal, json
bridge_tag = ${actorTag}
bridge_folder = ${actorFolder}
parametric_properties = ${parametricProperties}
actors = []
def json_value(value):
    value_type = type(value).__name__
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if value_type == "Vector":
        return [value.x, value.y, value.z]
    if value_type == "Vector2D":
        return [value.x, value.y]
    if value_type == "LinearColor":
        return [value.r, value.g, value.b, value.a]
    if value_type == "Name":
        return str(value)
    if hasattr(value, "name") and hasattr(value, "value"):
        return value.name
    if hasattr(value, "get_path_name"):
        return value.get_path_name()
    return str(value)
for actor in unreal.EditorLevelLibrary.get_all_level_actors():
    tags = [str(tag) for tag in actor.tags]
    folder = str(actor.get_folder_path())
    if bridge_tag not in tags and not folder.startswith(bridge_folder):
        continue
    class_path = actor.get_class().get_path_name()
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    mesh = component.static_mesh if component else None
    if class_path not in parametric_properties and not mesh:
        continue
    location = actor.get_actor_location()
    rotation = actor.get_actor_rotation()
    scale = actor.get_actor_scale3d()
    source_id = next((tag.split(":", 1)[1] for tag in tags if tag.startswith("LayoutToolsId:")), None)
    sync_key = next((tag.split(":", 1)[1] for tag in tags if tag.startswith("LayoutToolsSync:")), None)
    parameters = {}
    if class_path in parametric_properties:
        for property_name in parametric_properties[class_path]:
            try:
                parameters[property_name] = json_value(actor.get_editor_property(property_name))
            except Exception:
                pass
    actors.append({
        "path": actor.get_path_name(),
        "label": actor.get_actor_label(),
        "sourceId": source_id,
        "syncKey": sync_key,
        "actorKind": "parametric" if class_path in parametric_properties else "static-mesh",
        "blueprintClassPath": class_path if class_path in parametric_properties else None,
        "parameters": parameters,
        "assetPath": mesh.get_path_name().split(".")[0] if mesh else None,
        "folder": folder,
        "tags": tags,
        "location": [location.x, location.y, location.z],
        "rotation": [rotation.pitch, rotation.yaw, rotation.roll],
        "scale3d": [scale.x, scale.y, scale.z],
    })
print("${SNAPSHOT_PREFIX}" + json.dumps(actors, separators=(",", ":")))`;

  return withClient(projectConfig, async (client) => ({
    actorFolder: projectConfig.actorFolder,
    actors: await executePythonJson(client, SNAPSHOT_PREFIX, code),
  }));
}

export function buildApplyImportPython(plan, projectConfig, options = {}) {
  const encodedPlan = Buffer.from(JSON.stringify(plan), "utf8").toString("base64");
  return `import unreal, json, base64
plan = json.loads(base64.b64decode("${encodedPlan}").decode("utf-8"))
bridge_tag = ${JSON.stringify(projectConfig.actorTag)}
target_folder = plan["actorFolder"]
created = []
updated = []
unchanged = []
removed = []
retained = []
errors = []

def find_actor(path):
    for candidate in unreal.EditorLevelLibrary.get_all_level_actors():
        if candidate.get_path_name() == path:
            return candidate
    return None

def converted_property(actor, property_name, raw_value):
    current = actor.get_editor_property(property_name)
    value_type = type(current).__name__
    if value_type == "Vector":
        return unreal.Vector(*raw_value)
    if value_type == "Vector2D":
        return unreal.Vector2D(*raw_value)
    if value_type == "LinearColor":
        return unreal.LinearColor(*raw_value)
    if value_type == "Name":
        return unreal.Name(raw_value)
    if isinstance(raw_value, str) and hasattr(type(current), raw_value):
        return getattr(type(current), raw_value)
    if hasattr(current, "get_path_name") or (current is None and isinstance(raw_value, str) and raw_value.startswith("/")):
        return unreal.load_asset(raw_value)
    return raw_value

def configure_actor(actor, item):
    location = unreal.Vector(*item["location"])
    pitch, yaw, roll = item["rotation"]
    rotation = unreal.Rotator(pitch=pitch, yaw=yaw, roll=roll)
    actor.set_actor_location(location, False, False)
    actor.set_actor_rotation(rotation, False)
    actor.set_actor_scale3d(unreal.Vector(*item["scale3d"]))
    if item.get("actorKind") == "parametric":
        for property_name, raw_value in item.get("parameters", {}).items():
            value = converted_property(actor, property_name, raw_value)
            actor.set_editor_property(property_name, value)
    else:
        mesh = unreal.load_asset(item["assetPath"])
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        if not isinstance(mesh, unreal.StaticMesh) or not component:
            raise RuntimeError("Static mesh update target is invalid: " + item["assetPath"])
        component.set_static_mesh(mesh)
    actor.set_actor_label(item["label"])
    actor.set_folder_path(item["folder"])
    actor.tags = [unreal.Name(tag) for tag in item["tags"]]

operations = plan.get("sync", {}).get("operations")
if operations is None:
    operations = [{"action": "create", "actor": item} for item in plan["actors"]]

with unreal.ScopedEditorTransaction("Import LayoutTools blockout"):
    for operation in operations:
        action = operation.get("action")
        if action == "unchanged":
            unchanged.append(operation.get("currentActorPath"))
            continue
        if action == "retain":
            retained.append(operation.get("currentActorPath"))
            continue
        if action == "delete":
            actor = find_actor(operation.get("currentActorPath"))
            if actor:
                removed.append(actor.get_path_name())
                unreal.EditorLevelLibrary.destroy_actor(actor)
            continue
        item = operation.get("actor")
        actor = None
        try:
            if action == "update":
                actor = find_actor(operation.get("currentActorPath"))
                if not actor:
                    raise RuntimeError("Matched Actor no longer exists")
                configure_actor(actor, item)
                updated.append(actor.get_path_name())
            else:
                location = unreal.Vector(*item["location"])
                pitch, yaw, roll = item["rotation"]
                rotation = unreal.Rotator(pitch=pitch, yaw=yaw, roll=roll)
                if item.get("actorKind") == "parametric":
                    actor_class = unreal.EditorAssetLibrary.load_blueprint_class(item["blueprintAssetPath"])
                    if not actor_class:
                        raise RuntimeError("Blueprint class not found: " + item["blueprintAssetPath"])
                    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(actor_class, location, rotation)
                else:
                    mesh = unreal.load_asset(item["assetPath"])
                    if not isinstance(mesh, unreal.StaticMesh):
                        raise RuntimeError("Static mesh not found: " + item["assetPath"])
                    actor = unreal.EditorLevelLibrary.spawn_actor_from_object(mesh, location, rotation)
                if not actor:
                    raise RuntimeError("Actor spawn returned None")
                configure_actor(actor, item)
                created.append(actor.get_path_name())
        except Exception as exc:
            if actor and action != "update":
                try:
                    unreal.EditorLevelLibrary.destroy_actor(actor)
                except Exception:
                    pass
            errors.append({"id": item.get("id"), "error": str(exc)})

payload = {"created": created, "updated": updated, "unchanged": unchanged, "removed": removed, "retained": retained, "errors": errors}
print("${APPLY_PREFIX}" + json.dumps(payload, separators=(",", ":")))`;
}

export async function applyImportPlan(plan, projectConfig, options = {}) {
  const code = buildApplyImportPython(plan, projectConfig, options);
  return withClient(projectConfig, async (client) => executePythonJson(client, APPLY_PREFIX, code));
}
