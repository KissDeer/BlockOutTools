"""Apply the reference-led High Wall manifests in the target Unreal level.

No deletion or map save. Plan/report are replaced only after all actor updates
succeed. Re-running is safe: stable labels address explicitly tagged actors.
"""

import copy
import json
import math
from pathlib import Path

import unreal


ROOT = Path("D:/GameDesgin/BlockOutTools/output/high-wall-of-lothric")
TARGET = "/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2"
MATERIAL_ROOT = "/Game/MyGame/Map/HighWallofLothric/HighWallWhitebox/Materials/MI_HWL_"
SOURCES = ("core-plan.json", "scenery-plan.json")


def read_plan():
    documents = [json.loads((ROOT / name).read_text(encoding="utf-8")) for name in SOURCES]
    merged = copy.deepcopy(documents[0])
    if merged.get("target_level") != TARGET:
        raise RuntimeError("Core plan targets another level")
    if len(merged.get("origin", [])) != 3 or not all(math.isfinite(v) for v in merged["origin"]):
        raise RuntimeError("Invalid core origin")
    merged.setdefault("assumptions", [])
    merged["schema"] = "highwall-whitebox-plan-v1"
    merged["refinement_sources"] = list(SOURCES)
    by_label = {spec["label"]: spec for spec in merged["actors"]}
    if len(by_label) != len(merged["actors"]):
        raise RuntimeError("Duplicate labels in base plan")
    for document in documents[1:]:
        if document.get("target_level", TARGET) != TARGET:
            raise RuntimeError("Manifest targets another level")
        if document.get("origin", merged["origin"]) != merged["origin"]:
            raise RuntimeError("Manifest origin differs from base plan")
        merged["assumptions"].extend(document.get("assumptions", []))
        for original in document["actors"]:
            spec = copy.deepcopy(original)
            if spec["label"] in by_label:
                raise RuntimeError("Duplicate manifest actor: " + spec["label"])
            by_label[spec["label"]] = spec
            merged["actors"].append(spec)
        overrides = document.get("existing_overrides", [])
        if isinstance(overrides, dict):
            overrides = [dict(values, label=label) for label, values in overrides.items()]
        for override in overrides:
            if override["label"] not in by_label:
                raise RuntimeError("Unknown override label: " + override["label"])
            by_label[override["label"]].update(override)
        for label in document.get("hide_existing_labels", []):
            if label not in by_label:
                raise RuntimeError("Unknown hide label: " + label)
            by_label[label].update(hidden=True, collision=False)
    for route in merged.get("routes", []):
        if len(route.get("points", [])) < 2 or any(len(p) != 3 or not all(math.isfinite(v) for v in p) for p in route["points"]):
            raise RuntimeError("Invalid route: " + route.get("name", "unnamed"))
    for spec in merged["actors"]:
        if not spec["label"].startswith("HWL_") or spec["kind"] not in ("mesh", "text"):
            raise RuntimeError("Unsupported actor spec: " + spec["label"])
        for field in ("location", "rotation"):
            if len(spec[field]) != 3 or not all(math.isfinite(v) for v in spec[field]):
                raise RuntimeError("Nonfinite transform: " + spec["label"])
        if spec["kind"] == "mesh" and (len(spec["size"]) != 3 or not all(math.isfinite(v) and v > 0 for v in spec["size"])):
            raise RuntimeError("Invalid dimensions: " + spec["label"])
    return merged


def preload(plan):
    roles = {spec["material"] for spec in plan["actors"] if spec["kind"] == "mesh"}
    materials = {role: unreal.load_asset(MATERIAL_ROOT + role) for role in sorted(roles)}
    missing = [role for role, asset in materials.items() if not isinstance(asset, unreal.MaterialInterface)]
    if missing:
        raise RuntimeError("Missing materials; run atmosphere script first: " + ", ".join(missing))
    names = {spec["mesh"] for spec in plan["actors"] if spec["kind"] == "mesh"}
    meshes = {}
    for name in names:
        canonical = name.capitalize()
        if canonical not in ("Cube", "Cylinder", "Cone", "Sphere"):
            raise RuntimeError("Unsupported engine primitive: " + name)
        mesh = unreal.load_asset("/Engine/BasicShapes/" + canonical)
        if not isinstance(mesh, unreal.StaticMesh):
            raise RuntimeError("Missing engine primitive: " + canonical)
        bounds = mesh.get_bounds()
        extents = [getattr(bounds.box_extent, axis) for axis in "xyz"]
        if not all(value > 0 for value in extents):
            raise RuntimeError("Primitive has empty bounds: " + canonical)
        meshes[name] = (mesh, bounds.origin, [value * 2 for value in extents])
    return materials, meshes


def owned(actor):
    tags = {str(tag) for tag in actor.tags}
    return "HWL_Whitebox" in tags


