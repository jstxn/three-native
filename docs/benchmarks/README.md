# Performance snapshot · November 4, 2026

These measurements describe the included reference scenes and a small existing-entry fixture. They establish a reproducible starting point; they are not a general Three.js, iPhone, or production-game benchmark.

[Raw samples](2026-11-04.json) · [Chart source](render.py) · [Root README](../../README.md#performance-you-can-inspect)

## Browser rendering

| Setting | Value |
| :-- | :-- |
| Machine | Apple M5 Pro, arm64 macOS |
| Browser | Headless Chromium 156.0.0.0 |
| WebGPU adapter | Apple, `metal-3`, not a fallback adapter |
| Source revision | `7b3271a4cc266e136d387d5fa3ba75c45b92ee07` |
| Libraries | Three.js 0.186.0, React Native WebGPU 0.21.1 |
| Preview viewport | 402 × 874 logical pixels, portrait |
| Actual canvas drawing buffer | **358 × 350 pixels**, device pixel ratio 1 |
| Sampling | One 20-second run per scene, after 2 seconds of warmup |
| Animation | Running; no scene changes during each sample |

The smaller drawing buffer matters: the demo places its canvas inside a larger page. These numbers do not represent full-screen, Retina-resolution iPhone rendering.

FPS samples come from the demo's displayed metric. The [runtime](../../packages/three-native/runtime/ThreeView.tsx) counts completed render/present callbacks and reports a rounded rate about once per second. We collected 19 displayed readings during each 20-second window. Both samples reported 60 FPS throughout; the display/animation cadence limits this test, so it does not establish maximum throughput.

The JSON also records a separate `requestAnimationFrame` observer. Its interval is callback cadence, **not GPU execution time**. Median callback intervals were 16.7 ms in both samples; p95 was 16.8 ms for Copper orbit and 16.7 ms for the glTF scene. Browser FPS, callback timing, and the demo GIF's 30 fps encoding are different measurements.

| Scene | Median / min / max reported FPS | Draw calls | Triangles |
| :-- | :-- | --: | --: |
| Copper orbit | 60 / 60 / 60 | 4 | 17,153 |
| Bundled glTF | 60 / 60 / 60 | 3 | 939 |

To repeat the HUD measurement:

1. Build and serve the reference app using the [local development steps](../development.md#run-locally).
2. Keep the preview visible. Select iPhone 18 Pro in portrait at DPR 1, choose the scene, and leave animation running.
3. After warmup, run this in the browser console. Capture both scenes separately; also record the browser, GPU adapter, viewport, and drawing-buffer size.

```js
const page = document.querySelector("iframe")?.contentWindow ?? window;
const samples = [];
const start = performance.now();
while (performance.now() - start < 20_000) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const metric = (label) => {
    const element = [...page.document.querySelectorAll("div")].find(
      (node) => node.childElementCount === 0 && node.textContent === label,
    );
    return Number(element.previousElementSibling.textContent.replaceAll(",", ""));
  };
  samples.push({
    fps: metric("Frames / second"),
    drawCalls: metric("Draw calls"),
    triangles: metric("Triangles"),
  });
}
console.table(samples);
```

## Local CLI latency

The fixture is a temporary copy of the [vanilla example's](../../examples/vanilla/src) two source files. It points at the repository's installed dependencies. The benchmark runs one warmup, then five measurements for each command. Each measurement starts a fresh Node 24.15.0 process; the filesystem cache is warm.

- **Source check:** `doctor --json`, including recursive local-import analysis. This omits the Xcode-version probe performed by plain `doctor`.
- **Host generation:** `prepare`, including analysis and writing the generated host. The generated directory is removed before each measured run.
- Neither command installs host dependencies, compiles an iOS binary, launches an app, or measures time to first frame.
- The harness verifies successful analysis, generated scene output, and unchanged SHA-256 hashes for both input files. The chart shows the median and full five-run range.

Run it from the repository after `npm ci`:

```sh
python3 docs/benchmarks/measure-cli.py
```

## Rebuild the chart

The chart uses the checked-in JSON, not a live benchmark or an external badge service. Plotting dependencies are only needed for manual regeneration and are not installed in CI:

```sh
uv run --with matplotlib==3.11.2 docs/benchmarks/render.py
```

The renderer writes `docs/media/performance.svg` and a local PNG under ignored `artifacts/` for inspection.

## What remains unmeasured

Physical-iPhone scene performance, sustained load, battery use, memory pressure, startup time, and larger production scenes remain unmeasured. Native Simulator rendering was previously validated functionally. Physical UI automation was validated separately on an iPhone 17 Pro Max using Settings, not by benchmarking the Three.js game. See [native verification notes](../development.md#verified-locally-on-2026-11-04) and [physical-device validation](../physical-device-automation.md#repository-validation-on-2026-11-04).
