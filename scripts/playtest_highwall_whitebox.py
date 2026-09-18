"""Finite PIE walk plus four representative stair ascents, no persistent logic.

Run after starting PIE in GPT2. Initial walking starts at the actual PlayerStart;
each stair trial uses one explicitly reported setup teleport, then movement only.
The callback unregisters itself after completion, invalidation or a timeout.
"""


def start_highwall_playtest():
    import builtins
    import json
    import math
    from pathlib import Path
    import time

    import unreal

    root = Path('D:/GameDesgin/BlockOutTools/output/high-wall-of-lothric')
    output = root / 'pie-playtest.json'
    state_key = '_hwl_pie_walk_stairs_test'
    previous = getattr(builtins, state_key, None)
    if previous and not previous.get('finished', False):
        raise RuntimeError('A High Wall playtest is already active.')
    state = dict(handle=None, finished=False, started=time.monotonic(), index=-1)
    setattr(builtins, state_key, state)
    report = dict(status='starting', success=False,
                  coverage='One spawn walk and four independent stair ascents; not continuous level traversal.',
                  setup='No teleport for initial walk. One runtime-only setup teleport before each stair trial.',
                  overall_timeout_seconds=330.0, trials=[])
    state['report'] = report

    def valid(obj):
        return obj is not None and getattr(unreal, 'is_valid', unreal.SystemLibrary.is_valid)(obj)

    def xyz(v):
        return [float(v.x), float(v.y), float(v.z)]

    def save():
        root.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

    def finish(success, reason):
        if state['finished']:
            return
        state['finished'] = True
        if state['handle'] is not None:
            try:
                unreal.unregister_slate_post_tick_callback(state['handle'])
            except Exception as exc:
                report['callback_cleanup_error'] = repr(exc)
            state['handle'] = None
        movement = state.get('movement')
        if valid(movement):
            movement.stop_movement_immediately()
        report.update(status='passed' if success else 'failed', success=bool(success), reason=reason,
                      elapsed_seconds=round(time.monotonic() - state['started'], 3))
        save()
        print('HWL PIE %s: %s; %s' % (report['status'].upper(), reason, output))

    state['finish'] = finish
    try:
        plan = json.loads((root / 'plan.json').read_text(encoding='utf-8'))
        if plan['target_level'] != '/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2':
            raise RuntimeError('Wrong map in manifest.')
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_game_world()
        if not valid(world) or 'L_HighWallofLothric_Test_GPT2' not in world.get_path_name():
            raise RuntimeError('GPT2 must already be running in PIE.')
        pawn = unreal.GameplayStatics.get_player_pawn(world, 0)
        if not valid(pawn) or not isinstance(pawn, unreal.Character):
            raise RuntimeError('Player 0 must possess a Character.')
        movement = pawn.get_component_by_class(unreal.CharacterMovementComponent)
        capsule = pawn.get_component_by_class(unreal.CapsuleComponent)
        if not valid(movement) or not valid(capsule):
            raise RuntimeError('CharacterMovement and Capsule components required.')
        state.update(world=world, pawn=pawn, movement=movement)
        half_height = float(capsule.get_scaled_capsule_half_height())
        report.update(world=world.get_path_name(), pawn_class=pawn.get_class().get_path_name(),
                      capsule_radius_cm=float(capsule.get_scaled_capsule_radius()),
                      capsule_half_height_cm=half_height,
                      max_step_height_cm=float(movement.get_editor_property('max_step_height')))

        stairs = plan.get('stairs', [])
        if len(stairs) < 4:
            raise RuntimeError('At least four planned stair flights required.')
        # Require the four agreed categories; missing metadata must not silently
        # replace coverage with four similar flights.
        selected = []
        for category in ('large_height', 'narrow_wall', 'tower_descent_proxy', 'boss_approach'):
            matches = [s for s in stairs if s.get('test_category') == category and s not in selected]
            if len(matches) != 1:
                raise RuntimeError('Expected one stair trial for category: ' + category)
            selected.append(matches[0])
        origin = plan.get('origin', [0, 0, 0])
        trials = [dict(name='PlayerStart +X walk', kind='spawn_walk', start=[-8500, -9000, 6000],
                       end=[-7700, -9000, 6000], timeout=12.0)]
        for stair in selected:
            start = [stair['start'][i] + origin[i] for i in range(3)]
            end = [stair['end'][i] + origin[i] for i in range(3)]
            if start[2] > end[2]:
                start, end = end, start
            if end[2] <= start[2] or math.dist(start[:2], end[:2]) <= 0:
                raise RuntimeError('Invalid stair flight: ' + stair['name'])
            trials.append(dict(name=stair['name'], kind='stair_ascent', start=start, end=end,
                               category=stair.get('test_category'), timeout=75.0))

        def next_trial():
            state['index'] += 1
            if state['index'] >= len(trials):
                finish(all(t['success'] for t in report['trials']), 'All five independent trials completed.')
                return
            spec = trials[state['index']]
            start, end = spec['start'], spec['end']
            dx, dy = end[0] - start[0], end[1] - start[1]
            run = math.hypot(dx, dy)
            direction = [dx / run, dy / run]
            movement.stop_movement_immediately()
            setup = None
            if spec['kind'] == 'stair_ascent':
                location = [start[0] - direction[0] * 80.0, start[1] - direction[1] * 80.0,
                            start[2] + half_height + 5.0]
                if not pawn.set_actor_location(unreal.Vector(*location), False, True):
                    raise RuntimeError('Setup teleport failed: ' + spec['name'])
                setup = dict(requested=location, actual=xyz(pawn.get_actor_location()))
            before = xyz(pawn.get_actor_location())
            if spec['kind'] == 'spawn_walk' and (math.dist(before[:2], start[:2]) > 150.0 or
                                                 abs(before[2] - start[2] - half_height) > 150.0):
                raise RuntimeError('Character did not spawn near (-8500, -9000, 6120); no teleport performed.')
            trial = dict(name=spec['name'], kind=spec['kind'], category=spec.get('category'),
                         status='running', success=False, planned_start=start, planned_end=end,
                         horizontal_run_cm=run, setup_teleport=setup, teleports_during_movement=0,
                         before=before, min_z_cm=before[2], max_z_cm=before[2], max_speed_cm_s=0.0, samples=[])
            report['trials'].append(trial)
            state.update(trial=trial, spec=spec, trial_started=time.monotonic(), direction=direction, run=run)
            save()
            print('HWL PIE TRIAL STARTED: ' + spec['name'])

        def end_trial(success, reason):
            movement.stop_movement_immediately()
            state['trial'].update(status='passed' if success else 'failed', success=bool(success), reason=reason,
                                  elapsed_seconds=round(time.monotonic() - state['trial_started'], 3))
            save()
            print('HWL PIE TRIAL %s: %s' % (state['trial']['status'].upper(), state['trial']['name']))
            next_trial()

        def tick(delta_seconds):
            try:
                if state['finished']:
                    return
                if not valid(world) or not valid(pawn) or not valid(movement):
                    finish(False, 'PIE world or Character became invalid.')
                    return
                if unreal.GameplayStatics.get_player_pawn(world, 0) != pawn:
                    finish(False, 'Possessed pawn changed.')
                    return
                if time.monotonic() - state['started'] >= report['overall_timeout_seconds']:
                    finish(False, 'Finite overall timeout expired.')
                    return
                elapsed = time.monotonic() - state['trial_started']
                spec, trial = state['spec'], state['trial']
                start, end = spec['start'], spec['end']
                position, velocity = xyz(pawn.get_actor_location()), xyz(pawn.get_velocity())
                direction = state['direction']
                projection = (position[0] - start[0]) * direction[0] + (position[1] - start[1]) * direction[1]
                lateral = abs((position[0] - start[0]) * direction[1] - (position[1] - start[1]) * direction[0])
                mode = str(movement.get_editor_property('movement_mode'))
                trial.update(after=position, after_velocity=velocity, final_movement_mode=mode,
                             projection_cm=projection, lateral_deviation_cm=lateral,
                             landing_height_error_cm=position[2] - end[2] - half_height)
                trial['min_z_cm'] = min(trial['min_z_cm'], position[2])
                trial['max_z_cm'] = max(trial['max_z_cm'], position[2])
                trial['max_speed_cm_s'] = max(trial['max_speed_cm_s'], math.sqrt(sum(v * v for v in velocity)))
                if not trial['samples'] or elapsed - trial['samples'][-1]['seconds'] >= 0.2:
                    trial['samples'].append(dict(seconds=round(elapsed, 3), position=position, velocity=velocity,
                                                movement_mode=mode))
                margin = 60.0 if spec['kind'] == 'stair_ascent' else 0.0
                if projection >= state['run'] + margin:
                    success = abs(trial['landing_height_error_cm']) <= 40.0 and 'WALKING' in mode.upper()
                    end_trial(success, 'Reached grounded landing through movement input.' if success else 'Endpoint reached without grounded landing proof.')
                    return
                if position[2] < start[2] + half_height - 150.0 or lateral > 250.0:
                    end_trial(False, 'Fell below lower landing or left trial corridor.')
                    return
                if elapsed >= spec['timeout']:
                    end_trial(False, 'Finite trial timeout before endpoint.')
                    return
                if elapsed >= 0.15:
                    pawn.add_movement_input(unreal.Vector(direction[0], direction[1], 0.0), 1.0, False)
            except Exception as exc:
                finish(False, 'Tick exception: ' + repr(exc))

        state['callback'] = tick
        next_trial()
        if not state['finished']:
            state['handle'] = unreal.register_slate_post_tick_callback(tick)
            report['status'] = 'running'
            save()
            print('HWL PIE STARTED; finite nonblocking callback; ' + str(output))
    except Exception as exc:
        finish(False, 'Setup exception: ' + repr(exc))


if __name__ == '__main__':
    start_highwall_playtest()
