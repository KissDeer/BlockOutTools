"""Nonblocking PIE Character movement smoke test; this is not a full playthrough."""

import builtins
import json
from pathlib import Path
import time

import unreal


OUTPUT = Path(r"D:/GameDesgin/BlockOutTools/output/cathedral-of-the-deep/pie-movement.json")
STATE_KEY = "_cotd_pie_movement_smoke_test"
TARGET_MAP_NAME = "L_HighWallofLothric_Test_GPT"


def xyz(vector):
    return {"x": float(vector.x), "y": float(vector.y), "z": float(vector.z)}


def valid(obj):
    check = getattr(unreal, "is_valid", unreal.SystemLibrary.is_valid)
    return obj is not None and check(obj)


def save_report(report):
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    prior = getattr(builtins, STATE_KEY, None)
    if prior and not prior.get("finished", False):
        raise RuntimeError("A Cathedral movement smoke test is already active.")

    state = {"handle": None, "finished": False, "start_time": time.monotonic()}
    setattr(builtins, STATE_KEY, state)
    report = {
        "test": "live_possessed_character_add_movement_input",
        "coverage": "Short +X walking segment across the open chapel only; not a complete playthrough.",
        "status": "starting",
        "success": False,
        "timeout_seconds": 8.0,
        "finish_x_cm": 700.0,
        "minimum_travel_cm": 500.0,
        "maximum_floor_drop_cm": 0.0,
        "maximum_speed_cm_s": 0.0,
        "samples": [],
    }
    state["report"] = report

    def finish(success, reason):
        if state["finished"]:
            return
        state["finished"] = True
        handle = state.get("handle")
        if handle is not None:
            unreal.unregister_slate_post_tick_callback(handle)
            state["handle"] = None
        report.update({
            "status": "passed" if success else "failed",
            "success": bool(success),
            "reason": reason,
            "elapsed_seconds": round(time.monotonic() - state["start_time"], 3),
        })
        save_report(report)
        print("COTD PIE MOVEMENT %s: %s; report=%s" % (report["status"].upper(), reason, OUTPUT))

    state["finish"] = finish
    try:
        editor = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)
        world = editor.get_game_world()
        if not valid(world):
            finish(False, "No active PIE game world.")
            return
        report["world"] = world.get_path_name()
        if TARGET_MAP_NAME not in report["world"]:
            finish(False, "PIE is running a different map.")
            return
        pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
        if not valid(pawn) or not isinstance(pawn, unreal.Character):
            report["pawn_class"] = pawn.get_class().get_path_name() if valid(pawn) else None
            finish(False, "Player 0 must already possess a Character; no pawn was spawned or replaced.")
            return
        movement = pawn.get_component_by_class(unreal.CharacterMovementComponent)
        capsule = pawn.get_component_by_class(unreal.CapsuleComponent)
        if not valid(movement) or not valid(capsule):
            finish(False, "Character movement or capsule component is unavailable.")
            return
        start = xyz(pawn.get_actor_location())
        report.update({
            "before": start,
            "before_velocity": xyz(pawn.get_velocity()),
            "pawn_class": pawn.get_class().get_path_name(),
            "capsule_radius_cm": float(capsule.get_scaled_capsule_radius()),
            "capsule_half_height_cm": float(capsule.get_scaled_capsule_half_height()),
            "initial_movement_mode": str(movement.get_editor_property("movement_mode")),
        })
        if abs(start["x"]) > 150.0 or abs(start["y"] + 7000.0) > 150.0 or not 0.0 <= start["z"] <= 600.0:
            finish(False, "Character did not spawn near the expected PlayerStart (0, -7000, 120); no teleport performed.")
            return

        def tick(delta_seconds):
            try:
                if state["finished"]:
                    return
                elapsed = time.monotonic() - state["start_time"]
                if not valid(world) or not valid(pawn) or not valid(movement):
                    finish(False, "PIE world or tested Character became invalid.")
                    return
                if unreal.GameplayStatics.get_player_pawn(world, 0) != pawn:
                    finish(False, "Player 0 possession changed during the test.")
                    return
                position = xyz(pawn.get_actor_location())
                velocity = xyz(pawn.get_velocity())
                mode = str(movement.get_editor_property("movement_mode"))
                report["after"] = position
                report["after_velocity"] = velocity
                report["final_movement_mode"] = mode
                report["travel_x_cm"] = position["x"] - start["x"]
                report["maximum_floor_drop_cm"] = max(report["maximum_floor_drop_cm"], start["z"] - position["z"])
                speed = sum(component * component for component in velocity.values()) ** 0.5
                report["maximum_speed_cm_s"] = max(report["maximum_speed_cm_s"], speed)
                if not report["samples"] or elapsed - report["samples"][-1]["seconds"] >= 0.1:
                    report["samples"].append({"seconds": round(elapsed, 3), "position": position, "velocity": velocity, "movement_mode": mode})
                if report["maximum_floor_drop_cm"] > 150.0:
                    finish(False, "Character dropped more than 150 cm below its spawn height.")
                    return
                if abs(position["y"] + 7000.0) > 250.0:
                    finish(False, "Character left the intended open chapel test corridor.")
                    return
                if position["x"] >= 700.0:
                    walking = "WALKING" in mode.upper()
                    success = report["travel_x_cm"] >= 500.0 and walking
                    finish(success, "Reached +X endpoint on foot." if success else "Endpoint reached without sufficient walking evidence.")
                    return
                if elapsed >= 8.0:
                    finish(False, "Timed out before reaching the +X endpoint.")
                    return
                if elapsed >= 0.1:
                    pawn.add_movement_input(unreal.Vector(1.0, 0.0, 0.0), 1.0, False)
            except Exception as exc:
                finish(False, "Tick exception: " + repr(exc))

        state["callback"] = tick
        state["world"] = world
        state["pawn"] = pawn
        state["start_time"] = time.monotonic()
        state["handle"] = unreal.register_slate_post_tick_callback(tick)
        report["status"] = "running"
        save_report(report)
        print("COTD PIE MOVEMENT STARTED; finite nonblocking callback; report=" + str(OUTPUT))
    except Exception as exc:
        finish(False, "Setup exception: " + repr(exc))


if __name__ == "__main__":
    main()
