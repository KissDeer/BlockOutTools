import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LocalLevelLibrary,
  LocalLevelLibraryError,
  normalizeLevelFileName,
} from "../src/server/local-level-library.js";

function createLevel(name = "测试关卡") {
  return {
    name,
    shapes: [{ id: "ground", type: "rect" }],
    entities: [],
    layers: [{ id: "base", name: "Base" }],
  };
}

async function withTempLibrary(run) {
  const directory = await mkdtemp(join(tmpdir(), "layout-tools-library-"));
  try {
    const library = new LocalLevelLibrary({
      directory,
      autosaveFile: "autosave.json",
      autosaveDelayMs: 25,
      restoreLastOpened: true,
    });
    await library.initialize();
    await run(library, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("normalizes local level file names", () => {
  assert.equal(normalizeLevelFileName("测试关卡"), "测试关卡.json");
  assert.equal(normalizeLevelFileName("level.JSON"), "level.JSON");
  assert.throws(() => normalizeLevelFileName("../level.json"), LocalLevelLibraryError);
  assert.throws(() => normalizeLevelFileName("folder/level.json"), LocalLevelLibraryError);
  assert.throws(() => normalizeLevelFileName(""), LocalLevelLibraryError);
});

test("saves, lists, loads, and restores the last opened level", async () => {
  await withTempLibrary(async (library, directory) => {
    assert.equal((await library.list()).restoreFile, null);

    const level = createLevel("中文关卡");
    const saved = await library.save("中文关卡", level);
    assert.equal(saved.name, "中文关卡.json");
    assert.equal(saved.shapes, 1);

    const listing = await library.list();
    assert.equal(listing.directory, directory);
    assert.equal(listing.autosaveDelayMs, 25);
    assert.equal(listing.lastOpened, "中文关卡.json");
    assert.equal(listing.restoreFile, "中文关卡.json");
    assert.deepEqual(listing.files.map((file) => file.name), ["中文关卡.json"]);

    const loaded = await library.load("中文关卡.json");
    assert.deepEqual(loaded.level, level);
    assert.equal(loaded.file.levelName, "中文关卡");

    const onDisk = JSON.parse(await readFile(join(directory, "中文关卡.json"), "utf8"));
    assert.deepEqual(onDisk, level);
  });
});

test("rejects invalid levels and reports malformed JSON files", async () => {
  await withTempLibrary(async (library, directory) => {
    await assert.rejects(
      library.save("broken.json", { name: "Broken", shapes: [] }),
      LocalLevelLibraryError,
    );
    await writeFile(join(directory, "malformed.json"), "{", "utf8");

    const listing = await library.list();
    assert.equal(listing.files.length, 1);
    assert.equal(listing.files[0].name, "malformed.json");
    assert.equal(listing.files[0].invalid, true);
  });
});
