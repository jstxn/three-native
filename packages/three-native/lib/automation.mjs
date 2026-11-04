import { spawn } from "node:child_process";
import { open, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { exists, prepareProject } from "./project.mjs";
import { noSymlink, validateTarget } from "./tooling.mjs";

export const automationDependencies = {
  appium: "3.9.0",
  "appium-xcuitest-driver": "12.22.8",
};
const elementKey = "element-6066-11e4-a52e-4f735466cecf";

export async function automationPaths(config, create = false) {
  const host = path.join(config.root, ".three-native");
  await noSymlink(host);
  await noSymlink(path.join(host, ".generated-by-three-native"));
  if (!(await exists(path.join(host, ".generated-by-three-native")))) {
    if (!create) throw new Error("Run three-native device setup first.");
    await prepareProject(config);
  }
  const directory = path.join(host, "automation");
  await noSymlink(directory);
  const marker = path.join(directory, ".generated-by-three-native");
  await noSymlink(marker);
  if (await exists(directory)) {
    if (!(await exists(marker)))
      throw new Error(
        "Refusing to overwrite an unowned .three-native/automation directory.",
      );
  } else if (create) {
    await mkdir(directory, { recursive: true });
    await writeFile(marker, "Three Native device automation tools.\n", {
      flag: "wx",
    });
  } else {
    throw new Error("Run three-native device setup first.");
  }
  for (const file of [
    "package.json",
    "session.json",
    "session.lock",
    "appium.log",
    "wda-build",
  ])
    await noSymlink(path.join(directory, file));
  return {
    directory,
    session: path.join(directory, "session.json"),
    script: path.join(directory, "node_modules/appium/index.js"),
  };
}

export function appiumEnvironment() {
  const env = {
    ...process.env,
    CMAKE_BUILD_PARALLEL_LEVEL: "2",
    MAKEFLAGS: "-j2",
  };
  // Appium discovers the pinned project dependencies only when APPIUM_HOME is unset.
  delete env.APPIUM_HOME;
  return env;
}
export async function setupAutomation(config, run) {
  const { directory, script } = await automationPaths(config, true);
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        name: "three-native-device-tools",
        private: true,
        dependencies: automationDependencies,
      },
      null,
      2,
    ) + "\n",
  );
  await run("npm", ["install", "--no-audit", "--no-fund"], directory, {
    env: appiumEnvironment(),
  });
  if (!(await exists(script)))
    throw new Error("Appium installation did not create its CLI.");
  return { directory, versions: automationDependencies };
}

export function sessionCapabilities(config, target, directory) {
  validateTarget(target);
  const id = target.device ?? target.simulator;
  if (!id)
    throw new Error(
      "Choose --device UDID (or --simulator UDID for a Simulator test).",
    );
  if (target.device && !config.ios.appleTeamId)
    throw new Error(
      "Set ios.appleTeamId in three-native.config.mjs to sign WebDriverAgent for your iPhone.",
    );
  const settings = config.ios.automation;
  return {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:udid": id,
    "appium:bundleId": config.ios.bundleIdentifier,
    "appium:noReset": true,
    "appium:fullReset": false,
    "appium:shouldTerminateApp": false,
    "appium:newCommandTimeout": 300,
    "appium:useNewWDA": false,
    "appium:waitForIdleTimeout": 1,
    "appium:wdaLocalPort": settings.wdaLocalPort,
    "appium:derivedDataPath": path.join(directory, "wda-build"),
    ...(settings.usePrebuiltWDA ? { "appium:usePrebuiltWDA": true } : {}),
    ...(target.device
      ? {
          "appium:xcodeOrgId": config.ios.appleTeamId,
          "appium:xcodeSigningId": "Apple Development",
          "appium:updatedWDABundleId": settings.wdaBundleIdentifier,
        }
      : {}),
  };
}

