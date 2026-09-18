"""Read-only editor collision audit; execute this file inside Unreal Python.

This checks authored geometry and sampled route clearance. It does not establish
CharacterMovement traversal, progression, combat, or packaged-build correctness.
"""
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import unreal


ROOT = Path('D:/GameDesgin/BlockOutTools/output/high-wall-of-lothric')
TARGET = '/Game/MyGame/Map/HighWallofLothric/L_HighWallofLothric_Test_GPT2'
SAMPLE_SPACING = 50.0
FLOOR_TOLERANCE = 18.5
CAPSULE_RADIUS = 34.0
CAPSULE_HALF_HEIGHT = 100.0
STEP_HEIGHT_ALLOWANCE = 45.0
CAPSULE_CENTER_OFFSET = CAPSULE_HALF_HEIGHT + STEP_HEIGHT_ALLOWANCE + 2.0
MAX_ERRORS = 400


def package_path(obj):
    return obj.get_path_name().split(':')[0].split('.')[0]


def xyz(value):
    return [round(float(value.x), 3), round(float(value.y), 3), round(float(value.z), 3)]


def describe_hit(hit):
    """HitResult uses Unreal's native BreakHitResult tuple, not repr parsing."""
    if hit is None:
        return None
    values = hit.to_tuple()
    if len(values) < 11 or not isinstance(values[0], bool):
        raise RuntimeError('Unexpected HitResult tuple layout: ' + str([type(v).__name__ for v in values]))
    impact, normal, actor = values[5], values[7], values[9]
    if not isinstance(impact, unreal.Vector) or not isinstance(normal, unreal.Vector):
        raise RuntimeError('HitResult impact/normal fields do not match the native break layout')
    if actor is not None and not isinstance(actor, unreal.Actor):
        raise RuntimeError('HitResult hit_actor does not match the native break layout')
    return dict(blocking=bool(values[0]), initial_overlap=bool(values[1]),
                impact=xyz(impact), normal=xyz(normal),
                actor=actor.get_actor_label() if actor else None)


def route_samples(points, origin):
    samples = []
    for index, (first, last) in enumerate(zip(points, points[1:])):
        run = math.dist(first[:2], last[:2])
        count = max(1, math.ceil(run / SAMPLE_SPACING))
        for step in range(0 if index == 0 else 1, count + 1):
            fraction = step / count
            samples.append([first[axis] + (last[axis] - first[axis]) * fraction + origin[axis]
                            for axis in range(3)])
    return samples


