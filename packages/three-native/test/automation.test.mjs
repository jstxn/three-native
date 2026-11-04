import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initProject, loadConfig } from "../lib/project.mjs";
import {
  DeviceAutomation,
  automationPaths,
  sessionCapabilities,
  setupAutomation,
} from "../lib/automation.mjs";
import { deviceTools, serveDeviceMcp } from "../lib/automation-mcp.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "three-native-ui-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initProject(root);
  const config = await loadConfig(root);
  config.ios.appleTeamId = "ABC1234567";
  await automationPaths(config, true);
  const requests = [];
  let current = false;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({
      method: req.method,
      path: req.url,
      body: body ? JSON.parse(body) : undefined,
    });
    let value = null;
    if (
      req.url.startsWith("/session/test-session") &&
      !current &&
      req.method !== "DELETE"
    ) {
      res.statusCode = 404;
      value = { error: "invalid session id", message: "Expired" };
    } else if (req.url === "/status")
      value = { ready: true, build: { version: "3.9.0" } };
    else if (req.url === "/session" && req.method === "POST") {
      current = true;
      value = { sessionId: "test-session" };
    } else if (req.url === "/session/test-session" && req.method === "GET") {
      if (!current) {
        res.statusCode = 404;
        value = { error: "invalid session id", message: "Expired" };
      } else value = { capabilities: {} };
    } else if (req.url.endsWith("/source"))
      value = '<App><Button name="Hit" /></App>';
    else if (req.url.endsWith("/window/rect"))
      value = { x: 0, y: 0, width: 440, height: 956 };
    else if (req.url.endsWith("/screenshot")) value = "aW1hZ2U=";
    else if (req.url.endsWith("/elements"))
      value = [
        { "element-6066-11e4-a52e-4f735466cecf": "keyboard-search" },
        { "element-6066-11e4-a52e-4f735466cecf": "element/1" },
      ];
    else if (req.url.endsWith("/attribute/type"))
      value = req.url.includes("keyboard-search")
        ? "XCUIElementTypeButton"
        : "XCUIElementTypeTextField";
    else if (
      req.url.endsWith("/element") ||
      req.url.endsWith("/element/active")
    )
      value = { "element-6066-11e4-a52e-4f735466cecf": "element/1" };
    else if (req.method === "DELETE") current = false;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ value }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  config.ios.automation.port = server.address().port;
  return {
    root,
    config,
    requests,
    api: new DeviceAutomation(config),
    expire: () => {
      current = false;
    },
  };
}

test("physical sessions preserve app data and carry explicit signing and device capabilities", async (t) => {
  const { config, api, requests } = await fixture(t);
  const session = await api.connect({ device: "00008150-TEST12345678" });
  assert.equal(session.environment, "device");
  const caps = requests.find((r) => r.path === "/session").body.capabilities
    .alwaysMatch;
  assert.equal(caps["appium:udid"], session.target);
  assert.equal(caps["appium:xcodeOrgId"], config.ios.appleTeamId);
  assert.equal(caps["appium:xcodeSigningId"], "Apple Development");
  assert.equal(caps["appium:noReset"], true);
  assert.equal(caps["appium:fullReset"], false);
  assert.equal(caps["appium:shouldTerminateApp"], false);
  assert.equal(caps["appium:autoAcceptAlerts"], undefined);
  assert.equal((await api.connect({ device: session.target })).id, session.id);
  assert.equal(requests.filter((r) => r.path === "/session").length, 1);
  await assert.rejects(
    api.connect({ device: "00008150-OTHER1234567" }),
    /disconnect first/,
  );
  await api.disconnect();
  assert.equal((await api.status()).session, null);
});

