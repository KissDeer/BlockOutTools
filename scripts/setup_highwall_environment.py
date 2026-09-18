"""Reference-led High Wall material and native-light pass, run inside Unreal.

Idempotently updates only explicitly owned actors/assets in the target map.
No Blueprint, gameplay components, tick logic, map save, or project settings.
The caller owns level saving and screenshot-based lighting acceptance.
"""

import json
from pathlib import Path

import unreal


TARGET_MAP = "/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2"
SOURCE_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/Materials"
OUTPUT_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/HighWallWhitebox/Materials"
REPORT = Path("D:/GameDesgin/BlockOutTools/output/high-wall-of-lothric/environment.json")
OWNER_TAG = "HWL_Whitebox"

# sRGB display swatches. Texture-free whitebox stone remains deliberately legible.
# The reference shows weathered gray limestone, soot, slate and dusty amber sky.
PALETTE = {
    "Floor": ("Floor", (0.55, 0.55, 0.51)),
    "Stone": ("Stone", (0.61, 0.62, 0.60)),
    "StoneDark": ("StoneDark", (0.31, 0.32, 0.30)),
    "StoneWarm": ("StoneWarm", (0.53, 0.43, 0.34)),
    "Roof": ("Roof", (0.32, 0.34, 0.35)),
    "Trim": ("Stone", (0.68, 0.68, 0.64)),
    "Recess": ("StoneDark", (0.16, 0.18, 0.18)),
    "Moss": ("StoneDark", (0.30, 0.32, 0.23)),
    "Earth": ("Floor", (0.29, 0.26, 0.22)),
    "Rock": ("StoneDark", (0.37, 0.37, 0.34)),
    "Wood": ("StoneDark", (0.23, 0.19, 0.15)),
    "Candle": ("Stone", (0.76, 0.68, 0.50)),
    "Cloth": ("StoneDark", (0.28, 0.12, 0.13)),
}

# Approximate practical-light groups, not a claim about original game lighting.
# label, position cm, lumens, influence radius cm, temperature K
LIGHTS = [
    ("TowerUpper", (8000, 2000, 5700), 18000, 2400, 4200),
    ("WyvernUndercroft", (3500, 1400, 3850), 16000, 2100, 3300),
    ("GreiratCell", (8000, 6800, 2600), 12000, 1800, 3100),
    ("BarracksWest", (-2400, 6100, 2650), 18000, 2400, 3000),
    ("BarracksEast", (-500, 6900, 2650), 18000, 2400, 3300),
    ("DancerDoor", (-6000, 17350, 3050), 24000, 2700, 3000),
    ("DancerNave", (-6000, 19000, 3700), 25000, 3400, 3800),
    ("DancerAltar", (-6000, 20500, 3100), 22000, 2300, 2900),
    ("VordtWest", (-1800, 13500, 650), 18000, 2300, 6500),
    ("VordtEast", (1800, 13500, 650), 18000, 2300, 6500),
    ("VordtGate", (0, 15500, 800), 22000, 3000, 6000),
]



def linear_color(rgb):
    values = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return unreal.LinearColor(r=values[0], g=values[1], b=values[2], a=1.0)


def ensure_actor(subsystem, existing, actor_class, label, location, rotation=None):
    matches = [actor for actor in existing if actor.get_actor_label() == label]
    if len(matches) > 1:
        raise RuntimeError("Duplicate owned label: " + label)
    actor = matches[0] if matches else None
    existed = actor is not None
    if existed and (OWNER_TAG not in [str(tag) for tag in actor.tags] or not isinstance(actor, actor_class)):
        raise RuntimeError("Refusing unexpected actor ownership/class: " + label)
    rotation = rotation or unreal.Rotator(pitch=0.0, yaw=0.0, roll=0.0)
    if not existed:
        actor = subsystem.spawn_actor_from_class(actor_class, unreal.Vector(*location), rotation)
        if actor is None:
            raise RuntimeError("Failed to spawn: " + label)
        actor.set_actor_label(label)
        actor.set_editor_property("tags", [unreal.Name(OWNER_TAG), unreal.Name("HWL_Atmosphere")])
        existing.append(actor)
    current_level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).get_current_level()
    if actor.get_level() != current_level:
        raise RuntimeError("Actor is outside target level: " + label)
    actor.set_actor_location(unreal.Vector(*location), False, True)
    actor.set_actor_rotation(rotation, True)
    actor.set_actor_tick_enabled(False)
    actor.set_folder_path(unreal.Name("HWL/00_Environment"))
    print(("MODIFIED " if existed else "CREATED ") + actor.get_path_name())
    return actor


