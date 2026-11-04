import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { exists } from "./project.mjs";

export const toolingPackage = "xcodebuildmcp@2.7.0";
const exec = promisify(execFile);
export function validateTarget({ simulator, device }) {
  if (simulator && device)
    throw new Error("Choose --simulator or --device, not both.");
  for (const id of [simulator, device]) {
    if (
      id !== undefined &&
      (typeof id !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(id))
    )
      throw new Error("Use a device UDID from three-native devices.");
  }
}
async function noSymlink(file) {
  try {
    if ((await lstat(file)).isSymbolicLink())
      throw new Error(`Refusing to use tooling symlink: ${file}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
export async function configureTooling(config, target = {}) {
  validateTarget(target);
  const host = path.join(config.root, ".three-native");
  await noSymlink(host);
  const marker = path.join(host, ".generated-by-three-native");
  await noSymlink(marker);
  if (!(await exists(marker)))
    throw new Error(
      "Run three-native build ios or dev ios first to generate the native host.",
    );
  const ios = path.join(host, "ios");
  await noSymlink(ios);
  const workspaces = (await exists(ios))
    ? (await readdir(ios)).filter((name) => name.endsWith(".xcworkspace"))
    : [];
  if (workspaces.length !== 1)
    throw new Error(
      "Run three-native build ios or dev ios first to generate one iOS workspace.",
    );
  const workspacePath = path.join(ios, workspaces[0]);
  await noSymlink(workspacePath);
  const directory = path.join(host, ".xcodebuildmcp");
  const filename = path.join(directory, "config.yaml");
  await noSymlink(directory);
  await noSymlink(filename);
  await mkdir(directory, { recursive: true });
  const previous = (await exists(filename))
    ? JSON.parse(await readFile(filename, "utf8"))
    : {};
  const defaults = previous.sessionDefaults ?? {};
  const selected = target.simulator
    ? { simulatorId: target.simulator }
    : target.device
      ? { deviceId: target.device }
      : defaults.deviceId
        ? { deviceId: defaults.deviceId }
        : defaults.simulatorId
          ? { simulatorId: defaults.simulatorId }
          : {};
  const settings = {
    schemaVersion: 1,
    sentryDisabled: true,
    enabledWorkflows: ["simulator", "device", "ui-automation"],
    sessionDefaults: {
      workspacePath,
      scheme: path.basename(workspacePath, ".xcworkspace"),
      bundleId: config.ios.bundleIdentifier,
      derivedDataPath: path.join(host, "build"),
      extraArgs: ["-jobs", "2", "ONLY_ACTIVE_ARCH=YES"],
      ...selected,
    },
  };
  await writeFile(filename, JSON.stringify(settings, null, 2) + "\n");
  return { host, filename, settings };
}
export function normalizeDevices(simulators, devices) {
  return {
    simulators: Object.entries(simulators.devices ?? {}).flatMap(
      ([runtime, entries]) =>
        entries
          .filter((d) => d.isAvailable)
          .map((d) => ({ id: d.udid, name: d.name, state: d.state, runtime })),
    ),
    devices: (devices.result?.devices ?? [])
      .filter((d) => d.hardwareProperties?.reality === "physical")
      .map((d) => ({
        id: d.hardwareProperties.udid,
        name: d.deviceProperties?.name ?? "iOS device",
        model:
          d.hardwareProperties.marketingName ??
          d.hardwareProperties.productType,
        state: d.connectionProperties?.tunnelState ?? "unknown",
      })),
  };
}
export async function listDevices() {
  const directory = await mkdtemp(path.join(tmpdir(), "three-native-devices-"));
  try {
    const filename = path.join(directory, "devices.json");
    const [simulators, physical] = await Promise.all([
      exec("xcrun", ["simctl", "list", "devices", "available", "--json"], {
        timeout: 20000,
      }),
      exec(
        "xcrun",
        ["devicectl", "list", "devices", "--json-output", filename],
        { timeout: 20000 },
      )
        .then(async () => ({
          data: JSON.parse(await readFile(filename, "utf8")),
        }))
        .catch((error) => ({ error })),
    ]);
    return {
      ...normalizeDevices(JSON.parse(simulators.stdout), physical.data ?? {}),
      warnings: physical.error
        ? [
            "Physical device discovery failed. Check Xcode and device trust, then try again.",
          ]
        : [],
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
