# Browser device sizes

The browser preview renders the app in an iframe with the selected device's full-screen logical width and height. Fit mode scales the iframe visually; it does not change `innerWidth`, `innerHeight`, or the scene's aspect ratio. Rotating swaps the dimensions and sends the normal resize event without restarting the app.

These standard-display presets were checked on 2026-11-04 against Apple's published display resolutions and the installed Xcode 27.2 CoreSimulator device definitions. The definitions supply `main-screen-width`, `main-screen-height`, and `main-screen-scale` in each `.simdevicetype/Contents/Resources/capabilities.plist`. Logical points are physical pixels divided by that scale. This local check matched all 13 presets.

| Config ID           | Device                     | Portrait points | Display pixels | Scale | Apple specifications                                |
| ------------------- | -------------------------- | --------------- | -------------- | ----- | --------------------------------------------------- |
| `iphone-18-pro`     | iPhone 18 Pro              | 402 × 874       | 1206 × 2622    | 3     | [Apple](https://www.apple.com/iphone-18-pro/specs/) |
| `iphone-18-pro-max` | iPhone 18 Pro Max          | 440 × 956       | 1320 × 2868    | 3     | [Apple](https://www.apple.com/iphone-18-pro/specs/) |
| `iphone-air`        | iPhone Air                 | 420 × 912       | 1260 × 2736    | 3     | [Apple](https://www.apple.com/iphone-air/specs/)    |
| `iphone-17`         | iPhone 17                  | 402 × 874       | 1206 × 2622    | 3     | [Apple](https://www.apple.com/iphone-17/specs/)     |
| `iphone-17-pro`     | iPhone 17 Pro              | 402 × 874       | 1206 × 2622    | 3     | [Apple](https://support.apple.com/en-us/125090)     |
| `iphone-17-pro-max` | iPhone 17 Pro Max          | 440 × 956       | 1320 × 2868    | 3     | [Apple](https://support.apple.com/en-us/125091)     |
| `iphone-16`         | iPhone 16                  | 393 × 852       | 1179 × 2556    | 3     | [Apple](https://www.apple.com/iphone-16/specs/)     |
| `iphone-16-plus`    | iPhone 16 Plus             | 430 × 932       | 1290 × 2796    | 3     | [Apple](https://support.apple.com/en-us/121030)     |
| `iphone-16-pro`     | iPhone 16 Pro              | 402 × 874       | 1206 × 2622    | 3     | [Apple](https://support.apple.com/en-us/121031)     |
| `iphone-16-pro-max` | iPhone 16 Pro Max          | 440 × 956       | 1320 × 2868    | 3     | [Apple](https://support.apple.com/en-us/121032)     |
| `iphone-se-3`       | iPhone SE (3rd generation) | 375 × 667       | 750 × 1334     | 2     | [Apple](https://support.apple.com/en-us/111866)     |
| `ipad-pro-11-m5`    | iPad Pro 11-inch (M5)      | 834 × 1210      | 1668 × 2420    | 2     | [Apple](https://www.apple.com/ipad-pro/specs/)      |
| `ipad-pro-13-m5`    | iPad Pro 13-inch (M5)      | 1032 × 1376     | 2064 × 2752    | 2     | [Apple](https://www.apple.com/ipad-pro/specs/)      |

Configure the initial selection; developers can switch it in the dropdown:

```js
export default {
  entry: "./src/main.js",
  preview: { device: "iphone-18-pro", orientation: "portrait" },
};
```

Run `three-native dev web` or serve `three-native build web` output. The reference app uses the same picker. The original project's independent web server is unaffected.

The preview tests responsive layout at standard full-screen sizes. It does not emulate display zoom, device pixel ratio, native safe-area insets, cutouts, the keyboard, hardware features, or GPU performance. Use the actual iOS app and Simulator for those checks. Native safe areas should come from the running platform, not hard-coded model tables. [Apple layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout).