def apply_actor(spec, actor, subsystem, current_level, origin, materials, meshes):
    location = unreal.Vector(*[spec["location"][i] + origin[i] for i in range(3)])
    rotation = unreal.Rotator(pitch=spec["rotation"][0], yaw=spec["rotation"][1], roll=spec["rotation"][2])
    actor_class = unreal.StaticMeshActor if spec["kind"] == "mesh" else unreal.TextRenderActor
    if actor is None:
        actor = subsystem.spawn_actor_from_class(actor_class, location, rotation)
        if actor is None:
            raise RuntimeError("Spawn failed: " + spec["label"])
        actor.set_editor_property("tags", [unreal.Name("HWL_Whitebox")])
    if actor.get_level() != current_level:
        raise RuntimeError("Actor is outside target level: " + spec["label"])
    actor.set_actor_label(spec["label"])
    actor.set_folder_path(unreal.Name("HWL/" + spec["region"]))
    actor.set_actor_tick_enabled(False)
    hidden = bool(spec.get("hidden", False))
    actor.set_actor_hidden_in_game(hidden)
    actor.set_is_temporarily_hidden_in_editor(hidden)
    if spec["kind"] == "mesh":
        component = actor.static_mesh_component
        component.set_mobility(unreal.ComponentMobility.STATIC)
        mesh, local_center, dimensions = meshes[spec["mesh"]]
        component.set_static_mesh(mesh)
        actor.set_actor_scale3d(unreal.Vector(*[spec["size"][i] / dimensions[i] for i in range(3)]))
        component.set_material(0, materials[spec["material"]])
        collision = bool(spec.get("collision", True)) and not hidden
        component.set_collision_profile_name("BlockAll" if collision else "NoCollision")
        component.set_collision_enabled(unreal.CollisionEnabled.QUERY_AND_PHYSICS if collision else unreal.CollisionEnabled.NO_COLLISION)
        component.set_component_tick_enabled(False)
        actor.set_actor_location_and_rotation(location, rotation, False, True)
        actual_center = unreal.MathLibrary.transform_location(actor.get_actor_transform(), local_center)
        corrected = unreal.Vector(*[2 * getattr(location, axis) - getattr(actual_center, axis) for axis in "xyz"])
        actor.set_actor_location(corrected, False, True)
    else:
        actor.set_actor_location_and_rotation(location, rotation, False, True)
        component = actor.get_component_by_class(unreal.TextRenderComponent)
        component.set_text(spec["text"])
        component.set_world_size(spec["text_size"])
        component.set_text_render_color(unreal.Color(r=235, g=225, b=200, a=255))
    return actor


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def main():
    current_level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).get_current_level()
    current_path = current_level.get_path_name().split(":", 1)[0].split(".", 1)[0] if current_level else None
    if unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world():
        raise RuntimeError("Stop PIE before applying geometry")
    if current_path != TARGET:
        raise RuntimeError("Expected %s, got %s" % (TARGET, current_path))
    plan = read_plan()
    materials, meshes = preload(plan)
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    wanted = {spec["label"] for spec in plan["actors"]}
    existing = {}
    for actor in subsystem.get_all_level_actors():
        label = actor.get_actor_label()
        if label not in wanted:
            continue
        if label in existing or not owned(actor) or actor.get_level() != current_level:
            raise RuntimeError("Duplicate or unowned/outside-level actor: " + label)
        existing[label] = actor
    for spec in plan["actors"]:
        actor = existing.get(spec["label"])
        expected_class = unreal.StaticMeshActor if spec["kind"] == "mesh" else unreal.TextRenderActor
        if actor and not isinstance(actor, expected_class):
            raise RuntimeError("Actor class differs: " + spec["label"])
    report = {"level": current_path, "created_actor_paths": [], "modified_actor_paths": [], "missing_materials": [],
              "source_manifests": list(SOURCES), "map_saved_by_this_script": False}
    minimum, maximum = [float("inf")] * 3, [float("-inf")] * 3
    for index, spec in enumerate(plan["actors"], 1):
        prior = existing.get(spec["label"])
        actor = apply_actor(spec, prior, subsystem, current_level, plan["origin"], materials, meshes)
        report["modified_actor_paths" if prior else "created_actor_paths"].append(actor.get_path_name())
        if spec["kind"] == "mesh" and not spec.get("hidden", False):
            center, extents = actor.get_actor_bounds(False)
            for i, axis in enumerate("xyz"):
                minimum[i] = min(minimum[i], getattr(center, axis) - getattr(extents, axis))
                maximum[i] = max(maximum[i], getattr(center, axis) + getattr(extents, axis))
        if index % 100 == 0:
            print("HWL refinement applied %d / %d" % (index, len(plan["actors"])))
    report.update(created=len(report["created_actor_paths"]), modified=len(report["modified_actor_paths"]),
                  total=len(plan["actors"]), bounds_cm={"min": minimum, "max": maximum},
                  hidden_count=sum(bool(spec.get("hidden")) for spec in plan["actors"]),
                  decorative_no_collision_count=sum(spec.get("collision") is False for spec in plan["actors"]))
    write_json(ROOT / "application.json", report)
    write_json(ROOT / "plan.json", plan)
    print("HWL_REFINEMENT " + json.dumps({key: value for key, value in report.items() if not key.endswith("actor_paths")}))
    print("REPORT " + str(ROOT / "application.json"))
    print("PLAN " + str(ROOT / "plan.json"))


if __name__ == "__main__":
    main()
