"""Finite PIE stair ascent checks with explicit setup teleports between flights."""


def _cotd_start_stair_playtest():
    # Keep callback dependencies local: other scripts may execute in shared globals.
    import builtins
    import json
    import math
    from pathlib import Path
    import time

    import unreal

    output_dir = Path(r"D:/GameDesgin/BlockOutTools/output/cathedral-of-the-deep")
    output_file = output_dir / "pie-stairs.json"
    state_key = "_cotd_pie_stairs_smoke_test"
    previous = getattr(builtins, state_key, None)
    if previous and not previous.get("finished", False):
        raise RuntimeError("A Cathedral stair playtest is already active.")
    state = {"handle": None, "finished": False, "started": time.monotonic(), "index": -1}
    setattr(builtins, state_key, state)
    report = {
        "test": "live_character_four_stair_ascents",
        "coverage": "Four independent low-to-high stair flights; not a continuous level playthrough.",
        "setup": "One runtime-only teleport to the supported lower landing before each flight; all ascent uses movement input.",
        "status": "starting", "success": False, "flights": [],
        "per_flight_timeout_seconds": 25.0, "overall_timeout_seconds": 99.0,
    }
    state["report"] = report

    def valid(obj):
        return obj is not None and getattr(unreal, "is_valid", unreal.SystemLibrary.is_valid)(obj)

    def coordinates(vector):
        return [float(vector.x), float(vector.y), float(vector.z)]

    def write_report():
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    def finish(success, reason):
        if state["finished"]:
            return
        state["finished"] = True
        if state["handle"] is not None:
            try:
                unreal.unregister_slate_post_tick_callback(state["handle"])
            except Exception as exc:
                report["callback_cleanup_error"] = repr(exc)
            finally:
                state["handle"] = None
        report.update({"status": "passed" if success else "failed", "success": bool(success),
                       "reason": reason, "elapsed_seconds": round(time.monotonic() - state["started"], 3)})
        write_report()
        print("COTD PIE STAIRS %s: %s; report=%s" % (report["status"].upper(), reason, output_file))

    state["finish"] = finish
    try:
        stairs = json.loads((output_dir / "plan.json").read_text(encoding="utf-8"))["stairs"]
        if len(stairs) != 4:
            raise RuntimeError("Expected exactly four planned stair flights.")
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
        if not valid(world) or "L_HighWallofLothric_Test_GPT" not in world.get_path_name():
            raise RuntimeError("The target level must already be running in PIE.")
        pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
        if not valid(pawn) or not isinstance(pawn, unreal.Character):
            raise RuntimeError("Player 0 must already possess a Character.")
        movement = pawn.get_component_by_class(unreal.CharacterMovementComponent)
        capsule = pawn.get_component_by_class(unreal.CapsuleComponent)
        if not valid(movement) or not valid(capsule):
            raise RuntimeError("Character movement and capsule components are required.")
        half_height = float(capsule.get_scaled_capsule_half_height())
        report.update({"world": world.get_path_name(), "pawn_class": pawn.get_class().get_path_name(),
                       "capsule_radius_cm": float(capsule.get_scaled_capsule_radius()),
                       "capsule_half_height_cm": half_height,
                       "max_step_height_cm": float(movement.get_editor_property("max_step_height"))})

        def begin_next_flight():
            state["index"] += 1
            if state["index"] >= len(stairs):
                finish(all(flight["success"] for flight in report["flights"]), "All four independent stair trials completed.")
                return
            stair = stairs[state["index"]]
            start, end = stair["start"], stair["end"]
            dx, dy = end[0] - start[0], end[1] - start[1]
            run = math.hypot(dx, dy)
            if run <= 0.0 or end[2] <= start[2]:
                raise RuntimeError("Invalid low-to-high flight: " + stair["name"])
            direction = [dx / run, dy / run]
            setup = [start[0] - direction[0] * 80.0, start[1] - direction[1] * 80.0, start[2] + half_height + 5.0]
            movement.stop_movement_immediately()
            if not pawn.set_actor_location(unreal.Vector(*setup), False, True):
                raise RuntimeError("Setup teleport failed: " + stair["name"])
            actual = coordinates(pawn.get_actor_location())
            trial = {"name": stair["name"], "status": "running", "success": False,
                     "planned_start": start, "planned_end": end, "horizontal_run_cm": run,
                     "setup_teleport": {"requested": setup, "actual": actual},
                     "teleports_during_ascent": 0, "before": actual,
                     "min_z_cm": actual[2], "max_z_cm": actual[2], "max_speed_cm_s": 0.0,
                     "samples": []}
            report["flights"].append(trial)
            state.update({"trial": trial, "flight_started": time.monotonic(), "direction": direction,
                          "start": start, "end": end, "run": run})
            write_report()
            print("COTD PIE STAIRS FLIGHT STARTED: " + stair["name"])

        def end_flight(success, reason):
            movement.stop_movement_immediately()
            state["trial"].update({"status": "passed" if success else "failed", "success": bool(success),
                                   "reason": reason, "elapsed_seconds": round(time.monotonic() - state["flight_started"], 3)})
            print("COTD PIE STAIRS FLIGHT %s: %s" % (state["trial"]["status"].upper(), state["trial"]["name"]))
            write_report()
            begin_next_flight()

        def tick(delta_seconds):
            try:
                if state["finished"]:
                    return
                if not valid(world) or not valid(pawn) or not valid(movement):
                    finish(False, "PIE world or Character became invalid.")
                    return
                if unreal.GameplayStatics.get_player_pawn(world, 0) != pawn:
                    finish(False, "Player 0 possession changed.")
                    return
                if time.monotonic() - state["started"] >= 99.0:
                    finish(False, "Overall finite 99-second budget expired.")
                    return
                elapsed = time.monotonic() - state["flight_started"]
                trial = state["trial"]
                position = coordinates(pawn.get_actor_location())
                velocity = coordinates(pawn.get_velocity())
                direction = state["direction"]
                projection = (position[0] - state["start"][0]) * direction[0] + (position[1] - state["start"][1]) * direction[1]
                mode = str(movement.get_editor_property("movement_mode"))
                trial.update({"after": position, "after_velocity": velocity, "final_movement_mode": mode,
                              "projection_cm": projection, "top_height_error_cm": position[2] - state["end"][2] - half_height})
                trial["min_z_cm"] = min(trial["min_z_cm"], position[2])
                trial["max_z_cm"] = max(trial["max_z_cm"], position[2])
                trial["max_speed_cm_s"] = max(trial["max_speed_cm_s"], math.sqrt(sum(value * value for value in velocity)))
                if not trial["samples"] or elapsed - trial["samples"][-1]["seconds"] >= 0.2:
                    trial["samples"].append({"seconds": round(elapsed, 3), "position": position, "velocity": velocity, "movement_mode": mode})
                if projection >= state["run"] + 60.0:
                    success = abs(trial["top_height_error_cm"]) <= 40.0 and "WALKING" in mode.upper()
                    end_flight(success, "Reached upper landing through movement input." if success else "Reached endpoint without grounded upper-landing evidence.")
                    return
                if position[2] < state["start"][2] + half_height - 150.0:
                    end_flight(False, "Fell below the lower landing.")
                    return
                if elapsed >= 25.0:
                    end_flight(False, "25-second flight timeout before the upper landing.")
                    return
                if elapsed >= 0.15:
                    pawn.add_movement_input(unreal.Vector(direction[0], direction[1], 0.0), 1.0, False)
            except Exception as exc:
                finish(False, "Tick exception: " + repr(exc))

        state.update({"callback": tick, "world": world, "pawn": pawn})
        begin_next_flight()
        if not state["finished"]:
            state["handle"] = unreal.register_slate_post_tick_callback(tick)
            report["status"] = "running"
            write_report()
            print("COTD PIE STAIRS STARTED; finite nonblocking callback; report=" + str(output_file))
    except Exception as exc:
        finish(False, "Setup exception: " + repr(exc))


if __name__ == "__main__":
    _cotd_start_stair_playtest()
