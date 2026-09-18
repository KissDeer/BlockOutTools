"""Reference-led Cathedral material and native-light pass, run inside Unreal.

Idempotently updates only explicitly owned actors/assets in the target map.
No Blueprint, gameplay components, tick logic, map save, or project settings.
The caller owns level saving and screenshot-based lighting acceptance.
"""

import json
from pathlib import Path

import unreal


TARGET_MAP = "/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT"
SOURCE_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/Materials"
OUTPUT_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/CathedralWhitebox/Materials"
REPORT = Path("D:/GameDesgin/BlockOutTools/output/cathedral-of-the-deep/atmosphere-v2.json")
OWNER_TAG = "COTD_Whitebox"

# sRGB display swatches. Texture-free whitebox stone remains deliberately legible.
# The reference shows weathered gray limestone, soot, slate and dusty amber sky.
PALETTE = {
    "Floor": ("Floor", (0.52, 0.51, 0.47)),
    "Stone": ("Stone", (0.59, 0.58, 0.53)),
    "StoneDark": ("StoneDark", (0.31, 0.32, 0.30)),
    "StoneWarm": ("StoneWarm", (0.56, 0.49, 0.37)),
    "Roof": ("Roof", (0.25, 0.28, 0.28)),
    "Trim": ("Stone", (0.67, 0.65, 0.59)),
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
    ("ChapelAltar", (0, -5920, 390), 12000, 1650, 2900),
    ("ChapelDoor", (0, -7900, 510), 9000, 1600, 3300),
    ("NaveWest01", (-2680, 500, 680), 16000, 2300, 3100),
    ("NaveEast01", (2680, 500, 680), 16000, 2300, 3100),
    ("NaveWest02", (-2680, 3450, 680), 16000, 2300, 3100),
    ("NaveEast02", (2680, 3450, 680), 16000, 2300, 3100),
    ("AltarWest", (-950, 7700, 1080), 16000, 2400, 2800),
    ("AltarEast", (950, 7700, 1080), 16000, 2400, 2800),
    ("GalleryWest", (-3300, 3500, 2350), 12000, 1700, 3800),
    ("GalleryEast", (3300, 3500, 2350), 12000, 1700, 3800),
    ("RoseChapel", (-8800, 9400, 3200), 15000, 2000, 3000),
    ("VaultFill", (0, 4300, 4200), 16000, 3200, 6800),
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
        actor.set_editor_property("tags", [unreal.Name(OWNER_TAG), unreal.Name("COTD_AtmosphereV2")])
        existing.append(actor)
    actor.set_actor_location(unreal.Vector(*location), False, True)
    actor.set_actor_rotation(rotation, True)
    actor.set_actor_tick_enabled(False)
    actor.set_folder_path(unreal.Name("COTD/00_Environment"))
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
        name = "MI_COTD_" + role
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
    sun = ensure_actor(subsystem, existing, unreal.DirectionalLight, "COTD_Environment_Sun",
                       (0, 0, 15000), unreal.Rotator(pitch=-12.0, yaw=-45.0, roll=0.0))
    component = sun.get_component_by_class(unreal.DirectionalLightComponent)
    component.set_mobility(unreal.ComponentMobility.MOVABLE)
    component.set_intensity(12000.0)
    component.set_editor_property("atmosphere_sun_light", True)
    component.set_editor_property("light_source_angle", 3.5)
    component.set_editor_property("cast_shadows", True)
    component.set_editor_property("use_temperature", True)
    component.set_editor_property("temperature", 5400.0)

    sky = ensure_actor(subsystem, existing, unreal.SkyLight, "COTD_Environment_SkyLight", (0, 0, 12000))
    component = sky.get_component_by_class(unreal.SkyLightComponent)
    component.set_mobility(unreal.ComponentMobility.MOVABLE)
    component.set_editor_property("real_time_capture", True)
    component.set_intensity(1.0)

    atmosphere = ensure_actor(subsystem, existing, unreal.SkyAtmosphere, "COTD_Environment_Atmosphere", (0, 0, 0))
    component = atmosphere.get_component_by_class(unreal.SkyAtmosphereComponent)
    component.set_editor_property("mie_scattering_scale", 0.012)
    component.set_editor_property("mie_anisotropy", 0.7)
    # UE's coefficient default is 0.0331, not a unit multiplier of 1.
    component.set_editor_property("rayleigh_scattering_scale", 0.0331 * 0.65)
    component.set_editor_property("sky_luminance_factor", unreal.LinearColor(r=1.0, g=0.83, b=0.67, a=1.0))

    fog = ensure_actor(subsystem, existing, unreal.ExponentialHeightFog, "COTD_Atmosphere_Fog", (0, 0, -350))
    component = fog.get_component_by_class(unreal.ExponentialHeightFogComponent)
    component.set_editor_property("fog_density", 0.005)
    component.set_editor_property("fog_height_falloff", 0.15)
    component.set_editor_property("start_distance", 1500.0)
    component.set_editor_property("fog_max_opacity", 0.45)
    component.set_editor_property("enable_volumetric_fog", False)
    component.set_editor_property("fog_inscattering_luminance", unreal.LinearColor(r=120.0, g=102.0, b=80.0, a=1.0))

    exposure = ensure_actor(subsystem, existing, unreal.PostProcessVolume, "COTD_Environment_Exposure", (0, 0, 0))
    exposure.set_editor_property("unbound", True)
    settings = exposure.get_editor_property("settings")
    for property_name in ("auto_exposure_min_brightness", "auto_exposure_max_brightness", "auto_exposure_bias"):
        settings.set_editor_property("override_" + property_name, True)
    # Let the eye adapt inside the enclosed nave while retaining the exterior cap.
    settings.set_editor_property("auto_exposure_min_brightness", 7.0)
    settings.set_editor_property("auto_exposure_max_brightness", 10.5)
    settings.set_editor_property("auto_exposure_bias", 0.0)
    settings.set_editor_property("override_vignette_intensity", True)
    settings.set_editor_property("vignette_intensity", 0.18)
    exposure.set_editor_property("settings", settings)
    return {
        "sun_lux": sun.get_component_by_class(unreal.DirectionalLightComponent).get_editor_property("intensity"),
        "sun_pitch": sun.get_actor_rotation().pitch,
        "sun_yaw": sun.get_actor_rotation().yaw,
        "sky_intensity": sky.get_component_by_class(unreal.SkyLightComponent).get_editor_property("intensity"),
        "fog_density": fog.get_component_by_class(unreal.ExponentialHeightFogComponent).get_editor_property("fog_density"),
        "min_ev100": exposure.get_editor_property("settings").get_editor_property("auto_exposure_min_brightness"),
        "max_ev100": exposure.get_editor_property("settings").get_editor_property("auto_exposure_max_brightness"),
        "exposure_bias": exposure.get_editor_property("settings").get_editor_property("auto_exposure_bias"),
        "exposure_adaptation": "Bounded automatic adaptation brightens the enclosed interior while capping exterior EV100 at 10.5.",
        "volumetric_fog": False,
    }


def local_lights(subsystem, existing):
    results = []
    for suffix, location, lumens, radius, temperature in LIGHTS:
        label = "COTD_Atmosphere_Light_" + suffix
        actor = ensure_actor(subsystem, existing, unreal.PointLight, label, location)
        component = actor.get_component_by_class(unreal.PointLightComponent)
        component.set_mobility(unreal.ComponentMobility.STATIONARY)
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
        "source_references": ["references/wikidot-exterior.jpg", "references/cleansing-chapel.jpg",
                              "references/deacons-hall.jpg", "references/rosaria.jpg"],
        "assumptions": ["Qualitative palette and lighting reconstruction, not measured original light settings."],
        "materials": {}, "map_saved_by_this_script": False,
    }
    materials(report["materials"])
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    existing = list(subsystem.get_all_level_actors())
    report["environment"] = environment(subsystem, existing)
    report["lights"] = local_lights(subsystem, existing)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("COTD atmosphere V2 ready: 13 materials, 12 native lights, thin fog. Level not saved.")
    print("REPORT " + str(REPORT))


if __name__ == "__main__":
    main()
