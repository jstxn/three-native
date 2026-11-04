#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { formatDiagnostic } from "../lib/analyze.mjs";
import {
  configureTooling,
  listDevices,
  toolingPackage,
  validateTarget,
} from "../lib/tooling.mjs";
import { watchProject } from "../lib/watch.mjs";
import {
  configName,
  exists,
  initProject,
  inspectProject,
  loadConfig,
  packageRoot,
  prepareProject,
} from "../lib/project.mjs";

const help = `Three Native — Three.js scenes on native iOS and the web

  three-native init [--entry src/native-scene.ts] [--name "My App"] [--bundle-id com.example.app]
  three-native doctor [--json]
  three-native prepare
  three-native dev web|ios [--simulator UDID | --device UDID] [--port 8081]
  three-native devices [--json]
  three-native mcp [--project PATH] [--simulator UDID | --device UDID]
  three-native tools <workflow> <command> [upstream options]
  three-native logs ios --device UDID --restart
  three-native build web|ios
  three-native preview ios --simulator UDID [--port 8087]

Configure ${configName}. Native hosts are generated in .three-native/.
iOS builds require macOS and Xcode. Publishing and App Store submission are separate.
`;
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        CMAKE_BUILD_PARALLEL_LEVEL: "2",
        MAKEFLAGS: "-j2",
        XCODEBUILDMCP_SENTRY_DISABLED: "true",
      },
    });
    const forward = (signal) => child.kill(signal);
    const interrupt = () => forward("SIGINT");
    const terminate = () => forward("SIGTERM");
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      if (code === 0 && !signal) resolve(code);
      else
        reject(
          new Error(`${command} ${args[0] ?? ""} exited ${signal ?? code}.`),
        );
    });
  });
}
async function install(host, hash) {
  const marker = path.join(host, ".installed-dependencies");
  if (
    (await exists(path.join(host, "node_modules/expo/package.json"))) &&
    (await exists(marker)) &&
    (await readFile(marker, "utf8")) === hash
  )
    return;
  await run("npm", ["install", "--no-audit", "--no-fund"], host);
  await writeFile(marker, hash);
}
async function main() {
  if (process.argv[2] === "tools") {
    const args = process.argv.slice(process.argv[3] === "--" ? 4 : 3);
    if (!args.length)
      throw new Error(
        "Use three-native tools <workflow> <command>, for example: tools simulator snapshot-ui.",
      );
    const { host } = await configureTooling(await loadConfig(process.cwd()));
    await run("npx", ["--yes", toolingPackage, ...args], host);
    return;
  }
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      json: { type: "boolean" },
      entry: { type: "string" },
      name: { type: "string" },
      "bundle-id": { type: "string" },
      simulator: { type: "string" },
      device: { type: "string" },
      project: { type: "string" },
      restart: { type: "boolean" },
      port: { type: "string" },
    },
  });
  if (values.version) {
    console.log(
      JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"))
        .version,
    );
    return;
  }
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const [command, platform] = positionals;
  const cwd = path.resolve(values.project ?? process.cwd());
  validateTarget(values);
  if (command === "devices") {
    if (process.platform !== "darwin")
      throw new Error("iOS device discovery requires macOS and Xcode.");
    const devices = await listDevices();
    if (values.json) console.log(JSON.stringify(devices, null, 2));
    else {
      for (const [kind, entries] of [
        ["Simulator", devices.simulators],
        ["Physical", devices.devices],
      ]) {
        for (const entry of entries)
          console.log(`${kind}  ${entry.id}  ${entry.name}  (${entry.state})`);
      }
      for (const warning of devices.warnings) console.error(warning);
    }
    return;
  }
  if (command === "mcp" || command === "logs") {
    if (process.platform !== "darwin")
      throw new Error("iOS tooling requires macOS and Xcode.");
    const config = await loadConfig(cwd);
    if (command === "logs") {
      if (platform !== "ios" || !values.device || !values.restart)
        throw new Error(
          "Use three-native logs ios --device UDID --restart. This restarts the app and streams its stdout.",
        );
      await run(
        "xcrun",
        [
          "devicectl",
          "device",
          "process",
          "launch",
          "--device",
          values.device,
          "--console",
          "--terminate-existing",
          config.ios.bundleIdentifier,
        ],
        cwd,
      );
    } else {
      const { host } = await configureTooling(config, values);
      await run("npx", ["--yes", toolingPackage, "mcp"], host);
    }
    return;
  }
  if (command === "init") {
    console.log(
      `Created ${await initProject(cwd, values)}\nNext: three-native doctor`,
    );
    return;
  }
  if (command === "preview") {
    if (platform !== "ios" || !values.simulator)
      throw new Error("Use three-native preview ios --simulator <UDID>.");
    const port = values.port ?? "8087";
    if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
      throw new Error("port must be an integer from 1024 to 65535.");
    await run(
      "bash",
      [path.join(packageRoot, "bin/preview-ios.sh"), values.simulator, port],
      cwd,
    );
    return;
  }
  if (!["doctor", "prepare", "dev", "build"].includes(command))
    throw new Error(`Unknown command: ${command}\n${help}`);
  const config = await loadConfig(cwd);
  const report = await inspectProject(config);
  if (values.json && command !== "doctor")
    throw new Error("--json is only supported by doctor.");
  if (command === "doctor" && values.json) {
    const { code: _code, ...summary } = report;
    console.log(JSON.stringify(summary, null, 2));
    if (!report.ok) process.exitCode = 1;
    return;
  }
  console.log(
    `Entry: ${config.entry}\nMode: ${report.mode === "entry" ? "automatic browser entry" : "createScene factory"}\nScanned ${report.files.length} local source file(s).`,
  );
  for (const diagnostic of report.diagnostics)
    console.log(formatDiagnostic(diagnostic));
  if (!report.ok)
    throw new Error(
      "Compatibility check failed. Fix the errors above before generating or building the native host.",
    );
  if (command === "doctor") {
    if (process.platform === "darwin")
      await run("xcodebuild", ["-version"], cwd);
    else
      console.log(
        "iOS builds need macOS and Xcode. Web builds are available here.",
      );
    console.log(
      "Source checks passed. Runtime and third-party dependency compatibility still require iOS verification.",
    );
    return;
  }
  if (command !== "prepare" && !["ios", "web"].includes(platform))
    throw new Error(
      `Use three-native ${command} ios or three-native ${command} web.`,
    );
  if (platform === "ios" && process.platform !== "darwin")
    throw new Error("Native iOS builds require macOS and Xcode.");
  const { host, installHash } = await prepareProject(config, report);
  console.log(`Generated ${host}`);
  if (command === "prepare") return;
  await install(host, installHash);
  const expo = path.join(host, "node_modules/expo/bin/cli");
  if (command === "dev") {
    const stopWatching = watchProject(config, report, (next, error) => {
      if (error) console.error(`three-native: ${error.message}`);
      else {
        for (const diagnostic of next.diagnostics)
          if (diagnostic.severity !== "info")
            console.log(formatDiagnostic(diagnostic));
        console.log(
          next.ok
            ? "Three Native: regenerated entry; Metro will reload."
            : "Three Native: fix the errors above; keeping the last successful entry.",
        );
      }
    });
    try {
      if (platform === "web")
        await run(
          process.execPath,
          [
            expo,
            "start",
            "--web",
            "--port",
            values.port ?? "8081",
            "--max-workers",
            "2",
          ],
          host,
        );
      else
        await run(
          process.execPath,
          [
            expo,
            "run:ios",
            ...(values.simulator || values.device
              ? ["--device", values.simulator ?? values.device]
              : []),
            ...(values.port ? ["--port", values.port] : []),
          ],
          host,
        );
    } finally {
      stopWatching();
    }
    return;
  }
  if (platform === "web") {
    await run(
      process.execPath,
      [expo, "export", "--platform", "web", "--max-workers", "2"],
      host,
    );
    console.log(`Web output: ${path.join(host, "dist")}`);
  } else {
    await run(process.execPath, [expo, "prebuild", "--platform", "ios"], host);
    const workspace = (await readdir(path.join(host, "ios"))).find((file) =>
      file.endsWith(".xcworkspace"),
    );
    if (!workspace) throw new Error("Expo did not generate an iOS workspace.");
    const args = [
      "-workspace",
      path.join("ios", workspace),
      "-scheme",
      path.basename(workspace, ".xcworkspace"),
      "-configuration",
      "Release",
      "-sdk",
      "iphonesimulator",
      "-destination",
      "generic/platform=iOS Simulator",
      "-derivedDataPath",
      "build",
      "-jobs",
      "2",
      "ONLY_ACTIVE_ARCH=YES",
      `ARCHS=${process.arch === "arm64" ? "arm64" : "x86_64"}`,
      "build",
    ];
    await run("xcodebuild", args, host);
    console.log(
      `iOS Simulator output: ${path.join(host, "build/Build/Products/Release-iphonesimulator")}`,
    );
  }
}
main().catch((error) => {
  console.error(`three-native: ${error.message}`);
  process.exitCode = 1;
});
