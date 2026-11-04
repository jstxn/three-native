# Three Native

Add a native iOS target to an existing Three.js project. Point the config at your browser entry; the CLI adapts supported startup code into a generated host and reports unsupported code with file, line, and a suggested change. Your source and browser build are left intact.

```sh
npm install --save-dev @jstxn/three-native
# or: bun add --dev @jstxn/three-native
npx three-native init --entry ./src/main.js --name "My Game" --bundle-id com.example.mygame
npx three-native doctor
npx three-native dev ios
```

The registry commands become available after publication. For this unpublished alpha, install the `jstxn-three-native-0.2.0.tgz` produced by `npm pack` instead. Node 22.18+ is required. iOS builds need macOS and Xcode. The CLI uses npm to install the generated host's pinned dependencies even when installed through Bun.

## Point at your existing entry

`init` creates `three-native.config.mjs` without replacing an existing config:

```js
import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/main.js",
  name: "My Game",
  ios: { bundleIdentifier: "com.example.mygame" },
});
```

Only `entry` is required. App metadata defaults to `Three Native App` and `com.example.threenative`; set your own name and bundle identifier in the config when needed.

You do not need to export a factory for a supported browser entry. For example, this standard Three.js startup is automatically adapted:

```js
import * as THREE from "three";
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45,
  innerWidth / innerHeight,
  0.1,
  100,
);
camera.position.z = 4;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial(),
);
scene.add(mesh);
renderer.setAnimationLoop(() => {
  mesh.rotation.y += 0.01;
  renderer.render(scene, camera);
});
```

The CLI parses JavaScript/TypeScript with Babel, checks relative imports recursively, and writes a wrapper to `.three-native/scene.ts`. It does not execute your application during analysis or change your source. Add `.three-native/` to `.gitignore` and inspect the generated wrapper whenever useful.

Supported automatic adaptations:

- A single named renderer variable initialized with `new THREE.WebGLRenderer()` or `new THREE.WebGPURenderer()`, including aliased named imports. Supported constructor options are `antialias: true` and `canvas`.
- One `renderer.render(scene, camera)` call site, driven by `requestAnimationFrame` or `setAnimationLoop`. Startup runs afresh for each scene mount.
- `document.body.appendChild(renderer.domElement)` and canvas lookups used in renderer construction.
- Native viewport dimensions, pixel ratio, renderer sizing, and resize listeners.
- Pointer down/move/up/cancel and click listeners on the canvas, document, or window. These receive a single touch pointer and pixel coordinates.
- OrbitControls single-finger rotation. Pinch, two-finger pan, wheel, and keyboard controls are not supplied.

The host owns rendering, the frame clock, viewport size, pause/resume, and scene-resource disposal. The original browser build continues using its own renderer and DOM. During `dev`, source edits regenerate the wrapper so Metro can reload; compatibility errors retain the last successful wrapper until corrected. Restart the CLI after changing configuration.

## Understand compatibility results

```sh
npx three-native doctor
npx three-native doctor --json
```

Diagnostics distinguish automatic changes (`INFO`), unverified dependencies (`WARNING`), and required changes (`ERROR`). For example:

```text
ERROR TN201 src/hud.js:12:3
  document needs a native adaptation.
  Change: Move this browser-only code to your web entry, or export
  createScene(context) and implement it in the native host.
```

Errors stop `prepare`, `dev`, and `build` before installing native dependencies or compiling. `doctor --json` returns the mode, scanned files, diagnostic codes, locations, messages, and suggested changes; it exits nonzero on errors.

The scanner reports DOM UI, keyboard/multitouch controls, GLSL materials, WebGL postprocessing/render targets, URL-based loaders, computed module paths, missing imports, and unsupported startup structures. Browser bundler aliases and `import.meta` must be replaced with portable imports/configuration. Third-party package internals are not scanned; a successful report still needs native runtime testing.

## Escape hatch: a scene factory

For unsupported startup or custom integration, point the same config at a module exporting `createScene(context)`. This existing API remains supported and can be async:

```js
import * as THREE from "three/webgpu";
export function createScene({ width, height }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.z = 4;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshNormalMaterial(),
  );
  scene.add(mesh);
  return {
    scene,
    camera,
    update(deltaSeconds, elapsedSeconds) {
      mesh.rotation.y += deltaSeconds;
    },
    onPointer(x, y) {
      /* normalized 0–1 coordinates, on release */
    },
  };
}
```

The context also exposes `renderer` for settings such as tone mapping and `resolveAsset(module)`. Optional `resize(width,height)` handles custom camera sizing. Optional `onPointerEvent({ type, x, y })` exposes down/move/up/cancel events with normalized coordinates. Optional `dispose()` replaces default disposal for projects with shared resources. React Native hosts can import `ThreeView` from `@jstxn/three-native/runtime`.

Browser-only startup inside imported helper modules is reported rather than rewritten. Move it into the configured entry for automatic adaptation, or pass native context into a factory.

## Bundled GLB models

Add project-relative files to `assets` when they should be embedded in the native app. For loading, statically import the asset and use a factory so the loader receives the native asset resolver:

```js
import model from "./assets/model.glb";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function createScene({ resolveAsset }) {
  const response = await fetch(await resolveAsset(model));
  if (!response.ok && response.status !== 0)
    throw new Error(`Asset load failed: ${response.status}`);
  const gltf = await new GLTFLoader().parseAsync(
    await response.arrayBuffer(),
    "",
  );
  // Add gltf.scene, create a camera, and return { scene, camera }.
}
```

Three.js FileLoader wraps progress streams in a Response, which is not portable to React Native's response implementation. Use self-contained `.glb` files with embedded textures. External `.gltf` resources, Draco, and KTX2 are not validated by this alpha.

## Commands

| Command                        | Result                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| `init --entry ./src/main.js`   | Add config for an existing browser entry or scene factory              |
| `init`                         | Add config and a small scene skeleton                                  |
| `doctor [--json]`              | Analyze the entry and relative imports; explain required changes       |
| `prepare`                      | Check compatibility and generate the host without installing/compiling |
| `dev web`                      | Run the adapted scene in a browser with Metro reload                   |
| `dev ios --simulator UDID`     | Build/run the iOS development host                                     |
| `build web`                    | Export to `.three-native/dist`                                         |
| `build ios`                    | Build a Release Simulator `.app` in `.three-native/build`              |
| `preview ios --simulator UDID` | Stream/control that Simulator at localhost:8087                        |

`--port` selects a web dev or simulator preview port. Native compilation and Metro export use two workers. Generated files can be recreated by removing `.three-native/`; existing source and package.json are preserved.

## Current boundaries

The host pins Three.js 0.186.0. Three.js 0.187.0 requires WeakRef and FinalizationRegistry in renderer internals, which this Hermes runtime does not provide. A newer browser project must use APIs supported by the native version.

Metro/Babel processes JavaScript and TypeScript; React Native packages Hermes bytecode; Xcode compiles the host; WebGPU runs through Dawn and Metal. This is not a general JavaScript-to-Swift or GLSL-to-Metal compiler. Arbitrary DOM UI, custom shaders, multiple renderers, delayed startup, and third-party packages may need an explicit adapter.

The target is an iOS Simulator release and local browser stream. Physical-device signing, TestFlight/App Store submission, public session hosting, Android, and general React Three Fiber compatibility are not part of this alpha.
