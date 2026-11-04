import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { analyzeProject } from "../lib/analyze.mjs";
import { watchProject } from "../lib/watch.mjs";
import { initProject, loadConfig, prepareProject } from "../lib/project.mjs";

const cli = fileURLToPath(new URL("../bin/three-native.mjs", import.meta.url));
const ordinaryEntry = `import * as THREE from 'three';
import { addCube } from './world.js';
const canvas = document.querySelector('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, .1, 100);
camera.position.z = 5;
const cube = addCube(scene);
document.body.appendChild(renderer.domElement);
let previous = 0;
function animate(time) {
  requestAnimationFrame(animate);
  cube.rotation.y += previous ? (time - previous) / 1000 : 0;
  previous = time;
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
canvas.addEventListener('pointerdown', (event) => { scene.userData.down = event.clientX; });
window.addEventListener('pointerup', (event) => { scene.userData.up = event.clientY; });
`;
async function fixture(t, source = ordinaryEntry) {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "three-entry-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "src/main.js"), source);
  await writeFile(
    path.join(root, "src/world.js"),
    `import * as THREE from 'three';\nexport function addCube(scene) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); scene.add(mesh); return mesh; }\n`,
  );
  await initProject(root, { entry: "src/main.js" });
  return { root, config: await loadConfig(root) };
}
async function loadGenerated(t, config) {
  const { host } = await prepareProject(config);
  await mkdir(path.join(config.root, "node_modules"));
  await symlink(
    fileURLToPath(new URL("../../../node_modules/three", import.meta.url)),
    path.join(config.root, "node_modules/three"),
  );
  return import(pathToFileURL(path.join(host, "scene.ts")).href);
}
function context() {
  let ratio = 1;
  return {
    width: 400,
    height: 800,
    renderer: {
      getPixelRatio: () => ratio,
      setPixelRatio: (next) => {
        ratio = next;
      },
      setSize() {},
    },
  };
}

test("an ordinary browser entry is adapted, animated, resized, and receives touch without source edits", async (t) => {
  const { config, root } = await fixture(t);
  const report = await analyzeProject(config);
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.equal(report.mode, "entry");
  assert.equal(report.files.length, 2);
  assert.match(report.code, /sourceMappingURL/);
  const { createScene } = await loadGenerated(t, config);
  const first = await createScene(context());
  first.update(0.016, 0.016);
  first.update(0.016, 0.032);
  assert.equal(first.scene.children[0].rotation.y, 0.016);
  first.resize(800, 400);
  assert.equal(first.camera.aspect, 2);
  first.onPointerEvent({ type: "pointerdown", x: 0.25, y: 0.5 });
  first.onPointerEvent({ type: "pointerup", x: 0.25, y: 0.5 });
  assert.equal(first.scene.userData.down, 200);
  assert.equal(first.scene.userData.up, 200);
  const second = await createScene(context());
  assert.notEqual(second.scene, first.scene);
  assert.equal(second.scene.children[0].rotation.y, 0);
  assert.equal(
    await readFile(path.join(root, "src/main.js"), "utf8"),
    ordinaryEntry,
  );
});

test("named renderer imports, setAnimationLoop, and real OrbitControls work with single-pointer input", async (t) => {
  const { config } = await fixture(
    t,
    `import { Scene, PerspectiveCamera, WebGLRenderer as Renderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const renderer = new Renderer();
const scene = new Scene();
const camera = new PerspectiveCamera(45, 1, .1, 100);
camera.position.z = 5;
const controls = new OrbitControls(camera, renderer.domElement);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
`,
  );
  const report = await analyzeProject(config);
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.ok(report.diagnostics.some((d) => d.code === "TN402"));
  const { createScene } = await loadGenerated(t, config);
  const game = await createScene(context());
  const before = game.camera.position.clone();
  game.onPointerEvent({ type: "pointerdown", x: 0.3, y: 0.5 });
  game.onPointerEvent({ type: "pointermove", x: 0.7, y: 0.5 });
  game.onPointerEvent({ type: "pointerup", x: 0.7, y: 0.5 });
  game.update(0.016, 0.016);
  assert.ok(game.camera.position.distanceTo(before) > 1);
});

test("doctor reports imported file locations and fixes, exits nonzero, and build preparation stops", async (t) => {
  const { config, root } = await fixture(t);
  await writeFile(
    path.join(root, "src/world.js"),
    "export function addCube() {\n  document.querySelector('#hud').textContent = 'score';\n}\n",
  );
  const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  const error = report.diagnostics.find(
    (d) => d.severity === "error" && d.file === "src/world.js",
  );
  assert.equal(error.line, 2);
  assert.ok(error.column > 0);
  assert.match(error.fix, /browser-only/);
  await assert.rejects(prepareProject(config), /src\/world.js:2/);
  await assert.rejects(
    readFile(path.join(root, ".three-native/package.json")),
    /ENOENT/,
  );
});

test("analysis does not execute code and ignores comments, strings, and locally shadowed globals", async (t) => {
  const { config } = await fixture(
    t,
    `export function createScene() {
  // document.querySelector('ignored'); new THREE.ShaderMaterial();
  const text = 'window.localStorage WebGLRenderer';
  const window = { text };
  return window;
}
throw new Error('the analyzer executed application code');
`,
  );
  const report = await analyzeProject(config);
  assert.equal(report.mode, "scene");
  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
});