export class DeviceAutomation {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config;
    this.url = `http://127.0.0.1:${config.ios.automation.port}`;
    this.fetch = fetchImpl;
    this.ownsSession = false;
  }
  async request(method, endpoint, body, timeout = 30000) {
    let response;
    try {
      response = await this.fetch(this.url + endpoint, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      throw new Error(
        `Cannot reach Appium at ${this.url}. Run three-native device serve, then retry. ${error.name === "TimeoutError" ? "The request timed out." : ""}`,
        { cause: error },
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        `Appium returned an invalid response (HTTP ${response.status}).`,
      );
    }
    if (!response.ok || data.value?.error) {
      const error = new Error(
        `Appium: ${data.value?.message ?? data.value?.error ?? `HTTP ${response.status}`}`,
      );
      error.code = data.value?.error;
      throw error;
    }
    return data.value;
  }
  async saved() {
    const { session } = await automationPaths(this.config);
    try {
      return JSON.parse(await readFile(session, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  async status() {
    let server;
    try {
      server = await this.request("GET", "/status", undefined, 2000);
    } catch {
      return { url: this.url, ready: false, session: null };
    }
    if (!server?.build?.version)
      throw new Error(
        `Port ${this.config.ios.automation.port} is not an Appium server.`,
      );
    const saved = await this.saved();
    if (!saved) return { url: this.url, ready: server.ready, session: null };
    try {
      await this.request(
        "GET",
        `/session/${encodeURIComponent(saved.id)}/window/rect`,
        undefined,
        3000,
      );
    } catch (error) {
      if (error.code !== "invalid session id") throw error;
      return { url: this.url, ready: server.ready, session: null, stale: true };
    }
    return { url: this.url, ready: server.ready, session: saved };
  }
  async lock(action) {
    const { directory } = await automationPaths(this.config);
    const file = path.join(directory, "session.lock");
    let handle;
    try {
      handle = await open(file, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST")
        throw new Error(
          "A device session operation is already running. If its process exited, remove .three-native/automation/session.lock and retry.",
        );
      throw error;
    }
    try {
      return await action();
    } finally {
      await handle.close();
      await rm(file, { force: true });
    }
  }
  async connect(target) {
    return this.lock(async () => {
      const { directory, session } = await automationPaths(this.config);
      const capabilities = sessionCapabilities(this.config, target, directory);
      const current = await this.status();
      if (!current.ready)
        throw new Error(
          `Start Appium with three-native device serve (${this.url}).`,
        );
      if (current.session) {
        if (
          current.session.target !== capabilities["appium:udid"] ||
          current.session.bundleId !== this.config.ios.bundleIdentifier
        )
          throw new Error(
            "Another device or app is connected. Run three-native device disconnect first.",
          );
        return current.session;
      }
      const result = await this.request(
        "POST",
        "/session",
        { capabilities: { alwaysMatch: capabilities, firstMatch: [{}] } },
        300000,
      );
      if (!result?.sessionId)
        throw new Error("Appium did not return a session ID.");
      const record = {
        id: result.sessionId,
        target: capabilities["appium:udid"],
        environment: target.device ? "device" : "simulator",
        bundleId: this.config.ios.bundleIdentifier,
        url: this.url,
      };
      try {
        await writeFile(session, JSON.stringify(record, null, 2) + "\n", {
          mode: 0o600,
        });
      } catch (error) {
        await this.request(
          "DELETE",
          `/session/${encodeURIComponent(record.id)}`,
        ).catch(() => {});
        throw error;
      }
      this.ownsSession = true;
      return record;
    });
  }
  async command(method, endpoint, body) {
    const session = await this.saved();
    if (
      !session ||
      session.url !== this.url ||
      session.bundleId !== this.config.ios.bundleIdentifier
    )
      throw new Error(
        "No matching device session. Run three-native device connect --device UDID.",
      );
    return this.request(
      method,
      `/session/${encodeURIComponent(session.id)}${endpoint}`,
      body,
    );
  }
  async source() {
    return this.command("GET", "/source");
  }
  async snapshot() {
    const [source, rect] = await Promise.all([
      this.source(),
      this.command("GET", "/window/rect"),
    ]);
    return { session: await this.saved(), rect, source };
  }
  async screenshot() {
    return this.command("GET", "/screenshot");
  }
  async element(id) {
    if (typeof id !== "string" || !id.trim())
      throw new Error("An accessibility ID or label is required.");
    const found = await this.command("POST", "/element", {
      using: "accessibility id",
      value: id,
    });
    if (!found?.[elementKey]) throw new Error(`No element found for ${id}.`);
    return encodeURIComponent(found[elementKey]);
  }
  async editableElement(id) {
    const candidates = id
      ? await this.command("POST", "/elements", {
          using: "accessibility id",
          value: id,
        })
      : [await this.command("GET", "/element/active")];
    for (const candidate of candidates) {
      const element = encodeURIComponent(candidate?.[elementKey] ?? "");
      if (!element) continue;
      const type = await this.command(
        "GET",
        `/element/${element}/attribute/type`,
      );
      if (
        [
          "XCUIElementTypeTextField",
          "XCUIElementTypeSecureTextField",
          "XCUIElementTypeSearchField",
          "XCUIElementTypeTextView",
        ].includes(type)
      )
        return element;
    }
    throw new Error(
      "No editable text field found. Focus a field or use its unique accessibility ID.",
    );
  }
  async tap({ id, x, y }) {
    if (id !== undefined) {
      if (x !== undefined || y !== undefined)
        throw new Error(
          "Choose an accessibility ID or x/y coordinates, not both.",
        );
      return this.command(
        "POST",
        `/element/${await this.element(id)}/click`,
        {},
      );
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0)
      throw new Error(
        "Tap requires --id LABEL or nonnegative --x and --y coordinates in screen points.",
      );
    return this.command("POST", "/execute/sync", {
      script: "mobile: tap",
      args: [{ x, y }],
    });
  }
  async swipe(direction) {
    if (!["up", "down", "left", "right"].includes(direction))
      throw new Error("Swipe direction must be up, down, left, or right.");
    return this.command("POST", "/execute/sync", {
      script: "mobile: swipe",
      args: [{ direction }],
    });
  }
  async type({ id, text, clear = false }) {
    if (typeof clear !== "boolean") throw new Error("clear must be boolean.");
    if (typeof text !== "string" || (!text.length && !clear))
      throw new Error("Text must be nonempty unless clearing the field.");
    let element = await this.editableElement(id);
    // Keyboard keys can share a label with the field; select an editable node and reacquire after focus.
    await this.command("POST", `/element/${element}/click`, {});
    element = await this.editableElement(id);
    if (clear) {
      await this.command("POST", `/element/${element}/clear`, {});
      element = await this.editableElement(id);
    }
    if (text.length)
      return this.command("POST", `/element/${element}/value`, { text });
    return null;
  }
  async disconnect() {
    return this.lock(async () => {
      const { session } = await automationPaths(this.config);
      const saved = await this.saved();
      if (!saved) return { disconnected: true };
      if (
        saved.url !== this.url ||
        saved.bundleId !== this.config.ios.bundleIdentifier
      )
        throw new Error(
          "Saved session belongs to another app or server; restore that configuration before disconnecting.",
        );
      try {
        await this.request(
          "DELETE",
          `/session/${encodeURIComponent(saved.id)}`,
        );
      } catch (error) {
        if (error.code !== "invalid session id") throw error;
      }
      await rm(session, { force: true });
      this.ownsSession = false;
      return { disconnected: true };
    });
  }
}

export async function startAutomationServer(config, { quiet = false } = {}) {
  const paths = await automationPaths(config);
  if (!(await exists(paths.script)))
    throw new Error(
      "Run three-native device setup to install the pinned Appium tools.",
    );
  const api = new DeviceAutomation(config);
  if ((await api.status()).ready) return { owned: false, stop: async () => {} };
  const log = quiet
    ? await open(path.join(paths.directory, "appium.log"), "a", 0o600)
    : null;
  const child = spawn(
    process.execPath,
    [
      paths.script,
      "--address",
      "127.0.0.1",
      "--port",
      String(config.ios.automation.port),
      "--use-drivers",
      "xcuitest",
      "--log-level",
      "warn:error",
    ],
    {
      cwd: paths.directory,
      env: appiumEnvironment(),
      detached: true,
      stdio: ["ignore", log?.fd ?? "inherit", log?.fd ?? "inherit"],
    },
  );
  await log?.close();
  let startupError;
  child.once("error", (error) => {
    startupError = error;
  });
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (!child.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    if (child.exitCode === null && child.signalCode === null)
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(4000),
      ]);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  try {
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (child.exitCode !== null)
        throw new Error(
          `Appium exited (${child.exitCode}). Check .three-native/automation/appium.log.`,
        );
      if ((await api.status()).ready) return { owned: true, child, stop };
      await delay(200);
    }
    throw new Error(
      `Appium did not start. Check ${paths.directory}/appium.log.`,
    );
  } catch (error) {
    await stop();
    throw error;
  }
}
