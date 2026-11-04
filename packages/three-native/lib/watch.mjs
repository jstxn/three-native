import { statSync } from "node:fs";
import path from "node:path";
import { analyzeProject } from "./analyze.mjs";
import { prepareProject } from "./project.mjs";

function fingerprint(file) {
  try {
    const stat = statSync(file);
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}

export function watchProject(config, initialReport, onReport) {
  const files = new Map();
  let closed = false,
    running = false;
  function updateFiles(report) {
    const paths = report.files.map((file) => path.resolve(config.root, file));
    for (const file of files.keys())
      if (!paths.includes(file)) files.delete(file);
    for (const file of paths)
      if (!files.has(file)) files.set(file, fingerprint(file));
  }
  updateFiles(initialReport);
  // Directory events can coalesce consecutive saves on macOS; compare source fingerprints.
  const timer = setInterval(async () => {
    if (closed || running) return;
    running = true;
    try {
      let changed = false;
      for (const [file, previous] of files) {
        const current = fingerprint(file);
        if (current !== previous) {
          changed = true;
          files.set(file, current);
        }
      }
      if (!changed) return;
      const report = await analyzeProject(config);
      if (!closed && report.ok) await prepareProject(config, report);
      if (!closed) {
        updateFiles(report);
        onReport(report);
      }
    } catch (error) {
      if (!closed) onReport(null, error);
    } finally {
      running = false;
    }
  }, 500);
  return () => {
    closed = true;
    clearInterval(timer);
  };
}