def materials(report):
    tools = unreal.AssetToolsHelpers.get_asset_tools()
    unreal.EditorAssetLibrary.make_directory(OUTPUT_MATERIALS)
    for role, (source_role, swatch) in PALETTE.items():
        source_path = SOURCE_MATERIALS + "/M_LOTH_" + source_role
        source = unreal.EditorAssetLibrary.load_asset(source_path)
        if not isinstance(source, unreal.MaterialInstanceConstant):
            raise RuntimeError("Missing source MIC: " + source_path)
        name = "MI_HWL_" + role
        path = OUTPUT_MATERIALS + "/" + name
        existed = unreal.EditorAssetLibrary.does_asset_exist(path)
        material = unreal.EditorAssetLibrary.load_asset(path) if existed else tools.create_asset(
            name, OUTPUT_MATERIALS, unreal.MaterialInstanceConstant,
            unreal.MaterialInstanceConstantFactoryNew(),
        )
        if not isinstance(material, unreal.MaterialInstanceConstant):
            raise RuntimeError("Unexpected material class: " + path)
        unreal.MaterialEditingLibrary.set_material_instance_parent(material, source)
        expected = linear_color(swatch)
        # This engine can return False despite applying; the readback is authoritative.
        unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(material, "Base Color", expected)
        unreal.MaterialEditingLibrary.update_material_instance(material)
        actual = unreal.MaterialEditingLibrary.get_material_instance_vector_parameter_value(material, "Base Color")
        if any(abs(getattr(actual, c) - getattr(expected, c)) > 1e-4 for c in "rgba"):
            raise RuntimeError("Material parameter readback mismatch: " + path)
        if not unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False):
            raise RuntimeError("Material save failed: " + path)
        report[role] = {"path": path, "srgb": swatch, "linear_readback": [getattr(actual, c) for c in "rgba"]}
        print(("MODIFIED " if existed else "CREATED ") + path)


def environment(subsystem, existing):
    sun = ensure_actor(subsystem, existing, unreal.DirectionalLight, "HWL_Environment_Sun",
                       (0, 0, 15000), unreal.Rotator(pitch=-12.0, yaw=-45.0, roll=0.0))
    component = sun.get_component_by_class(unreal.DirectionalLightComponent)
    component.set_mobility(unreal.ComponentMobility.MOVABLE)
    component.set_intensity(12000.0)
    component.set_editor_property("atmosphere_sun_light", True)
    component.set_editor_property("light_source_angle", 3.5)
    component.set_editor_property("cast_shadows", True)
    component.set_editor_property("use_temperature", True)
    component.set_editor_property("temperature", 5400.0)

    sky = ensure_actor(subsystem, existing, unreal.SkyLight, "HWL_Environment_SkyLight", (0, 0, 12000))
    component = sky.get_component_by_class(unreal.SkyLightComponent)
    component.set_mobility(unreal.ComponentMobility.MOVABLE)
    component.set_editor_property("real_time_capture", True)
    component.set_intensity(1.0)

    atmosphere = ensure_actor(subsystem, existing, unreal.SkyAtmosphere, "HWL_Environment_Atmosphere", (0, 0, 0))
    component = atmosphere.get_component_by_class(unreal.SkyAtmosphereComponent)
    component.set_editor_property("mie_scattering_scale", 0.012)
    component.set_editor_property("mie_anisotropy", 0.7)
    # UE's coefficient default is 0.0331, not a unit multiplier of 1.
    component.set_editor_property("rayleigh_scattering_scale", 0.0331 * 0.65)
    component.set_editor_property("sky_luminance_factor", unreal.LinearColor(r=0.90, g=0.86, b=0.74, a=1.0))

    fog = ensure_actor(subsystem, existing, unreal.ExponentialHeightFog, "HWL_Atmosphere_Fog", (0, 0, 2800))
    component = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    component.set_editor_property("fog_density", 0.004)
    component.set_editor_property("fog_height_falloff", 0.15)
    component.set_editor_property("start_distance", 1500.0)
    component.set_editor_property("fog_max_opacity", 0.35)
    component.set_editor_property("enable_volumetric_fog", False)
    component.set_editor_property("fog_inscattering_luminance", unreal.LinearColor(r=95.0, g=91.0, b=78.0, a=1.0))

    exposure = ensure_actor(subsystem, existing, unreal.PostProcessVolume, "HWL_Environment_Exposure", (0, 0, 0))
    exposure.set_editor_property("unbound", True)
    settings = exposure.get_editor_property("settings")
    for property_name in ("auto_exposure_min_brightness", "auto_exposure_max_brightness", "auto_exposure_bias"):
        settings.set_editor_property("override_" + property_name, True)
    # Keep the dark void below this elevated city from overexposing gray stone.
    # Indoor readability still needs camera QA with the warm practical lights.
    settings.set_editor_property("auto_exposure_min_brightness", 7.0)
    settings.set_editor_property("auto_exposure_max_brightness", 12.0)
    settings.set_editor_property("auto_exposure_bias", -0.3)
    settings.set_editor_property("override_vignette_intensity", True)
    settings.set_editor_property("vignette_intensity", 0.18)
    exposure.set_editor_property("settings", settings)
    return {
        "sun_lux": sun.get_component_by_class(unreal.DirectionalLightComponent).get_editor_property("intensity"),
        "sun_pitch": sun.get_actor_rotation().pitch,
        "sun_yaw": sun.get_actor_rotation().yaw,
        "sky_intensity": sky.get_component_by_class(unreal.SkyLightComponent).get_editor_property("intensity"),
        "fog_density": fog.get_component_by_class(unreal.ExponentialHeightFogComponent).get_editor_property("fog_density"),
        "fog_height_cm": fog.get_actor_location().z,
        "fog_max_opacity": fog.get_component_by_class(unreal.ExponentialHeightFogComponent).get_editor_property("fog_max_opacity"),
        "min_ev100": exposure.get_editor_property("settings").get_editor_property("auto_exposure_min_brightness"),
        "max_ev100": exposure.get_editor_property("settings").get_editor_property("auto_exposure_max_brightness"),
        "exposure_bias": exposure.get_editor_property("settings").get_editor_property("auto_exposure_bias"),
        "exposure_adaptation": "EV100 7.0 to 12.0 with -0.3 bias limits outdoor washout while retaining indoor adaptation; practical lights support enclosed chambers.",
        "volumetric_fog": False,
    }


