#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《沉没圣所》批量布景参考脚本（UE Python / unreal 模块）
====================================================================
读取 scripts/export-ue-actors.mjs 导出的 Actor 计划 JSON，在 UE 里批量生成
Blockout Tools 白盒 Actor，并写入稳定身份标签。

【重要 · 必读】
- 本脚本是【参考模板】，作者环境没有 Unreal Editor，无法在本机验证。
- 依赖：(1) 目标工程已启用 Blockout Tools 插件；(2) 已启用 UE Python (Editor Scripting Utilities / Python Editor Script Plugin)。
- 不同 UE 版本/插件版本的 API 与属性名可能不同，尤其是：
    * 蓝图资源路径（blueprintClassPath）
    * 实例属性名（BoxSize / DoorwaySize / StairsSize / NumberOfSteps / StairsType / blockout_material_color...）
    * Actor 标签写入方式
  请按你所用 UE + Blockout Tools 版本核对后运行。
- 本脚本不保存地图（以避免意外覆盖）；生成后请人工确认再保存。

用法（在 UE 的 Python 控制台或脚本执行器里跑）：
    import json, pathlib
    actors_file = r"<仓库路径>/layouts/ue-plan/sunken-sanctum-spine.blockout.actors.json"
    exec(open(r"<仓库路径>/scripts/ue_unreal_spawn.py", encoding="utf-8").read(), {"ACTORS_FILE": actors_file})
"""

import unreal

# 从全局上下文读取（若直接执行，可在这里替换为你的绝对路径）
ACTORS_FILE = globals().get("ACTORS_FILE", "layouts/ue-plan/sunken-sanctum-spine.blockout.actors.json")

SCHEMA_VERSION = 2
# 稳定身份标签前缀（与 app 内 DATA_UE_AI_CONTRACT 建议一致）
def tags_for(project_id: str, instance_id: str, block_id: str):
    return [
        f"BlockOutProject:{project_id}",
        f"BlockOutInstance:{instance_id}",
        f"BlockOutElement:{block_id}",
        f"BlockOutSchema:{SCHEMA_VERSION}",
    ]

def to_unreal_vector(v):
    return unreal.Vector(float(v[0]), float(v[1]), float(v[2]))

def to_unreal_rotator(rot):
    # rotation 已是 UE yaw 换算后：([pitch=0, roll=0, yaw])
    return unreal.Rotator(float(rot[0]), float(rot[2]), float(rot[1]))

def load_blueprint_class(asset_path: str):
    # 参考：加载蓝图生成类；若路径带 _C 则用 load_class(None, path)
    if asset_path.endswith("_C"):
        return unreal.load_class(None, asset_path)
    return unreal.load_object(None, asset_path)

def set_parameter(actor, key, value, type_hint):
    """尽力写的属性设置；如有色板/命名差异，请按实际 BP 调整并添加映射。"""
    try:
        if key == "StairsType":
            actor.set_editor_property("stairs_type", value)
        elif key in ("BoxSize", "DoorwaySize", "StairsSize"):
            actor.set_editor_property(key.lower(), to_unreal_vector(value))
        elif key in ("NumberOfSteps",):
            actor.set_editor_property("number_of_steps", int(value))
        elif key in ("TopThickness", "SideThickness"):
            actor.set_editor_property(key.lower(), float(value))
        elif key in ("blockout_material_color", "blockout_material_top_color"):
            # 材质颜色可能在实例的材质参数上，这里仅作占位提示
            print(f"    [提示] {key} 需在材质参数里设置，未自动写入")
        else:
            actor.set_editor_property(key, value)
    except Exception as exc:  # noqa: BLE001
        print(f"    [跳过] 参数 {key}={value} 设置失败: {exc}")

def main():
    import json
    with open(ACTORS_FILE, "r", encoding="utf-8") as fh:
        plan = json.load(fh)

    project_id = plan.get("projectId", "project_unknown")
    actors = plan.get("actors", [])
    created = 0
    for actor in actors:
        bp = actor.get("blueprintClassPath", "")
        if not bp:
            print(f"[警告] {actor.get('label')} 缺蓝图类路径，跳过")
            continue
        try:
            cls = load_blueprint_class(bp)
            loc = to_unreal_vector(actor["location"])
            rot = to_unreal_rotator(actor["rotation"])
            spawned = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, loc, rot)
            if spawned is None:
                print(f"[警告] 生成失败: {actor.get('label')}")
                continue
            for key, value in (actor.get("parameters") or {}).items():
                set_parameter(spawned, key, value, None)
            # 写入稳定身份标签
            try:
                key = actor.get("syncKey", "")
                pid, iid, bid = key.split("/", 2)
                for tag in tags_for(pid, iid, bid):
                    spawned.tags.append(unreal.Name(tag))
            except Exception as exc:  # noqa: BLE001
                print(f"    [提示] 标签写入失败: {exc}")
            created += 1
            print(f"[OK] {actor.get('label')} @ {actor['location']} tags={actor.get('syncKey')}")
        except Exception as exc:  # noqa: BLE001
            print(f"[失败] {actor.get('label')}: {exc}")

    print(f"\n完成：创建 {created}/{len(actors)} actors；assembly issues: {len(plan.get('assemblyIssues', []))}")
    for issue in plan.get("assemblyIssues", []):
        print(f"  · 需人工核对：{issue['connectionId']} posErr={issue['positionError']:.1f}")

if __name__ == "__main__":
    main()
