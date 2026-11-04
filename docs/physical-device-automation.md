# Physical iPhone UI automation: implementation research

Checked 2026-11-04 against official package metadata and release-specific Appium documentation. This is research, not evidence that a physical iPhone was exercised. No Appium installation, server, WDA build, or device session was run as part of this research.

## Recommended backend and versions

Keep XcodeBuildMCP for build/install/launch and add an Appium XCUITest adapter for physical UI inspection and interaction. XCUITest supports native apps on physical iOS devices and Simulators; it uses Apple's XCTest through WebDriverAgent (WDA). [Driver overview](https://github.com/appium/appium-xcuitest-driver/tree/v12.22.8).

Pin `appium@3.9.0` and `appium-xcuitest-driver@12.22.8`. The former is the current stable Appium release; the latter is the newest driver release declaring an Appium 3 peer dependency. Driver 13.0.6 requires Appium 4 beta and must not be installed implicitly through an unpinned `latest`. Both selected packages support Node `^20.19.0 || ^22.12.0 || >=24.0.0` and require npm 10+. Driver 12.22.8 pins `appium-webdriveragent@16.17.7`. [Appium 3.9.0 metadata](https://registry.npmjs.org/appium/3.9.0), [driver 12.22.8 metadata](https://registry.npmjs.org/appium-xcuitest-driver/12.22.8), [driver 13.0.6 metadata](https://registry.npmjs.org/appium-xcuitest-driver/13.0.6).

The selected driver supports iOS 27 and current Xcode; its compatibility tables should be checked when changing these pins. [Version-specific requirements](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/getting-started/system-requirements.md).

## Project-local installation

Two upstream-supported approaches work:

- Put both pinned packages in a private generated npm project, run npm install there, and launch `node node_modules/appium/index.js` with that directory as the working directory. **Unset `APPIUM_HOME` in the child environment**: Appium then discovers driver dependencies from that project's package.json.
- Or set `APPIUM_HOME` to a project-local directory and use Appium's extension CLI to install `xcuitest@12.22.8`. This creates Appium's extension manifest; installing ordinary npm dependencies alone while also setting `APPIUM_HOME` does not enable automatic project dependency discovery.

Use a generated directory beneath `.three-native/`, not a global installation. Bind the local server to `127.0.0.1`; no relaxed-security or insecure-feature flag is needed for these UI operations. Launching the real Node entry instead of an npm/npx wrapper also makes server process ownership easier to track. [Appium extension management](https://appium.io/docs/en/3.5/guides/managing-exts/), [Appium binary metadata](https://registry.npmjs.org/appium/3.9.0), [server arguments](https://appium.io/docs/en/3.5/reference/cli/server/).

## Physical device setup and capabilities

A real phone must be connected and trusted, have Developer Mode and Enable UI Automation enabled, and permit the WDA development runner. WDA must be signed for that device; a working development certificate/provisioning profile cannot be manufactured by the CLI. Disable Accessibility Zoom for predictable coordinates. [Device preparation](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/getting-started/device-setup.md), [Apple Developer Mode](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).

Create a W3C session with `capabilities.alwaysMatch`, for example:

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:udid": "DEVICE_UDID",
  "appium:bundleId": "com.example.game",
  "appium:xcodeOrgId": "TEAM123456",
  "appium:xcodeSigningId": "Apple Development",
  "appium:updatedWDABundleId": "com.example.game.WebDriverAgentRunner",
  "appium:noReset": true,
  "appium:fullReset": false,
  "appium:useNewWDA": false,
  "appium:shouldTerminateApp": false
}
```

The WDA provisioning profile must cover the final `.xctrunner` bundle identifier. `xcodeConfigFile` is an alternative to the team/signing pair, not something to combine with it. Appium owns the USB forwarding; `wdaLocalPort` selects the host port, normally 8100. Do not silently enable provisioning-device registration or automatic permission acceptance. [Capabilities](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/reference/capabilities.md), [automatic provisioning details](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/getting-started/provisioning-profile/auto-config.md).

## Minimal protocol surface

A small Node fetch client is sufficient; a second WebDriver client library is unnecessary for this scope. Responses use the W3C `value` envelope; detect protocol errors even when an HTTP request succeeds. [WebDriver endpoints](https://appium.io/docs/en/3.5/reference/api/webdriver/).

| Operation    | Request                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| Session      | `POST /session` with capabilities; `DELETE /session/:id` to finish               |
| Health       | `GET /status`                                                                    |
| UI hierarchy | `GET /session/:id/source`, returning native XML                                  |
| Screenshot   | `GET /session/:id/screenshot`, returning base64 PNG                              |
| Find target  | `POST /session/:id/element` with `{"using":"accessibility id","value":"target"}` |
| Press target | `POST /session/:id/element/:elementId/click`                                     |
| Type         | `POST /session/:id/element/:elementId/value` with `{"text":"hello"}`             |
| Bounds       | `GET /session/:id/window/rect` or `GET /session/:id/element/:elementId/rect`     |

For coordinate tapping, use `POST /session/:id/execute/sync` with `{"script":"mobile: tap","args":[{"x":100,"y":200}]}`. For a directional gesture use the same endpoint with `{"script":"mobile: swipe","args":[{"direction":"up"}]}`. The optional `elementId` scopes the gesture to a native element. `mobile: swipe` does not take explicit coordinates; use `mobile: dragFromToForDuration` when those are required. Use element/window coordinates from the same session, not raw screenshot pixels. [Version-specific gestures](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/reference/execute-methods.md), [locator strategies](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/reference/locator-strategies.md).

## Build and lifecycle boundaries

No generic extra-xcodebuild-arguments capability was found in the selected driver. For a bounded local validation build, prebuild WDA with `xcodebuild ... -jobs 2 build-for-testing`, then set `usePrebuiltWDA: true` and the same `derivedDataPath`. WDA then launches with `test-without-building`. Do not change global Xcode concurrency preferences. [Prebuilt WDA](https://github.com/appium/appium-xcuitest-driver/blob/v12.22.8/docs/guides/run-prebuilt-wda.md), [WDA build source](https://registry.npmjs.org/appium-webdriveragent/-/appium-webdriveragent-16.17.7.tgz).

Expose this same adapter through CLI and MCP. Keep sessions tied to the requested UDID and bundle, serialize operations, and clean up only owned sessions/processes. Use `noReset` and avoid reinstalling or terminating the user's app as an incidental inspection step. WDA startup can take longer than ordinary commands, so initialization and normal command timeouts should differ.

A native hierarchy can identify React Native/native controls, but individual Three.js meshes inside a WebGPU canvas are not native accessibility elements. Screenshot-guided coordinate input is the appropriate fallback there. That limitation should remain visible in the CLI/MCP contract.

## Repository validation on 2026-11-04

The implementation was exercised on a connected iPhone 17 Pro Max running iOS 27.2. WebDriverAgent was built and signed with two Xcode workers. CLI checks captured the real screen and native hierarchy, navigated from Settings to General by accessibility ID, tapped screen coordinates, and swiped. A real stdio MCP client exercised the eight device UI tools, typed a temporary search string, verified it in the hierarchy, captured a screenshot, and cleared the text. These checks used Settings and did not change its values. Private screenshots and device identifiers remain in ignored local artifacts.

This validates the physical UI transport, not every iPhone/iOS combination or a newly signed Three.js game build. The application's hardware API and performance checks remain separate.