def local_lights(subsystem, existing):
    results = []
    for suffix, location, lumens, radius, temperature in LIGHTS:
        label = "HWL_Atmosphere_Light_" + suffix
        actor = ensure_actor(subsystem, existing, unreal.PointLight, label, location)
        component = actor.get_component_by_class(unreal.PointLightComponent)
        component.set_mobility(unreal.ComponentMobility.MOVABLE)
        component.set_intensity_units(unreal.LightUnits.LUMENS)
        component.set_editor_property("use_inverse_squared_falloff", True)
        component.set_intensity(float(lumens))
        component.set_editor_property("attenuation_radius", float(radius))
        component.set_editor_property("use_temperature", True)
        component.set_editor_property("temperature", float(temperature))
        component.set_editor_property("source_radius", 24.0)
        component.set_editor_property("cast_shadows", False)
        component.set_editor_property("affect_translucent_lighting", False)
        component.set_component_tick_enabled(False)
        results.append({
            "label": label, "path": actor.get_path_name(), "position_cm": location,
            "lumens": component.get_editor_property("intensity"),
            "radius_cm": component.get_editor_property("attenuation_radius"),
            "temperature_k": component.get_editor_property("temperature"),
            "cast_shadows": component.get_editor_property("cast_shadows"),
            "mobility": str(component.get_editor_property("mobility")),
        })
    return results


def main():
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    current_map = world.get_path_name().split(".", 1)[0] if world else None
    if current_map != TARGET_MAP:
        raise RuntimeError("Expected target map %s, got %s" % (TARGET_MAP, current_map))
    report = {
        "map": current_map,
        "source_references": ["references/overview0.jpg", "references/first-bonfire0.jpg"],
        "assumptions": ["Qualitative palette and lighting reconstruction, not measured original light settings."],
        "materials": {}, "map_saved_by_this_script": False,
    }
    if unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world():
        raise RuntimeError("Stop PIE before setting up environment")
    materials(report["materials"])
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    existing = list(subsystem.get_all_level_actors())
    report["environment"] = environment(subsystem, existing)
    report["lights"] = local_lights(subsystem, existing)
    player_start = ensure_actor(subsystem, existing, unreal.PlayerStart,
        "HWL_Environment_PlayerStart", (-8500, -9000, 6120),
        unreal.Rotator(pitch=0.0, yaw=0.0, roll=0.0))
    report["player_start"] = {"path": player_start.get_path_name(), "location": [-8500, -9000, 6120], "yaw": 0}

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("HWL atmosphere V2 ready: 13 materials, 11 native lights and PlayerStart, thin fog. Level not saved.")
    print("REPORT " + str(REPORT))


if __name__ == "__main__":
    main()
