"""Measure the current vanilla example without modifying its source."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
import time

root = Path(__file__).resolve().parents[2]
cli = root / "packages/three-native/bin/three-native.mjs"


def run(cwd, *args):
    start = time.perf_counter()
    result = subprocess.run(
        ["node", str(cli), *args], cwd=cwd, check=True, capture_output=True, text=True
    )
    return round((time.perf_counter() - start) * 1000, 3), result.stdout


def hashes(work):
    return {
        str(path.relative_to(work)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (work / "src").rglob("*") if path.is_file()
    }


with TemporaryDirectory(prefix="three-native-benchmark-") as temporary:
    work = Path(temporary)
    shutil.copytree(root / "examples/vanilla/src", work / "src")
    (work / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
    (work / "three-native.config.mjs").write_text(
        'export default {entry:"./src/main.js",name:"Vanilla Three Demo"};\n'
    )
    before = hashes(work)
    run(work, "doctor", "--json")
    run(work, "prepare")
    timings = {"doctorJsonMs": [], "prepareMs": []}
    for _ in range(5):
        elapsed, report = run(work, "doctor", "--json")
        analysis = json.loads(report)
        assert analysis["ok"] and analysis["mode"] == "entry"
        timings["doctorJsonMs"].append(elapsed)
        shutil.rmtree(work / ".three-native")
        elapsed, _ = run(work, "prepare")
        assert (work / ".three-native/scene.ts").is_file()
        timings["prepareMs"].append(elapsed)
    assert before == hashes(work), "Benchmark changed the input source"
    print(json.dumps({
        "runs": 5, "warmupRuns": 1, "includesNodeStartup": True,
        "nativeDependenciesInstalled": False, "nativeCompilationIncluded": False,
        "sourceFilesUnchanged": len(before), "sourceFileHashes": before,
        "filesScanned": analysis["files"],
        "node": subprocess.check_output(["node", "--version"], text=True).strip(),
        **timings,
    }, indent=2))
