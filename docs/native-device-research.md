# Native device features and developer control

Research checked 2026-11-04 against Expo SDK 57, the installed Xcode tools, and the published `xcodebuildmcp@2.7.0` package. This document describes the integration choices and their limits; it is not a record of physical-device validation.

## Two separate layers

A Three.js scene needs an **app runtime API** to use the phone's hardware. A developer needs **CLI/MCP tools** to build, install, launch, inspect, and test that app. MCP alone does not turn browser JavaScript into native code or expose a phone's camera to the browser. Keep these layers explicit in the product.

## App runtime: Expo SDK 57

Use the existing React Native host and Expo modules; no custom Swift bridge is necessary for this first proof. Install native dependencies through `expo install` and rebuild the native app after adding them. The SDK 57 package map specifies `expo-device ~57.0.2`, `expo-haptics ~57.0.3`, `expo-sensors ~57.0.3`, `expo-image-picker ~57.0.20`, and `expo-location ~57.0.22`. [Expo installation guidance](https://docs.expo.dev/versions/v57.0.0/), [SDK 57 package map](https://github.com/expo/expo/blob/sdk-57/packages/expo/bundledNativeModules.json).

| Feature         | Native API for the proof                                                                                          | Required behavior                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Device identity | `Platform.OS`, then `Device.isDevice` / `modelName`                                                               | Distinguish browser, Simulator, and physical device. On web, `Device.isDevice` is always `true`, so it cannot classify the environment alone.                                     |
| Haptics         | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`                                                          | A completed call does not prove a vibration occurred. iOS can suppress feedback in Low Power Mode, during camera/dictation use, or through settings.                              |
| Motion          | `Accelerometer.isAvailableAsync()`, `requestPermissionsAsync()`, `setUpdateInterval(ms)`, `addListener(callback)` | Check availability; handle permission denial; return cleanup calling that subscription's `remove()`. Measurements contain x/y/z in g and a timestamp. iOS support is device-only. |
| Location        | `requestForegroundPermissionsAsync()`, `getCurrentPositionAsync()`                                                | Request on a user action. Mark Simulator locations as simulated. Location services must be enabled; a current fix can take time.                                                  |
| Camera photo    | `requestCameraPermissionsAsync()`, `launchCameraAsync({ mediaTypes: ['images'] })`                                | Presents the system camera UI. Handle `{ canceled, assets }`; cancellation is normal. Physical-device validation is required.                                                     |

Sources: [Device](https://docs.expo.dev/versions/v57.0.0/sdk/device/), [Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/), [Accelerometer](https://docs.expo.dev/versions/v57.0.0/sdk/accelerometer/), [Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [ImagePicker](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/).

Generate native usage descriptions through Expo config plugins: `expo-sensors.motionPermission`, `expo-location.locationWhenInUsePermission`, and `expo-image-picker.cameraPermission`. A still-photo proof can set ImagePicker's `microphonePermission: false`. Do not enable background location merely to obtain a foreground fix. [Sensors configuration](https://docs.expo.dev/versions/v57.0.0/sdk/sensors/), [Location configuration](https://docs.expo.dev/versions/v57.0.0/sdk/location/#configuration-in-app-config), [ImagePicker configuration](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/#configuration-in-app-config).

A small Three Native facade can report unsupported environments and permission failures consistently, while returning Expo's data unchanged. A browser device-size preview should not claim to supply iPhone hardware: web camera/location/motion would refer to the browser's own machine, not the selected iPhone model.

## Developer tools: pin XcodeBuildMCP 2.7.0

Reuse the existing upstream CLI and MCP server. The current upstream has renamed itself MobileBuildMCP and changed the config directory; pinning the verified release avoids mixing incompatible documentation with executable behavior. The npm release metadata identifies source commit `c79f4eb9b7b96680d5a774acb0ae525416d254fb`. [Published 2.7.0 package](https://registry.npmjs.org/xcodebuildmcp/2.7.0), [release tarball](https://registry.npmjs.org/xcodebuildmcp/-/xcodebuildmcp-2.7.0.tgz), [current upstream](https://github.com/getsentry/MobileBuildMCP).

In **2.7.0**, run commands with the generated host as the working directory and create `.xcodebuildmcp/config.yaml` there. JSON syntax is accepted by its YAML parser. The release's `runtime-config-schema.js`, `project-config.js`, `session-defaults-schema.js`, and `sentry-config.js` establish this shape:

```yaml
schemaVersion: 1
sentryDisabled: true
enabledWorkflows: [simulator, device, ui-automation]
sessionDefaults:
  workspacePath: /absolute/project/.three-native/ios/MyGame.xcworkspace
  scheme: MyGame
  bundleId: com.example.mygame
  simulatorId: YOUR_SIMULATOR_UUID
  derivedDataPath: /absolute/project/.three-native/build
  extraArgs: ["-jobs", "2", "ONLY_ACTIVE_ARCH=YES"]
```

For a physical target use `deviceId` instead of `simulatorId`. Set `XCODEBUILDMCP_SENTRY_DISABLED=true` in the child environment as well. Keep generated config local and do not edit the developer's global MCP configuration. These settings select defaults; they are not a security sandbox. An MCP client can request other operations permitted by the enabled workflows.

Verified CLI spellings in the pinned executable:

```sh
npx --yes xcodebuildmcp@2.7.0 device list --output json
npx --yes xcodebuildmcp@2.7.0 simulator list --output json
npx --yes xcodebuildmcp@2.7.0 simulator build-and-run
npx --yes xcodebuildmcp@2.7.0 simulator snapshot-ui --output json
npx --yes xcodebuildmcp@2.7.0 ui-automation touch --element-ref REF_FROM_SNAPSHOT --down --up --delay 0.15
npx --yes xcodebuildmcp@2.7.0 simulator screenshot --return-format path
npx --yes xcodebuildmcp@2.7.0 device install --app-path /path/to/MyGame.app
npx --yes xcodebuildmcp@2.7.0 device launch
npx --yes xcodebuildmcp@2.7.0 mcp
```

The `device` workflow supports physical build, install, launch, stop, and test. The `ui-automation` workflow explicitly supports **Simulators only**; its element references come from a fresh runtime snapshot. Do not advertise physical-device tap/swipe/screenshot automation from this integration. These boundaries are defined in the release's `manifests/workflows/device.yaml` and `ui-automation.yaml`. [Release tarball](https://registry.npmjs.org/xcodebuildmcp/-/xcodebuildmcp-2.7.0.tgz).

Simulator launches automatically capture runtime logs and return their file path. In 2.7.0, `device launch` returns a PID but does not capture physical app stdout: `build/utils/device-steps.js` launches without `--console`. For an explicit restart-and-stream command, Apple's installed `devicectl device process launch --help` documents:

```sh
xcrun devicectl device process launch --device DEVICE_UDID \
  --console --terminate-existing com.example.mygame
```

This restarts the app and waits, streaming stdout; catchable signals are forwarded to the app. It is not a read-only attachment to an existing process or a complete unified-system-log feed. Verify this option against the installed Xcode CLI before relying on it.

Physical deployment requires a paired/trusted device, Developer Mode where required, and valid signing. Upstream can build and deploy after signing is configured; it cannot create the developer's signing team or provisioning setup. [Upstream device-signing guide](https://www.mobilebuildmcp.com/docs/device-signing).

## Validation boundary

The host machine has a booted iPhone Simulator. Its known physical iPhone was unavailable during this investigation. Simulator checks can establish layout, permissions, API error handling, generated project configuration, and simulated location flow. Camera capture, actual haptic feedback, motion measurements, and signed physical deployment remain hardware checks. The browser's selected model and a streamed Simulator remain distinct from a physical phone.

## Observed input behavior

The local Simulator check found that upstream semantic `tap` could report success without changing the app or dismissing a native permission prompt. The coordinate-based `touch` command with `--down --up --delay 0.15` did activate controls and grant the permission. Use that verified command, refresh element references after layout changes, and verify the screen result. A simulated location supplied with `simctl location` was returned through the native facade and labeled as simulated.
