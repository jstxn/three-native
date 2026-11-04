# Three Native

Add a native iOS target to an existing Three.js project. Point the config at your browser entry; the CLI adapts supported startup code into a generated host and reports unsupported code with file, line, and a suggested change. Your source and browser build are left intact.

```sh
npm install --save-dev @jstxn/three-native
# or: bun add --dev @jstxn/three-native
npx three-native init --entry ./src/main.js --name "My Game" --bundle-id com.example.mygame
npx three-native doctor
npx three-native dev ios
```

The registry commands become available after publication. For this unpublished alpha, install the `jstxn-three-native-0.4.0.tgz` produced by `npm pack` instead. Node 22.18+ is required. iOS builds need macOS and Xcode. The CLI uses npm to install the generated host's pinned dependencies even when installed through Bun.

## Point at your existing entry

`init` creates `three-native.config.mjs` without replacing an existing config:

```js
import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/main.js",
  name: "My Game",
  ios: { bundleIdentifier: "com.example.mygame" },
  preview: { device: "iphone-18-pro", orientation: "portrait" },
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

## Device-sized browser preview

`dev web` and `build web` wrap the app in a device picker. Choose a real iPhone/iPad preset, rotate it, or view it at 100%. The app receives the selected logical screen dimensions even when the preview is scaled to fit your browser. Selection changes preserve app state. This is responsive layout testing; safe areas, hardware, and performance still need the native app. See the [preset sources and limits](https://github.com/jstxn/three-native/blob/main/docs/device-presets.md).

## Use native device features

No React component is required in your game code:

```js
import { native, NativeFeatureError } from "@jstxn/three-native/native";

console.log(native.info()); // environment: device | simulator | browser

// Call from your own input handler. Always handle permissions/unavailability.
async function onHit() {
  try {
    await native.haptics.impact("light");
  } catch (error) {
    if (!(error instanceof NativeFeatureError)) throw error;
    console.log(error.code, error.message);
  }
}
```

| API                                                              | Result                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `native.haptics.impact('light')`                                 | Requests physical iOS haptic feedback; also accepts medium, heavy, soft, rigid                               |
| `await native.motion.watch(({x,y,z}) => ..., {intervalMs: 100})` | Accelerometer values in g; returns a stop function you must call on scene disposal; pauses in the background |
| `await native.location.current()`                                | Location with coordinates, timestamp, and source set to device or simulator                                  |
| `await native.camera.capture()`                                  | Opens the native camera; returns an image asset (`uri`, `width`, `height`) or `null` on cancellation         |

The host includes Expo's native modules and permission descriptions automatically. Camera, motion, and haptics require physical hardware. Location can use a Simulator location. Browser calls reject with `NativeFeatureError` (`unavailable`); a selected iPhone preview never borrows your computer's camera or pretends to be hardware. Denied permissions use `permission-denied`. iOS may suppress haptics even when the call completes. Current location needs enabled location services and may take time to obtain a fix.

## Connect developer tools

```sh
npx three-native devices
npx three-native dev ios --device YOUR_DEVICE_UDID
# Or build/run on a Simulator:
npx three-native dev ios --simulator YOUR_SIMULATOR_UDID

# After generating the iOS workspace:
npx three-native mcp --simulator YOUR_SIMULATOR_UDID
# CLI access to the same upstream tools:
npx three-native tools simulator snapshot-ui --output json
npx three-native tools ui-automation touch --element-ref REF_FROM_SNAPSHOT --down --up --delay 0.15
npx three-native tools simulator screenshot --return-format path
```

`mcp` starts the pinned XcodeBuildMCP 2.7.0 stdio server with this project's workspace, scheme, bundle ID, and target. For a physical target, use `mcp --device YOUR_DEVICE_UDID`. Register that command with `--project /absolute/project` in your MCP client. No global client configuration is edited. Settings are generated in `.three-native/.xcodebuildmcp/config.yaml`; these select defaults, not an authorization sandbox. Upstream tools can operate other targets explicitly requested by the client.

For example, a client that accepts `mcpServers` configuration can use an absolute installed CLI path:

```json
{
  "mcpServers": {
    "three-native": {
      "command": "/absolute/project/node_modules/.bin/three-native",
      "args": [
        "mcp",
        "--project",
        "/absolute/project",
        "--simulator",
        "YOUR_SIMULATOR_UDID"
      ]
    }
  }
}
```

The verified press path is `touch` with down/up and a short delay. Upstream semantic `tap` reported success without activating controls in this Simulator; use `touch` and verify the resulting screen. Refresh the snapshot after scrolling or changing screens.

The first tooling invocation downloads the pinned upstream package through npm. MCP telemetry is disabled for this child process. Simulator tools support input, snapshots, screenshots, build/install/launch, and log capture. Xcode tools handle physical build/install/launch/test. The `device_ui_*` tools described below add physical UI control through Appium and WebDriverAgent. Permission prompts remain visible and are not accepted automatically.

Physical deployment needs device trust, Developer Mode, and signing. Set `ios.appleTeamId` to your 10-character team ID if needed; it is passed to Expo's generated Xcode project. The CLI cannot provision an Apple account for you. For physical stdout, `three-native logs ios --device YOUR_DEVICE_UDID --restart` explicitly restarts the app and streams its console output. Simulator launch tools report a captured log file. [Verified upstream capabilities](https://github.com/jstxn/three-native/blob/main/docs/native-device-research.md).

## Control a physical iPhone

Connect and unlock the phone, trust the Mac, and enable **Developer Mode** and **Settings → Developer → Enable UI Automation**. Install your app on it with `dev ios --device UDID` first. Add your Apple development team to the same config:

```js
export default {
  entry: "./src/main.js",
  ios: {
    bundleIdentifier: "com.example.mygame",
    appleTeamId: "YOURTEAMID", // 10 characters
    automation: {
      wdaBundleIdentifier: "com.example.mygame.wda",
      // port: 4723, wdaLocalPort: 8100,
    },
  },
};
```

The runner bundle identifier must be covered by your signing team/profile. Xcode may require account setup or the phone may ask you to trust the development runner. The CLI reports signing and connection errors; it cannot bypass device security. [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device), [Appium physical-device setup](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/getting-started/device-setup.md).

```sh
# Once per project: install pinned Appium 3.9.0 + XCUITest 12.22.8 locally.
npx three-native device setup

