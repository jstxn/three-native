"""Render the README chart from its checked-in measurement samples."""
import json
from pathlib import Path
import statistics

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

here = Path(__file__).resolve().parent
data = json.loads((here / "2026-11-04.json").read_text())
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "svg.fonttype": "path", "svg.hashsalt": "three-native-readme"})
navy, teal, copper, muted = "#183548", "#297d8d", "#b95c3c", "#64798b"
fig = plt.figure(figsize=(12, 5.35), dpi=120, facecolor="#f3f7f9")
fig.text(.045, .91, "A measured starting point.", color=navy, fontsize=24, weight="bold")
fig.text(.045, .855, "BROWSER WEBGPU + LOCAL CLI  /  APPLE M5 PRO  /  NOV 4, 2026", color=muted, fontsize=10)
for x in [.03, .51]:
    fig.patches.append(FancyBboxPatch((x, .20), .46, .57, boxstyle="round,pad=0.009,rounding_size=0.015", transform=fig.transFigure, facecolor="white", edgecolor="#dae5eb", linewidth=.8, zorder=-1))
left = fig.add_axes((.16, .36, .29, .27))
right = fig.add_axes((.66, .36, .27, .27))
fig.text(.05, .705, "Browser rendering", color=navy, fontsize=14, weight="bold")
fig.text(.53, .705, "From entry to generated host", color=navy, fontsize=14, weight="bold")

scenes = data["scenes"]
fps = [statistics.median(s["fps"] for s in scene["hudSamples"]) for scene in scenes]
left.barh([1, 0], fps, color=[copper, teal], height=.39, zorder=2)
left.set_yticks([1, 0], ["Copper orbit", "Bundled glTF"])
left.set_xlim(0, 73)
left.set_xticks([0, 30, 60], ["0", "30", "60 FPS"])
for y, value in zip([1, 0], fps):
    left.text(value + 1.5, y, f"{value:g}", va="center", color=navy, fontsize=13, weight="bold")

runs = [data["cli"]["doctorJsonMs"], data["cli"]["prepareMs"]]
medians = [statistics.median(values) for values in runs]
right.barh([1, 0], medians, color=[teal, navy], height=.39, zorder=2)
right.errorbar(medians, [1, 0], xerr=[[m-min(v) for m,v in zip(medians,runs)], [max(v)-m for m,v in zip(medians,runs)]], fmt="none", ecolor="#8aa1ae", capsize=3, zorder=3)
right.set_yticks([1, 0], ["Source check", "Host generation"])
right.set_xlim(0, max(max(v) for v in runs) * 1.35)
right.set_xlabel("milliseconds · lower is faster", color=muted, labelpad=8)
for y, median, values in zip([1, 0], medians, runs):
    right.text(max(values) + 8, y, f"{median:.0f} ms", va="center", color=navy, fontsize=12, weight="bold")

for ax in [left, right]:
    ax.set_ylim(-.55, 1.55)
    ax.set_axisbelow(True)
    ax.xaxis.grid(True, color="#e7eef2", linewidth=.7)
    ax.tick_params(axis="both", length=0, colors=muted, labelsize=10, pad=8)
    for spine in ax.spines.values():
        spine.set_visible(False)
fig.text(.05, .232, "20-second samples · 358 × 350 px · DPR 1", color=muted, fontsize=10)
fig.text(.53, .232, "5 runs · median + range · includes Node startup", color=muted, fontsize=9.5)
fig.text(.045, .115, "Browser measurements, not physical-iPhone FPS. CLI timings exclude dependency installs and Xcode compilation.", color=navy, fontsize=10)
fig.text(.045, .055, "Raw samples and reproduction steps: docs/benchmarks/", color=muted, fontsize=10)
output = here.parent / "media/performance.svg"
fig.savefig(output, format="svg", facecolor=fig.get_facecolor(), metadata={"Date": None})
output.write_text("\n".join(line.rstrip() for line in output.read_text().splitlines()) + "\n")
artifacts = here.parent.parent / "artifacts"
artifacts.mkdir(exist_ok=True)
fig.savefig(artifacts / "readme-performance.png", dpi=150, facecolor=fig.get_facecolor())
print(output)
