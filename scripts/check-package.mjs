import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const tarball = path.resolve(
  process.argv[2] ?? "artifacts/jstxn-three-native-0.4.0.tgz",
);
for (const manager of ["npm", "bun"]) {
  const root = await mkdtemp(path.join(tmpdir(), `three-native-${manager}-`));
  try {
    await mkdir(path.join(root, "src"));
    const source =
      "import * as THREE from 'three';\nconst scene = new THREE.Scene();\nconst camera = new THREE.PerspectiveCamera(45, 1, .1, 100);\nconst renderer = new THREE.WebGLRenderer();\ndocument.body.appendChild(renderer.domElement);\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));\n";
    await writeFile(path.join(root, "src/scene.js"), source);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "existing-project",
        private: true,
        type: "module",
      }),
    );
    execFileSync(
      manager,
      manager === "npm"
        ? ["install", "--no-audit", "--no-fund", "--save-dev", tarball]
        : ["add", "--dev", tarball],
      { cwd: root, stdio: "pipe" },
    );
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "import { native } from '@jstxn/three-native/native'; if (native.info().environment !== 'browser') throw Error('Invalid default runtime'); try { await native.camera.capture(); throw Error('Camera should be unavailable'); } catch(e) { if(e.code !== 'unavailable') throw e; }",
      ],
      { cwd: root, stdio: "pipe" },
    );
    await writeFile(
      path.join(root, "native-client.mts"),
      "import { native, NativeFeatureError } from '@jstxn/three-native/native';\nconst stop = await native.motion.watch(({ x, y, z }) => console.log(x, y, z)); stop();\nconst image = await native.camera.capture(); console.log(image?.uri);\nnew NativeFeatureError('unavailable', 'No hardware');\n",
    );
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/typescript/bin/tsc", import.meta.url),
        ),
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--module",
        "nodenext",
        "--target",
        "es2022",
        "native-client.mts",
      ],
      { cwd: root, stdio: "pipe" },
    );
    const cli = path.join(root, "node_modules/.bin/three-native");
    assert.equal(
      execFileSync(cli, ["--version"], { cwd: root, encoding: "utf8" }).trim(),
      "0.4.0",
    );
    execFileSync(cli, ["init", "--entry", "src/scene.js"], {
      cwd: root,
      stdio: "pipe",
    });
    execFileSync(cli, ["doctor"], { cwd: root, stdio: "pipe" });
    execFileSync(cli, ["prepare"], { cwd: root, stdio: "pipe" });
    assert.match(
      await readFile(path.join(root, ".three-native/scene.ts"), "utf8"),
      /createEntryScene/,
    );
    assert.match(
      await readFile(path.join(root, ".three-native/BrowserEntry.mjs"), "utf8"),
      /onPointerEvent/,
    );
    assert.equal(
      await readFile(path.join(root, "src/scene.js"), "utf8"),
      source,
    );
    const app = JSON.parse(
      await readFile(path.join(root, ".three-native/app.json"), "utf8"),
    );
    assert.equal(app.expo.ios.bundleIdentifier, "com.example.threenative");
    assert.match(
      await readFile(path.join(root, ".three-native/ThreeView.tsx"), "utf8"),
      /context\.present\(\)/,
    );
    console.log(
      `PASS: ${manager} installed the tarball; CLI adapted an existing browser entry without changing its source.`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
