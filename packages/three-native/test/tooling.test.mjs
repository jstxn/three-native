import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  configureTooling,
  normalizeDevices,
  validateTarget,
} from "../lib/tooling.mjs";

test("tooling defaults stay within the generated host and preserve the selected target", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "three-tooling-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = { root, ios: { bundleIdentifier: "com.example.game" } };
  await assert.rejects(configureTooling(config), /generate the native host/);
  const host = path.join(root, ".three-native");
  await mkdir(path.join(host, "ios/Game.xcworkspace"), { recursive: true });
  await writeFile(path.join(host, ".generated-by-three-native"), "generated");
  const first = await configureTooling(config, {
    simulator: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
  });
  assert.equal(
    first.settings.sessionDefaults.workspacePath,
    path.join(host, "ios/Game.xcworkspace"),
  );
  assert.equal(first.settings.sessionDefaults.bundleId, "com.example.game");
  assert.deepEqual(first.settings.sessionDefaults.extraArgs, [
    "-jobs",
    "2",
    "ONLY_ACTIVE_ARCH=YES",
  ]);
  assert.equal(first.settings.sentryDisabled, true);
  assert.equal(
    (await configureTooling(config)).settings.sessionDefaults.simulatorId,
    first.settings.sessionDefaults.simulatorId,
  );
  const physical = await configureTooling(config, {
    device: "00008030-ABCD12345678",
  });
  assert.equal(
    physical.settings.sessionDefaults.deviceId,
    "00008030-ABCD12345678",
  );
  assert.equal(physical.settings.sessionDefaults.simulatorId, undefined);
  assert.deepEqual(
    JSON.parse(await readFile(physical.filename, "utf8")),
    physical.settings,
  );
  const keep = path.join(root, "keep.json");
  await writeFile(keep, "untouched");
  await rm(physical.filename);
  await symlink(keep, physical.filename);
  await assert.rejects(configureTooling(config), /symlink/);
  assert.equal(await readFile(keep, "utf8"), "untouched");
});

test("device inventories distinguish physical devices from simulated runtimes", () => {
  const result = normalizeDevices(
    {
      devices: {
        "iOS-27": [
          { udid: "sim", name: "iPhone", state: "Booted", isAvailable: true },
          { udid: "old", isAvailable: false },
        ],
      },
    },
    {
      result: {
        devices: [
          {
            hardwareProperties: {
              reality: "physical",
              udid: "phone",
              marketingName: "iPhone",
            },
            deviceProperties: { name: "Phone" },
            connectionProperties: { tunnelState: "unavailable" },
          },
          { hardwareProperties: { reality: "simulated" } },
        ],
      },
    },
  );
  assert.deepEqual(result.simulators, [
    { id: "sim", name: "iPhone", state: "Booted", runtime: "iOS-27" },
  ]);
  assert.deepEqual(result.devices, [
    { id: "phone", name: "Phone", model: "iPhone", state: "unavailable" },
  ]);
  assert.throws(
    () => validateTarget({ device: "phone-id", simulator: "simul-id" }),
    /not both/,
  );
  assert.throws(() => validateTarget({ device: "../path" }), /UDID/);
});
