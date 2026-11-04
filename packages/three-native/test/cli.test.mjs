import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initProject, loadConfig, prepareProject } from "../lib/project.mjs";
const cli = fileURLToPath(new URL("../bin/three-native.mjs", import.meta.url));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "three-native-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("init and prepare add a host without changing the existing Three entry", async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, "src"));
  const source = "export function createScene() { return {}; }\n";
  await writeFile(path.join(root, "src/scene.js"), source);
  execFileSync(
    process.execPath,
    [cli, "init", "--entry", "./src/scene.js", "--name", "Existing App"],
    { cwd: root },
  );
  const config = await loadConfig(root);
  const { host } = await prepareProject(config);
  assert.equal(await readFile(path.join(root, "src/scene.js"), "utf8"), source);
  assert.match(
    await readFile(path.join(host, "scene.ts"), "utf8"),
    /\.\.\/src\/scene\.js/,
  );
  assert.match(
    await readFile(path.join(host, "ThreeView.tsx"), "utf8"),
    /context\.present\(\)/,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(host, "app.json"), "utf8")).expo.ios
      .bundleIdentifier,
    "com.example.threenative",
  );
  await prepareProject(config);
  assert.equal(await readFile(path.join(root, "src/scene.js"), "utf8"), source);
});
test("init refuses to overwrite a config", async (t) => {
  const root = await fixture(t);
  await initProject(root);
  const before = await readFile(
    path.join(root, "three-native.config.mjs"),
    "utf8",
  );
  await assert.rejects(initProject(root), /already exists/);
  assert.equal(
    await readFile(path.join(root, "three-native.config.mjs"), "utf8"),
    before,
  );
});
test("config rejects missing entries and paths outside the project", async (t) => {
  const root = await fixture(t);
  await assert.rejects(
    initProject(root, { entry: "./missing.js" }),
    /does not exist/,
  );
  await assert.rejects(
    initProject(root, { entry: "../outside.js" }),
    /inside this project/,
  );
});
test("prepare refuses unowned directories and symlink destinations", async (t) => {
  const root = await fixture(t);
  await initProject(root);
  const config = await loadConfig(root);
  const host = path.join(root, ".three-native");
  await mkdir(host);
  await assert.rejects(prepareProject(config), /unowned/);
  await rm(host, { recursive: true });
  const elsewhere = path.join(root, "elsewhere");
  await mkdir(elsewhere);
  await symlink(elsewhere, host);
  await assert.rejects(prepareProject(config), /symlink/);
});
test("CLI rejects unknown commands and invalid preview ports", () => {
  assert.throws(
    () => execFileSync(process.execPath, [cli, "unknown"], { stdio: "pipe" }),
    /Unknown command/,
  );
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          cli,
          "preview",
          "ios",
          "--simulator",
          "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
          "--port",
          "oops",
        ],
        { stdio: "pipe" },
      ),
    /port must be/,
  );
});

test("prepare rejects file symlinks before overwriting project data", async (t) => {
  const root = await fixture(t);
  await initProject(root);
  const config = await loadConfig(root);
  const { host } = await prepareProject(config);
  const original = path.join(root, "keep.json");
  await writeFile(original, "important");
  await rm(path.join(host, "app.json"));
  await symlink(original, path.join(host, "app.json"));
  await assert.rejects(prepareProject(config), /generated symlink/);
  assert.equal(await readFile(original, "utf8"), "important");
});

test("config needs only an entry and validates explicit app metadata", async (t) => {
  const root = await fixture(t);
  await writeFile(
    path.join(root, "main.js"),
    "export function createScene() { return {}; }\n",
  );
  const file = path.join(root, "three-native.config.mjs");
  await writeFile(file, "export default { entry: './main.js' };\n");
  const config = await loadConfig(root);
  assert.equal(config.name, "Three Native App");
  assert.equal(config.ios.bundleIdentifier, "com.example.threenative");
  await prepareProject(config);
  await writeFile(file, "export default { entry: './main.js', ios: null };\n");
  await assert.rejects(loadConfig(root), /ios must be/);
});

test("preview defaults and invalid device config are validated before generation", async (t) => {
  const root = await fixture(t);
  await initProject(root);
  const config = await loadConfig(root);
  assert.deepEqual(config.preview, {
    device: "iphone-18-pro",
    orientation: "portrait",
  });
  const { host } = await prepareProject(config);
  assert.match(
    await readFile(path.join(host, "App.tsx"), "utf8"),
    /DevicePreview.*iphone-18-pro/,
  );
  assert.match(
    await readFile(path.join(host, "DevicePreview.web.tsx"), "utf8"),
    /Target device/,
  );
  assert.doesNotMatch(
    await readFile(path.join(host, "DevicePreview.tsx"), "utf8"),
    /iframe/,
  );
  const file = path.join(root, "three-native.config.mjs");
  await writeFile(
    file,
    "export default {entry:'./src/native-scene.ts',preview:{device:'imaginary'}};\n",
  );
  await assert.rejects(loadConfig(root), /Unknown preview device/);
  await writeFile(
    file,
    "export default {entry:'./src/native-scene.ts',preview:{device:'iphone-se-3',orientation:'landscape'}};\n",
  );
  assert.deepEqual((await loadConfig(root)).preview, {
    device: "iphone-se-3",
    orientation: "landscape",
  });
});

test("native host config includes permission plugins and validates Apple signing team", async (t) => {
  const root = await fixture(t);
  await initProject(root);
  const file = path.join(root, "three-native.config.mjs");
  await writeFile(
    file,
    "export default {entry:'./src/native-scene.ts',ios:{appleTeamId:'ABC1234567'}};\n",
  );
  const { host } = await prepareProject(await loadConfig(root));
  const app = JSON.parse(
    await readFile(path.join(host, "app.json"), "utf8"),
  ).expo;
  assert.equal(app.ios.appleTeamId, "ABC1234567");
  assert.ok(app.plugins.some((plugin) => plugin[0] === "expo-location"));
  assert.equal(
    app.plugins.find((plugin) => plugin[0] === "expo-image-picker")[1]
      .microphonePermission,
    false,
  );
  assert.match(
    await readFile(path.join(host, "metro.config.js"), "utf8"),
    /@jstxn\/three-native\/native/,
  );
  assert.match(
    await readFile(path.join(host, "native.ts"), "utf8"),
    /expo-sensors/,
  );
  await writeFile(
    file,
    "export default {entry:'./src/native-scene.ts',ios:{appleTeamId:'invalid'}};\n",
  );
  await assert.rejects(loadConfig(root), /10-character Apple/);
});

test(
  "MCP clients can select a project from another working directory",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const root = await fixture(t);
    await initProject(root);
    assert.throws(
      () =>
        execFileSync(process.execPath, [cli, "mcp", "--project", root], {
          cwd: tmpdir(),
          stdio: "pipe",
        }),
      /generate the native host/,
    );
  },
);