test("UI commands use WebDriver routes, screen points, and encoded element IDs", async (t) => {
  const { api, requests } = await fixture(t);
  await api.connect({ simulator: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" });
  const snapshot = await api.snapshot();
  assert.equal(snapshot.rect.width, 440);
  assert.match(snapshot.source, /Button/);
  assert.equal(await api.screenshot(), "aW1hZ2U=");
  await api.tap({ id: "Hit" });
  assert.ok(
    requests.some((r) => r.path.endsWith("/element/element%2F1/click")),
  );
  await api.tap({ x: 20, y: 40 });
  await api.swipe("up");
  await api.type({ id: "Search", text: "hello", clear: true });
  await api.type({ text: "", clear: true });
  const clearCall = requests.findLastIndex((r) => r.path.endsWith("/clear"));
  assert.ok(requests[clearCall].path.includes("element%2F1"));
  assert.ok(
    !requests.some(
      (r) =>
        r.method === "POST" && r.path.includes("/element/keyboard-search/"),
    ),
  );
  assert.ok(
    requests.some(
      (r) =>
        r.path.endsWith("/attribute/type") &&
        r.path.includes("keyboard-search"),
    ),
  );
  assert.ok(
    requests.some(
      (r) => r.body?.script === "mobile: tap" && r.body.args[0].x === 20,
    ),
  );
  assert.ok(
    requests.some(
      (r) =>
        r.body?.script === "mobile: swipe" && r.body.args[0].direction === "up",
    ),
  );
  assert.ok(requests.some((r) => r.path.endsWith("/clear")));
  assert.ok(requests.some((r) => r.body?.text === "hello"));
  const before = requests.length;
  await assert.rejects(api.tap({ x: -1, y: 2 }), /nonnegative/);
  await assert.rejects(api.tap({ id: "Hit", x: 1 }), /not both/);
  await assert.rejects(api.swipe("diagonal"), /direction/);
  await assert.rejects(api.type({ text: "hi", clear: "yes" }), /boolean/);
  assert.equal(requests.length, before);
});

test("stale sessions reconnect and unavailable servers fail with actionable errors", async (t) => {
  const { api, expire } = await fixture(t);
  await api.connect({ device: "00008150-TEST12345678" });
  expire();
  assert.equal((await api.status()).stale, true);
  await api.connect({ device: "00008150-TEST12345678" });
  const offline = new DeviceAutomation(api.config, {
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.equal((await offline.status()).ready, false);
  await assert.rejects(offline.source(), /device serve/);
});

test("generated automation files reject symlinks and unfinished session operations", async (t) => {
  const { root, config, api } = await fixture(t);
  const paths = await automationPaths(config);
  await writeFile(path.join(paths.directory, "session.lock"), "busy");
  await assert.rejects(
    api.connect({ device: "00008150-TEST12345678" }),
    /already running/,
  );
  await rm(path.join(paths.directory, "session.lock"));
  const outside = path.join(root, "keep.json");
  await writeFile(outside, "important");
  await symlink(outside, paths.session);
  await assert.rejects(
    api.connect({ device: "00008150-TEST12345678" }),
    /symlink/,
  );
  assert.equal(await readFile(outside, "utf8"), "important");
});

test("configuration rejects unsafe ports and unsigned physical targets", async (t) => {
  const { config } = await fixture(t);
  delete config.ios.appleTeamId;
  assert.throws(
    () =>
      sessionCapabilities(
        config,
        { device: "00008150-TEST12345678" },
        "/tmp/wda",
      ),
    /appleTeamId/,
  );
  const sim = sessionCapabilities(
    config,
    { simulator: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" },
    "/tmp/wda",
  );
  assert.equal(sim["appium:xcodeOrgId"], undefined);
  await writeFile(
    path.join(config.root, "three-native.config.mjs"),
    "export default {entry:'./src/native-scene.ts',ios:{automation:{port:80}}};",
  );
  await assert.rejects(loadConfig(config.root), /port/);
});

test("MCP adds device UI tools while preserving and forwarding Xcode tools", async (t) => {
  const { config, api } = await fixture(t);
  await api.connect({ simulator: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" });
  const host = path.join(config.root, ".three-native");
  await mkdir(path.join(host, "ios/Test.xcworkspace"), { recursive: true });
  const calls = [];
  const upstream = {
    listTools: async () => ({
      tools: [
        {
          name: "build_device",
          description: "Build",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: async (params) => {
      calls.push(params);
      return { content: [{ type: "text", text: "built" }] };
    },
    close: async () => {},
  };
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  const controller = await serveDeviceMcp(
    config,
    {},
    { upstreamClient: upstream, transport: serverTransport },
  );
  const client = new Client({ name: "test", version: "1" });
  t.after(async () => {
    await client.close();
    await controller.close();
  });
  await client.connect(clientTransport);
  assert.equal((await client.listTools()).tools.length, deviceTools.length + 1);
  await client.callTool({ name: "build_device", arguments: {} });
  assert.equal(calls.length, 1);
  const snapshot = await client.callTool({
    name: "device_ui_snapshot",
    arguments: {},
  });
  assert.equal(
    JSON.parse(snapshot.content[0].text).session.environment,
    "simulator",
  );
  const bad = await client.callTool({
    name: "device_ui_tap",
    arguments: { x: -1, y: 2 },
  });
  assert.equal(bad.isError, true);
  const screenshot = await client.callTool({
    name: "device_ui_screenshot",
    arguments: {},
  });
  assert.equal(screenshot.content[0].type, "image");
});

test("automation-only MCP works without an Xcode workspace", async (t) => {
  const { config, api } = await fixture(t);
  await api.connect({ simulator: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" });
  const [serverTransport, clientTransport] =
    InMemoryTransport.createLinkedPair();
  const controller = await serveDeviceMcp(
    config,
    {},
    { uiOnly: true, transport: serverTransport },
  );
  const client = new Client({ name: "ui-only-test", version: "1" });
  t.after(async () => {
    await client.close();
    await controller.close();
  });
  await client.connect(clientTransport);
  assert.equal((await client.listTools()).tools.length, deviceTools.length);
  const snapshot = await client.callTool({
    name: "device_ui_snapshot",
    arguments: {},
  });
  assert.equal(snapshot.isError, undefined);
  const unknown = await client.callTool({
    name: "build_device",
    arguments: {},
  });
  assert.equal(unknown.isError, true);
});

test("setup preserves existing unowned automation directories", async (t) => {
  const { config } = await fixture(t);
  const { directory } = await automationPaths(config);
  await rm(path.join(directory, ".generated-by-three-native"));
  await writeFile(path.join(directory, "package.json"), "important");
  await assert.rejects(
    setupAutomation(config, async () => {}),
    /unowned/,
  );
  assert.equal(
    await readFile(path.join(directory, "package.json"), "utf8"),
    "important",
  );
});
