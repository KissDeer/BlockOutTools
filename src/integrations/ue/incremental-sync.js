function rounded(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function stableString(value) {
  if (Array.isArray(value)) return `[${value.map(stableString).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function actorType(actor) {
  return `${actor.actorKind ?? "static-mesh"}|${actor.blueprintClassPath ?? actor.assetPath ?? ""}`;
}

function tags(actor) {
  return Array.isArray(actor.tags) ? actor.tags.map(String) : [];
}

function tagValue(actor, prefix) {
  return tags(actor).find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function sourceId(actor) {
  return String(actor.sourceId ?? tagValue(actor, "LayoutToolsId:") ?? "");
}

function syncKey(actor) {
  return String(actor.syncKey ?? tagValue(actor, "LayoutToolsSync:") ?? "");
}

function nameKey(actor) {
  const label = String(actor.label ?? "").trim().toLocaleLowerCase();
  return label ? `${actorType(actor)}|${label}` : "";
}

function geometryKey(actor) {
  const vector = (value, digits) => (value ?? []).map((item) => rounded(item, digits));
  return stableString({
    type: actorType(actor),
    location: vector(actor.location, 1),
    rotation: vector(actor.rotation, 2),
    scale3d: vector(actor.scale3d, 3),
    parameters: actor.parameters ?? null,
    desiredSizeCm: actor.desiredSizeCm ?? null,
  });
}

function actorFingerprint(actor) {
  return stableString({
    type: actorType(actor),
    label: actor.label ?? "",
    folder: actor.folder ?? "",
    location: actor.location?.map((value) => rounded(value)),
    rotation: actor.rotation?.map((value) => rounded(value)),
    scale3d: actor.scale3d?.map((value) => rounded(value)),
    parameters: actor.parameters ?? null,
    desiredSizeCm: actor.desiredSizeCm ?? null,
  });
}

function uniqueIndex(actors, keyFor, conflicts, side, tier, reportDuplicates = true) {
  const groups = new Map();
  for (const actor of actors) {
    const key = keyFor(actor);
    if (!key) continue;
    const values = groups.get(key) ?? [];
    values.push(actor);
    groups.set(key, values);
  }
  const index = new Map();
  for (const [key, values] of groups) {
    if (values.length === 1) index.set(key, values[0]);
    else if (reportDuplicates) conflicts.push({
      code: `duplicate-${tier}-${side}`,
      tier,
      side,
      key,
      actorIds: values.map((actor) => sourceId(actor) || actor.path || actor.label),
      message: `${side === "desired" ? "网页" : "UE"} 中有 ${values.length} 个 Actor 使用同一${tier === "sync" ? "同步标记" : "名称标识"}`,
    });
  }
  return index;
}

export function buildIncrementalImportPlan(basePlan, snapshotValue, options = {}) {
  const desired = Array.isArray(basePlan?.actors) ? basePlan.actors : [];
  const snapshotActors = Array.isArray(snapshotValue) ? snapshotValue : snapshotValue?.actors ?? [];
  const current = snapshotActors.filter((actor) => !basePlan?.actorFolder || actor.folder === basePlan.actorFolder);
  const conflicts = [];
  const desiredSync = uniqueIndex(desired, syncKey, conflicts, "desired", "sync");
  const currentSync = uniqueIndex(current, syncKey, conflicts, "current", "sync");
  const desiredNames = uniqueIndex(desired, nameKey, conflicts, "desired", "name", false);
  const currentNames = uniqueIndex(current, nameKey, conflicts, "current", "name", false);
  const usedCurrent = new Set();
  const operations = [];

  function available(actor) {
    return actor && !usedCurrent.has(actor.path ?? actor);
  }

  function matchActor(actor) {
    const wantedSync = syncKey(actor);
    if (wantedSync && desiredSync.get(wantedSync) === actor && available(currentSync.get(wantedSync))) {
      return { actor: currentSync.get(wantedSync), reason: "sync-key" };
    }
    const wantedId = sourceId(actor);
    if (wantedId) {
      const candidates = current.filter((item) => sourceId(item) === wantedId && actorType(item) === actorType(actor) && available(item));
      if (candidates.length === 1) return { actor: candidates[0], reason: "source-id" };
      if (candidates.length > 1) {
        conflicts.push({ code: "ambiguous-source-id", key: wantedId, message: `UE 中有多个 Actor 匹配网页 ID ${wantedId}` });
        return null;
      }
    }
    const wantedName = nameKey(actor);
    if (wantedName && desiredNames.get(wantedName) === actor && available(currentNames.get(wantedName))) {
      return { actor: currentNames.get(wantedName), reason: "unique-name" };
    }
    if (wantedName) {
      const desiredNameMatches = desired.filter((item) => nameKey(item) === wantedName);
      const currentNameMatches = current.filter((item) => nameKey(item) === wantedName && available(item));
      if (currentNameMatches.length > 0 && (desiredNameMatches.length > 1 || currentNameMatches.length > 1)) {
        conflicts.push({ code: "ambiguous-name", key: wantedName, message: `名称“${actor.label}”无法唯一匹配，请保留同步标记或使用唯一名称` });
        return null;
      }
    }
    const wantedGeometry = geometryKey(actor);
    const geometryMatches = current.filter((item) => geometryKey(item) === wantedGeometry && available(item));
    if (geometryMatches.length === 1) return { actor: geometryMatches[0], reason: "geometry" };
    if (geometryMatches.length > 1) {
      conflicts.push({ code: "ambiguous-geometry", key: wantedGeometry, message: `UE 中有多个几何完全相同的 Actor 可匹配 ${actor.label}` });
    }
    return null;
  }

  for (const actor of desired) {
    const match = matchActor(actor);
    if (!match) {
      operations.push({ action: "create", actor, reason: "unmatched" });
      continue;
    }
    const currentKey = match.actor.path ?? match.actor;
    usedCurrent.add(currentKey);
    const action = actorFingerprint(actor) === actorFingerprint(match.actor) ? "unchanged" : "update";
    operations.push({ action, actor, currentActorPath: match.actor.path, reason: match.reason });
  }

  for (const actor of current) {
    const currentKey = actor.path ?? actor;
    if (usedCurrent.has(currentKey)) continue;
    operations.push({
      action: options.deleteMissing === true ? "delete" : "retain",
      currentActorPath: actor.path,
      currentActor: actor,
      reason: "missing-from-web",
    });
  }

  const uniqueConflicts = [...new Map(conflicts.map((conflict) => [`${conflict.code}|${conflict.key ?? conflict.message}`, conflict])).values()];
  const counts = Object.fromEntries(["create", "update", "unchanged", "delete", "retain"].map((action) => [
    action,
    operations.filter((operation) => operation.action === action).length,
  ]));
  return {
    ...basePlan,
    sync: {
      mode: "incremental",
      deleteMissing: options.deleteMissing === true,
      counts,
      conflictCount: uniqueConflicts.length,
      conflicts: uniqueConflicts,
      operations,
    },
  };
}