# Keep this running in a terminal for CLI control.
npx three-native device serve

# In another terminal:
npx three-native device connect --device YOUR_DEVICE_UDID
npx three-native device snapshot
npx three-native device screenshot --output iphone.png
npx three-native device tap --id 'Start game'
npx three-native device tap --x 200 --y 400
npx three-native device swipe --direction up
npx three-native device type --id 'Player name' --text 'Player One' --clear
npx three-native device disconnect
```

`snapshot` returns the native accessibility hierarchy and the screen rectangle in **logical points**. Use those points for coordinate taps; screenshots may contain more pixels. Accessibility IDs/labels identify native controls. Three.js objects inside the GPU canvas use coordinate input; meshes do not automatically become native accessibility nodes. Typing without `--id` uses the focused text field.

Sessions preserve app data, do not reinstall the app, and do not automatically accept permission prompts. Disconnecting ends the automation session without resetting the app. `serve` binds only to `127.0.0.1`; stop it with Ctrl-C. It is a local development service without authentication and must not be exposed through a public tunnel. Screenshots and UI trees may contain private phone content, so keep captured artifacts out of public commits.

For MCP, run the same existing command after `device setup`:

```sh
npx three-native mcp --project /absolute/project --device YOUR_DEVICE_UDID
```

For an already-installed app without a generated Xcode workspace, use `three-native device mcp --device YOUR_DEVICE_UDID`; this exposes only the UI tools.

The server adds `device_ui_connect`, `device_ui_status`, `device_ui_snapshot`, `device_ui_screenshot`, `device_ui_tap`, `device_ui_swipe`, `device_ui_type`, and `device_ui_disconnect` alongside the Xcode tools. `device_ui_connect` starts the local Appium service if necessary. Services and sessions started by that MCP connection are closed on disconnect; a separately started CLI service is preserved.

First connection may take several minutes while Xcode builds/signs WebDriverAgent. Advanced setups can set `ios.automation.usePrebuiltWDA: true` and prebuild the runner into `.three-native/automation/wda-build`. `--simulator UDID` is also accepted by `device connect` for checking the same integration on Simulator. [Pinned versions, protocols, and setup details](https://github.com/jstxn/three-native/blob/main/docs/physical-device-automation.md).

## Commands

| Command                                                          | Result                                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `init --entry ./src/main.js`                                     | Add config for an existing browser entry or scene factory              |
| `init`                                                           | Add config and a small scene skeleton                                  |
| `doctor [--json]`                                                | Analyze the entry and relative imports; explain required changes       |
| `prepare`                                                        | Check compatibility and generate the host without installing/compiling |
| `dev web`                                                        | Run the adapted scene in a browser with Metro reload                   |
| `dev ios --simulator UDID`                                       | Build/run the iOS development host                                     |
| `dev ios --device UDID`                                          | Build/run on a trusted, signed physical device                         |
| `device setup / serve / connect`                                 | Install local automation tools, start service, and connect an iPhone   |
| `device snapshot / screenshot / tap / swipe / type / disconnect` | Inspect and interact with the connected iPhone                         |
| `devices [--json]`                                               | List installed Simulators and physical-device connection states        |
| `mcp [--project PATH] [--simulator UDID] [--device UDID]`        | Start the project-configured MCP server with one optional target       |
| `tools <workflow> <command>`                                     | Run an upstream device/Simulator tool                                  |
| `logs ios --device UDID --restart`                               | Restart a physical app and stream stdout                               |
| `build web`                                                      | Export to `.three-native/dist`                                         |
| `build ios`                                                      | Build a Release Simulator `.app` in `.three-native/build`              |
| `preview ios --simulator UDID`                                   | Stream/control that Simulator at localhost:8087                        |

`--port` selects a web dev or simulator preview port. Native compilation and Metro export use two workers. Generated files can be recreated by removing `.three-native/`; existing source and package.json are preserved.

## Current boundaries

The host pins Three.js 0.186.0. Three.js 0.187.0 requires WeakRef and FinalizationRegistry in renderer internals, which this Hermes runtime does not provide. A newer browser project must use APIs supported by the native version.

Metro/Babel processes JavaScript and TypeScript; React Native packages Hermes bytecode; Xcode compiles the host; WebGPU runs through Dawn and Metal. This is not a general JavaScript-to-Swift or GLSL-to-Metal compiler. Arbitrary DOM UI, custom shaders, multiple renderers, delayed startup, and third-party packages may need an explicit adapter.

The release build command targets iOS Simulator. Physical development deployment is supported when the user supplies signing and a trusted device, but remains unverified on physical hardware in this proof. TestFlight/App Store submission, public session hosting, Android, and general React Three Fiber compatibility are outside this alpha.