test("unsupported shaders, browser controls, unresolved imports, and ambiguous rendering have specific diagnostics", async (t) => {
  const { config } = await fixture(
    t,
    `import * as THREE from 'three';
import missing from './missing.js';
const renderer = new THREE.WebGLRenderer({ alpha: true });
const material = new THREE.ShaderMaterial();
window.addEventListener('keydown', () => {});
renderer.setRenderTarget(null);
renderer.render({}, {});
renderer.render({}, {});
`,
  );
  const report = await analyzeProject(config);
  for (const code of ["TN102", "TN204", "TN301", "TN201", "TN206", "TN208"])
    assert.ok(
      report.diagnostics.some((d) => d.code === code && d.fix),
      code,
    );
  assert.equal(report.ok, false);
});

test("factory entries keep their API while local import cycles terminate and unknown packages remain explicit warnings", async (t) => {
  const { config, root } = await fixture(
    t,
    "import './world.js';\nimport physics from 'some-physics';\nexport function createScene() { return physics; }\n",
  );
  await writeFile(path.join(root, "src/world.js"), "import './main.js';\n");
  const report = await analyzeProject(config);
  assert.equal(report.ok, true);
  assert.equal(report.mode, "scene");
  assert.equal(report.files.length, 2);
  assert.ok(report.diagnostics.some((d) => d.code === "TN401"));
  const output = execFileSync(process.execPath, [cli, "prepare"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.match(output, /createScene factory/);
});

test("a browser entry may import an existing createScene helper without colliding with the generated export", async (t) => {
  const { config, root } = await fixture(
    t,
    `import { WebGLRenderer } from 'three';
import { createScene } from './world.js';
const game = createScene();
const renderer = new WebGLRenderer();
window.requestAnimationFrame(function frame() { renderer.render(game.scene, game.camera); window.requestAnimationFrame(frame); });
`,
  );
  await writeFile(
    path.join(root, "src/world.js"),
    `import { Scene, PerspectiveCamera } from 'three';
export function createScene() { return { scene: new Scene(), camera: new PerspectiveCamera() }; }
`,
  );
  const { createScene } = await loadGenerated(t, config);
  const game = await createScene(context());
  assert.ok(game.scene.isScene);
  game.update(0.016, 0.016);
});

test("local imports cannot hide unmanaged animation loops or browser presentation behind aliases", async (t) => {
  const { config, root } = await fixture(t);
  await writeFile(
    path.join(root, "src/world.js"),
    "export function addCube() { requestAnimationFrame(() => {}); }\n",
  );
  const report = await analyzeProject(config);
  assert.ok(
    report.diagnostics.some(
      (d) =>
        d.severity === "error" &&
        d.file === "src/world.js" &&
        d.message.includes("requestAnimationFrame"),
    ),
  );
});

test("development regenerates edited entries, retains the last good output on errors, and recovers", async (t) => {
  const { config, root } = await fixture(t);
  const report = await analyzeProject(config);
  const { host } = await prepareProject(config, report);
  let resolveUpdate;
  const close = watchProject(config, report, (next, error) =>
    resolveUpdate?.({ next, error }),
  );
  t.after(close);
  async function edit(source) {
    const next = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Source watcher did not regenerate")),
        3000,
      );
      resolveUpdate = (result) => {
        clearTimeout(timeout);
        resolve(result);
      };
    });
    await writeFile(path.join(root, "src/main.js"), source);
    const result = await next;
    assert.ifError(result.error);
    return result.next;
  }
  assert.equal(
    (await edit(ordinaryEntry.replace("position.z = 5", "position.z = 7"))).ok,
    true,
  );
  const good = await readFile(path.join(host, "scene.ts"), "utf8");
  assert.match(good, /position.z = 7/);
  assert.equal(
    (await edit(ordinaryEntry + "document.querySelector('#hud');\n")).ok,
    false,
  );
  assert.equal(await readFile(path.join(host, "scene.ts"), "utf8"), good);
  assert.equal((await edit(ordinaryEntry)).ok, true);
  assert.match(
    await readFile(path.join(host, "scene.ts"), "utf8"),
    /position.z = 5/,
  );
});

test("aliased GLTF loaders receive a file-specific native loading recipe", async (t) => {
  const { config } = await fixture(
    t,
    `import { GLTFLoader as Models } from 'three/addons/loaders/GLTFLoader.js';
export async function createScene() { return new Models().loadAsync('model.glb'); }
`,
  );
  assert.ok(
    (await analyzeProject(config)).diagnostics.some((d) => d.code === "TN304"),
  );
  await writeFile(
    config.entry,
    `import { GLTFLoader as Models } from 'three/addons/loaders/GLTFLoader.js';
const loader = new Models();
export async function createScene() { return loader.loadAsync('model.glb'); }
`,
  );
  const report = await analyzeProject(config);
  const issue = report.diagnostics.find((d) => d.code === "TN304");
  assert.equal(issue.line, 3);
  assert.match(issue.fix, /GLTFLoader.parseAsync/);
});
