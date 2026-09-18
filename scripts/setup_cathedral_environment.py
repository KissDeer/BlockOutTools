"""Set up owned Cathedral of the Deep whitebox materials and editor actors.

Run inside Unreal Editor with the target level already open. The script saves
only its five material instances; saving the level remains the caller's job.
"""

import unreal


TARGET_MAP = "/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT"
SOURCE_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/Materials"
OUTPUT_MATERIALS = "/Game/MyGame/Map/HighWallofLothric/CathedralWhitebox/Materials"
OWNER_TAG = "COTD_Whitebox"
ENVIRONMENT_FOLDER = "COTD/00_Environment"

# Display-space RGB swatches, converted to linear for the material parameter.
PALETTE = {
    "Floor": (0.72, 0.70, 0.65),
    "Stone": (0.82, 0.81, 0.77),
    "StoneDark": (0.48, 0.49, 0.48),
    "StoneWarm": (0.70, 0.58, 0.36),
    "Roof": (0.48, 0.56, 0.61),
}


def linear_color(rgb):
    channels = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return unreal.LinearColor(channels[0], channels[1], channels[2], 1.0)


def ensure_actor(subsystem, existing, actor_class, suffix, location, rotation):
    label = "COTD_Environment_" + suffix
    matches = [actor for actor in existing if actor.get_actor_label() == label]
    if len(matches) > 1:
        raise RuntimeError("Duplicate environment actor label: " + label)
    actor = matches[0] if matches else None
    if actor is not None:
        if OWNER_TAG not in [str(tag) for tag in actor.tags]:
            raise RuntimeError("Refusing to modify an unowned actor: " + label)
        if not isinstance(actor, actor_class):
            raise RuntimeError("Unexpected class for owned actor: " + label)
    else:
        actor = subsystem.spawn_actor_from_class(actor_class, location, rotation)
        if actor is None:
            raise RuntimeError("Could not spawn environment actor: " + label)
        actor.set_actor_label(label)
        actor.set_editor_property("tags", [unreal.Name(OWNER_TAG)])
    actor.set_actor_location(location, False, True)
    actor.set_actor_rotation(rotation, True)
    actor.set_folder_path(unreal.Name(ENVIRONMENT_FOLDER))
    return actor


def create_materials():
    source_assets = {}
    for name in PALETTE:
        source = unreal.EditorAssetLibrary.load_asset(SOURCE_MATERIALS + "/M_LOTH_" + name)
        if not isinstance(source, unreal.MaterialInstanceConstant):
            raise RuntimeError("Missing source material instance: M_LOTH_" + name)
        source_assets[name] = source

    unreal.EditorAssetLibrary.make_directory(OUTPUT_MATERIALS)
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    for name, color in PALETTE.items():
        asset_name = "MI_COTD_" + name
        asset_path = OUTPUT_MATERIALS + "/" + asset_name
        existed = unreal.EditorAssetLibrary.does_asset_exist(asset_path)
        if existed:
            material = unreal.EditorAssetLibrary.load_asset(asset_path)
        else:
            material = asset_tools.create_asset(
                asset_name, OUTPUT_MATERIALS, unreal.MaterialInstanceConstant,
                unreal.MaterialInstanceConstantFactoryNew(),
            )
        if not isinstance(material, unreal.MaterialInstanceConstant):
            raise RuntimeError("Unexpected or missing material asset: " + asset_path)
        unreal.MaterialEditingLibrary.set_material_instance_parent(material, source_assets[name])
        expected = linear_color(color)
        unreal.MaterialEditingLibrary.set_material_instance_vector_parameter_value(
            material, "Base Color", expected,
        )
        unreal.MaterialEditingLibrary.update_material_instance(material)
        actual = unreal.MaterialEditingLibrary.get_material_instance_vector_parameter_value(
            material, "Base Color",
        )
        if any(abs(getattr(actual, channel) - getattr(expected, channel)) > 1e-4 for channel in "rgba"):
            raise RuntimeError("Base Color readback mismatch on " + asset_path)
        if not unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False):
            raise RuntimeError("Could not save owned material: " + asset_path)
        print(("MODIFIED " if existed else "CREATED ") + asset_path)


def main():
    world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
    current_map = world.get_path_name().split(".", 1)[0] if world else None
    if current_map != TARGET_MAP:
        raise RuntimeError("Expected target map %s, got %s" % (TARGET_MAP, current_map))

    create_materials()
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    existing = subsystem.get_all_level_actors()
    zero_rotation = unreal.Rotator(pitch=0.0, yaw=0.0, roll=0.0)

    sun = ensure_actor(
        subsystem, existing, unreal.DirectionalLight, "Sun",
        unreal.Vector(0.0, 0.0, 15000.0),
        unreal.Rotator(pitch=-38.0, yaw=-35.0, roll=0.0),
    )
    sunlight = sun.get_component_by_class(unreal.DirectionalLightComponent)
    sunlight.set_mobility(unreal.ComponentMobility.MOVABLE)
    sunlight.set_intensity(80000.0)
    sunlight.set_editor_property("atmosphere_sun_light", True)
    sunlight.set_editor_property("light_source_angle", 2.0)
    sunlight.set_editor_property("cast_shadows", True)

    sky = ensure_actor(
        subsystem, existing, unreal.SkyLight, "SkyLight",
        unreal.Vector(0.0, 0.0, 12000.0), zero_rotation,
    )
    sky_component = sky.get_component_by_class(unreal.SkyLightComponent)
    sky_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    sky_component.set_editor_property("real_time_capture", True)
    sky_component.set_intensity(1.0)

    ensure_actor(
        subsystem, existing, unreal.SkyAtmosphere, "Atmosphere",
        unreal.Vector(0.0, 0.0, 0.0), zero_rotation,
    )

    exposure = ensure_actor(
        subsystem, existing, unreal.PostProcessVolume, "Exposure",
        unreal.Vector(0.0, 0.0, 0.0), zero_rotation,
    )
    exposure.set_editor_property("unbound", True)
    settings = exposure.get_editor_property("settings")
    settings.set_editor_property("override_auto_exposure_min_brightness", True)
    settings.set_editor_property("override_auto_exposure_max_brightness", True)
    settings.set_editor_property("override_auto_exposure_bias", True)
    # Project extended luminance range was verified enabled (EV100).
    settings.set_editor_property("auto_exposure_min_brightness", 13.0)
    settings.set_editor_property("auto_exposure_max_brightness", 13.0)
    settings.set_editor_property("auto_exposure_bias", 0.0)
    exposure.set_editor_property("settings", settings)

    ensure_actor(
        subsystem, existing, unreal.PlayerStart, "PlayerStart",
        unreal.Vector(0.0, -7000.0, 120.0),
        unreal.Rotator(pitch=0.0, yaw=90.0, roll=0.0),
    )
    print("COTD environment ready: 5 material instances saved; 5 actors created/updated; level not saved.")


if __name__ == "__main__":
    main()
