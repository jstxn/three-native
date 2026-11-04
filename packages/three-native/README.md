# Three Native

Install a native target into an existing Three.js project. Keep your source and browser build; let the CLI generate the iOS host.

```sh
npm install --save-dev @jstxn/three-native
# or: bun add --dev @jstxn/three-native
npx three-native init --entry ./src/scene.js --name "My App" --bundle-id com.example.myapp
npx three-native doctor
npx three-native dev ios
npx three-native build ios
```

These registry commands become available after the package is published. Until then, install the `.tgz` made with `npm pack`; the CLI and package contents are identical. Node 22.18+ is required. iOS builds need macOS and Xcode. The CLI uses npm to install the generated host's pinned dependencies even when the CLI was installed with Bun.

## Configuration

`three-native init` creates `three-native.config.mjs`, refusing to overwrite an existing config. You can write it yourself:

```js
import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/scene.js",
  name: "My App",
  ios: { bundleIdentifier: "com.example.myapp" },
  assets: ["./assets/model.glb"],
});
```

Assets are optional, project-relative files embedded in the native app. Import a model with a static import/require and pass that module to `context.resolveAsset()` before loading it. Keep the scene and asset files inside the project. Add `.three-native/` to `.gitignore`; that folder is generated and can be removed to reset the native host.

## Scene contract

Export `createScene(context)` from the configured entry. It can be async. Existing Three.js scene construction goes here; keep browser DOM and renderer startup in your existing web entry.

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
      /* normalized coordinates in the scene */
    },
  };
}
```

The host owns the renderer, resizing, frame presentation, pause/resume on app backgrounding, and default disposal of scene geometry/materials/textures. Optional `resize(width,height)` handles custom camera sizing. Optional `dispose()` replaces default scene-resource disposal, for projects with shared resources. React apps can import `ThreeView` from `@jstxn/three-native/runtime`; its additional `paused`, `onReady`, and `onMetrics` props are used by the native lab example.

## Bundled GLB models

Use the resolved asset's bytes directly on native. Three.js `FileLoader` wraps progress streams in a `Response`, which is not portable to React Native's response implementation.

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
  // Add gltf.scene to your scene, create a camera, and return { scene, camera }.
}
```

Use a self-contained `.glb` with embedded textures. External `.gltf` resource paths, Draco, and KTX2 are not validated by this alpha.

## Commands

| Command                        | Result                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- |
| `init`                         | Add config and, if no entry is provided, a small scene skeleton            |
| `doctor`                       | Validate config and local paths; report advisory browser/WebGL API matches |
| `prepare`                      | Generate the host without installing dependencies or compiling             |
| `dev web`                      | Run the same scene in a browser, with Metro reload                         |
| `dev ios --simulator UDID`     | Build/run the iOS development host                                         |
| `build web`                    | Export to `.three-native/dist`                                             |
| `build ios`                    | Build a Release iOS Simulator `.app` in `.three-native/build`              |
| `preview ios --simulator UDID` | Stream/control that actual Simulator at localhost:8087                     |

`--port` selects a web dev or simulator preview port. Native compilation and Metro export use two workers. A generated project never overwrites your existing source or package.json.

## Version compatibility

The generated host pins Three.js 0.186.0. Three.js 0.187.0 requires `WeakRef` and `FinalizationRegistry` in renderer internals; the pinned Hermes runtime does not provide them. A newer Three.js web project must stay within the native host's supported API. Upgrade this combination only after native rendering and lifecycle checks pass.

## What this compiles

Metro/Babel processes the JavaScript and TypeScript; React Native packages Hermes bytecode; Xcode compiles the host; Three.js WebGPU runs through Dawn and Metal. This is not a general JavaScript-to-Swift transpiler. Existing `WebGLRenderer`, GLSL `ShaderMaterial`, DOM UI, and unsupported browser APIs need adaptation. The doctor scan examines the entry only and cannot prove dependency compatibility.

The first target is an iOS Simulator release and a local browser stream. Device signing, TestFlight/App Store submission, public session hosting, Android, and general React Three Fiber compatibility are not part of this alpha.