def validate():
    plan = json.loads((ROOT / 'plan.json').read_text(encoding='utf-8'))
    report = dict(timestamp_utc=datetime.now(timezone.utc).isoformat(),
                  target_level=TARGET, status='running', checks=0, passed=0, failed=0,
                  evidence=('Editor static geometry and collision queries only; not PIE or gameplay traversal proof. '
                            'Capsule clearance is measured above the actual sampled floor with a 45 cm step-height '
                            'allowance plus 2 cm margin; this is not a ground-following CharacterMovement simulation.'),
                  parameters=dict(sample_spacing_cm=SAMPLE_SPACING, floor_tolerance_cm=FLOOR_TOLERANCE,
                                  capsule_radius_cm=CAPSULE_RADIUS, capsule_half_height_cm=CAPSULE_HALF_HEIGHT,
                                  pawn_measurement_source='BP_Miya measured in PIE: capsule radius 30 cm, half-height 100 cm, max step height 45 cm; audit radius increased to 34 cm conservatively.',
                                  step_height_allowance_cm=STEP_HEIGHT_ALLOWANCE,
                                  capsule_center_above_measured_floor_cm=CAPSULE_CENTER_OFFSET),
                  errors=[], routes=[])

    def check(condition, category, **detail):
        report['checks'] += 1
        report['passed' if condition else 'failed'] += 1
        if not condition and len(report['errors']) < MAX_ERRORS:
            report['errors'].append(dict(category=category, **detail))
        return condition

    try:
        level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).get_current_level()
        world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
        if not check(package_path(level) == TARGET and package_path(world) == TARGET,
                     'target_world', actual_level=package_path(level), actual_world=package_path(world)):
            raise RuntimeError('Refusing to validate a different level')
        if not check(plan.get('target_level') == TARGET, 'manifest_target', actual=plan.get('target_level')):
            raise RuntimeError('Manifest targets a different level')
        all_actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
        actors = [actor for actor in all_actors if actor.get_actor_label().startswith('HWL_')]
        labels = Counter(actor.get_actor_label() for actor in actors)
        expected = Counter(spec['label'] for spec in plan['actors'])
        specs_by_label = {spec['label']: spec for spec in plan['actors']}
        material_usage = Counter()
        report['actors'] = dict(manifest=len(plan['actors']), actual_with_prefix=len(actors),
                                static_meshes=sum(isinstance(a, unreal.StaticMeshActor) for a in actors),
                                manifest_collision_disabled=sum(spec.get('collision', True) is False
                                                                for spec in plan['actors']))
        for label, count in expected.items():
            check(count == 1 and labels[label] == 1, 'manifest_label', actor=label,
                  expected_count=count, actual_count=labels[label])
        for actor in actors:
            label = actor.get_actor_label()
            check(actor.get_level() == level, 'actor_level', actor=label,
                  actual=actor.get_level().get_path_name())
            check('HWL_Whitebox' in [str(tag) for tag in actor.tags], 'actor_ownership', actor=label)
            check(labels[label] == 1, 'duplicate_label', actor=label, count=labels[label])
            if isinstance(actor, unreal.StaticMeshActor):
                check(label in expected, 'unexpected_geometry', actor=label)
                _, bounds = actor.get_actor_bounds(False)
                check(all(math.isfinite(value) and value > 0 for value in xyz(bounds)),
                      'positive_bounds', actor=label, extents=xyz(bounds))
                component = actor.static_mesh_component
                enabled = component.get_collision_enabled()
                spec = specs_by_label.get(label, {})
                requires_collision = spec.get('collision', True) is not False and not spec.get('hidden', False)
                correct_collision = (enabled in [unreal.CollisionEnabled.QUERY_ONLY,
                                                  unreal.CollisionEnabled.QUERY_AND_PHYSICS]
                                     if requires_collision else enabled == unreal.CollisionEnabled.NO_COLLISION)
                check(correct_collision, 'collision_matches_manifest', actor=label, collision=str(enabled),
                      expected='query_enabled' if requires_collision else 'disabled')
                material = component.get_material(0)
                material_path = material.get_path_name() if material else None
                expected_material = '/Game/MyGame/Map/HighWallofLothric/HighWallWhitebox/Materials/MI_HWL_' + spec.get('material', '')
                check(material is not None and material_path.split('.')[0] == expected_material, 'material_assigned', actor=label, material=material_path, expected=expected_material)
                check(component.get_editor_property('mobility') == unreal.ComponentMobility.STATIC, 'geometry_static', actor=label)
                material_usage[material_path or '<unassigned>'] += 1
        report['material_usage'] = dict(sorted(material_usage.items()))
        ignored = [actor for actor in all_actors if isinstance(actor, unreal.TextRenderActor)]
        origin = plan.get('origin', [0, 0, 0])
        for route in plan['routes']:
            before = report['failed']
            samples = route_samples(route['points'], origin)
            previous_floor_z = None
            check(len(samples) >= 2, 'route_has_samples', route=route['name'])
            for index, point in enumerate(samples):
                start = unreal.Vector(point[0], point[1], point[2] + 50)
                end = unreal.Vector(point[0], point[1], point[2] - 60)
                hit = unreal.SystemLibrary.line_trace_single(
                    world, start, end, unreal.TraceTypeQuery.ECC_VISIBILITY, False,
                    ignored, unreal.DrawDebugTrace.NONE, True)
                floor_hit = describe_hit(hit)
                supported = bool(floor_hit and floor_hit['blocking'] and
                                 abs(floor_hit['impact'][2] - point[2]) <= FLOOR_TOLERANCE and
                                 floor_hit['normal'][2] >= 0.7 and floor_hit['actor'] in expected)
                check(supported, 'route_floor_support', route=route['name'], sample=index,
                      expected_floor=[round(v, 3) for v in point], hit=floor_hit)
                floor_z = floor_hit['impact'][2] if supported else point[2]
                if previous_floor_z is None:
                    previous_floor_z = floor_z
                previous = samples[max(0, index - 1)]
                start = unreal.Vector(previous[0], previous[1], previous_floor_z + CAPSULE_CENTER_OFFSET)
                end = unreal.Vector(point[0], point[1], floor_z + CAPSULE_CENTER_OFFSET)
                hit = unreal.SystemLibrary.capsule_trace_single_by_profile(
                    world, start, end, CAPSULE_RADIUS, CAPSULE_HALF_HEIGHT,
                    'Pawn', False, ignored, unreal.DrawDebugTrace.NONE, True)
                clearance_hit = describe_hit(hit)
                check(not clearance_hit or not clearance_hit['blocking'], 'route_capsule_clearance',
                      route=route['name'], sample=index, position=[round(v, 3) for v in point], hit=clearance_hit)
                previous_floor_z = floor_z
            report['routes'].append(dict(name=route['name'], samples=len(samples),
                                         failures=report['failed'] - before,
                                         status='pass' if report['failed'] == before else 'fail'))
        report['status'] = 'pass' if report['failed'] == 0 else 'fail'
    except Exception as error:
        check(False, 'validation_exception', error=str(error))
        report['status'] = 'error'
    report['errors_truncated'] = report['failed'] > len(report['errors'])
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / 'editor-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    unreal.log('HIGHWALL_VALIDATION_RESULT ' + json.dumps({key: report[key] for key in
                                                          ['status', 'checks', 'passed', 'failed']}))
    return report


RESULT = validate()
