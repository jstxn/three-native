# Developing Three Native

Run these commands from the repository root. For the product overview and adoption guide, see the [README](../README.md).

## Reference demo

A standalone proof of concept: the same Three.js scene runs in a native iOS app and directly in a browser. A separate local browser page streams and controls the actual iOS Simulator app.

## Run locally

```sh
npm ci
cp .env.example .env.local
npm run ios -- --configuration Release
```

Select an iOS Simulator when prompted. The release app bundles its JavaScript and CC0 glTF asset; it does not require Metro to run.

Start the interactive simulator stream in a separate terminal, using its exact UDID from `xcrun simctl list devices available`:

```sh
npm run preview:ios -- <simulator-udid>
```

Keep that terminal open. The preview uses loopback port 8087 and a simulator-specific cleanup trap. Stopping it cleans up its streaming helper. It does not expose a host shell or open a public tunnel.

Build and serve the browser version:

```sh
npm run build:web -- --max-workers 2
python3 -m http.server 8086 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8086. **Open live iOS Simulator** opens the stream at http://127.0.0.1:8087. The two views are labeled separately: one executes the web build; the other streams a native app. `.env.local` supplies the local preview link and is not committed. Omit that variable for a web-only deployment.

The browser must support WebGPU. This proof reports an error instead of silently switching to WebGL.

## What to try

- Copper orbit: a Three.js PBR material and 64 GPU-instanced spheres.
- Bundled glTF: a textured avocado loaded from a self-contained GLB.
- Tap the object, change its finish, pause/resume, and reset the view.
- Reload the scene repeatedly; rotate the simulator; send it to the home screen and reopen it.
- Compare the actual native stream with the browser build, without treating simulator FPS as physical-device performance.

## Code

- `src/lib/proof-scene.ts`: shared scene construction, picking, updates, and resource disposal. No React Native imports.
- `packages/three-native/lib/analyze.mjs`: source analysis, actionable diagnostics, and generated browser-entry adapters.
- `packages/three-native/runtime/BrowserEntry.mjs`: native clock, renderer, viewport, and pointer bridge.
- `packages/three-native/runtime/ThreeView.tsx`: the reusable canvas, asset resolver, presentation, resizing, and app lifecycle.
- `src/components/proof-canvas.tsx`: adapts the reference scenes to the same public runtime.
- `src/app/index.tsx`: shared native/web controls and runtime measurements.
- `scripts/preview-ios.sh`: simulator streaming through pinned `serve-sim`.

The native pipeline is Three.js WebGPURenderer → React Native WebGPU → Dawn → Metal. JavaScript runs in Hermes; this is not JavaScript-to-Swift compilation. The browser uses the same renderer and scene through its own WebGPU implementation.

The project began with the [upstream Expo WebGPU template](https://github.com/wcandillon/react-native-webgpu/tree/main/apps/expo-webgpu), simplified to plain Three.js and updated to the pinned WebGPU/Three versions in `package-lock.json`. Native project files are generated from `app.config.js`; do not edit them by hand.

## Checks

Run the repository quality gates before sending a change:

```sh
npm ci
npm run check
```

Individual checks:

```sh
npm test
npm run typecheck
npm run lint
npm run doctor
npm run check:package
```

The [CI workflow](../.github/workflows/ci.yml) runs on pull requests and pushes to `main`. On Node 24 it checks lint (including CLI and test files), app and test types, the unit/integration suite, the browser build, and real tarball installs through npm and Bun. It also runs the tests on the minimum supported Node 22.18, reusing the same dependency install.

CI uses one standard Linux job with a five-minute timeout, npm caching, and cancellation of superseded runs. It does not upload build artifacts. Standard GitHub-hosted runners are [free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Tests use two workers; native signing, device automation, and GPU acceptance remain separate hardware checks. These are repository contributor checks and are not copied into generated adopter projects.

The Node suite checks scene geometry, picking, resource disposal, CLI overwrite protections, browser-entry execution, animation/resize/input adaptation, OrbitControls, imported-file diagnostics, and source preservation. It does not substitute for GPU rendering checks on iOS and the browser.

## Verified locally on 2026-11-04

- Node 24.15.0, Expo 57.0.31, React Native 0.86.3, Three.js 0.186.0, React Native WebGPU 0.21.1.
- Xcode 27.2, iPhone 18 Pro Simulator with iOS 27.2, Release builds.
- 41 scene/compiler/CLI/native-capability tests, lint, type checking, and Expo Doctor (21/21 checks with the native feature modules).
- Real tarball installation through both npm and Bun; config and host generation preserve the existing source.
- The reference app builds and renders with the native feature modules. The CLI-generated vanilla app also previously built and rendered natively; its updated native API import passes iOS bundle generation. The vanilla config now points directly to its existing `src/main.js` browser entry, including WebGLRenderer, DOM mounting, a render loop, and pointer input; no manual scene-factory adaptation is required.
- Reference GLB rendering, three model reloads, native scene changes from browser input, and background/resume through the browser's Home control.
- Browser WebGPU export, model loading, pause/finish controls, and narrow layout. All 13 device viewports and orientation/state preservation were checked.
- Combined MCP initialization exposes 52 tools; device discovery, Simulator scrolling, touch down/up, the location permission prompt, and simulated coordinates were exercised. Semantic `tap` needs the documented touch workaround in this environment.

The initial native checks caught two version/configuration requirements now owned by the toolkit: Expo's scene lifecycle opt-in for iOS 27, and Three r186 rather than r187 on this Hermes runtime. GLB samples parse fetched bytes directly to avoid the native `FileLoader` progress-stream incompatibility.

## Boundaries

This is a local demonstration, not a public device cloud. Public interactive simulator sessions need a hosted Mac, authentication, session isolation, and streaming capacity. A simulator stream is not a physical iPhone stream. Physical-device API behavior, performance, signing/distribution, Android, arbitrary third-party Three plugins, and App Store acceptance are not established by this proof. The initial native-feature pass had no connected iPhone. The subsequent UI-automation pass exercised a physical iPhone 17 Pro Max on iOS 27.2 through CLI and MCP; the Three.js hardware APIs and physical-device game performance remain separate checks.

The [Avocado model](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Avocado) is by Microsoft, distributed under CC0. Its source attribution is retained in `assets/models/Avocado-source.md`.
