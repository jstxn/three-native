import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DeviceAutomation, startAutomationServer } from "./automation.mjs";
import { configureTooling, toolingPackage } from "./tooling.mjs";

const string = { type: "string" };
const schema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const deviceTools = [
  {
    name: "device_ui_connect",
    description:
      "Connect Appium/XCTest to the configured physical iPhone and launch this app. Requires device setup, signing, trust, Developer Mode, and UI Automation. Reuses an existing matching session without resetting app data.",
    inputSchema: schema({ device: string, simulator: string }),
  },
  {
    name: "device_ui_status",
    description: "Check the local Appium server and the device UI session.",
    inputSchema: schema(),
    annotations: { readOnlyHint: true },
  },
  {
    name: "device_ui_snapshot",
    description:
      "Read native UI hierarchy and logical screen bounds in points. Use these bounds for taps; Three.js meshes are canvas content and need coordinate taps.",
    inputSchema: schema(),
    annotations: { readOnlyHint: true },
  },
  {
    name: "device_ui_screenshot",
    description:
      "Capture a screenshot from the connected physical iPhone. Screenshot pixels can differ from the logical points used by tap.",
    inputSchema: schema(),
    annotations: { readOnlyHint: true },
  },
  {
    name: "device_ui_tap",
    description:
      "Tap an accessibility ID/label, or x/y screen coordinates in logical points.",
    inputSchema: schema({
      id: string,
      x: { type: "number", minimum: 0 },
      y: { type: "number", minimum: 0 },
    }),
  },
  {
    name: "device_ui_swipe",
    description: "Swipe the connected iPhone in the requested direction.",
    inputSchema: schema(
      { direction: { type: "string", enum: ["up", "down", "left", "right"] } },
      ["direction"],
    ),
  },
  {
    name: "device_ui_type",
    description:
      "Type into an accessibility ID/label or the focused text field. Optionally clear the field first.",
    inputSchema: schema(
      { id: string, text: string, clear: { type: "boolean" } },
      ["text"],
    ),
  },
  {
    name: "device_ui_disconnect",
    description:
      "End the device UI session without resetting or uninstalling the app.",
    inputSchema: schema(),
  },
];

export async function serveDeviceMcp(
  config,
  target,
  { upstreamClient, transport, uiOnly = false } = {},
) {
  const { host, settings } = uiOnly
    ? {
        host: config.root,
        settings: {
          sessionDefaults: {
            deviceId: target.device,
            simulatorId: target.simulator,
          },
        },
      }
    : await configureTooling(config, target);
  const upstream = uiOnly
    ? null
    : (upstreamClient ??
      new Client({ name: "three-native", version: "0.4.0" }));
  let upstreamTools;
  try {
    if (upstream && !upstreamClient)
      await upstream.connect(
        new StdioClientTransport({
          command: "npx",
          args: ["--yes", toolingPackage, "mcp"],
          cwd: host,
          stderr: "inherit",
          env: { ...process.env, XCODEBUILDMCP_SENTRY_DISABLED: "true" },
        }),
      );
    upstreamTools = upstream ? (await upstream.listTools()).tools : [];
  } catch (error) {
    await upstream?.close().catch(() => {});
    throw error;
  }
  const api = new DeviceAutomation(config);
  let appium;
  const server = new Server(
    { name: "three-native", version: "0.4.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...upstreamTools, ...deviceTools],
  }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (!deviceTools.some((tool) => tool.name === params.name))
      return upstream
        ? upstream.callTool(params, undefined, { timeout: 300000 })
        : {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${params.name}` }],
          };
    const args = params.arguments ?? {};
    try {
      let value;
      switch (params.name) {
        case "device_ui_connect": {
          appium ??= await startAutomationServer(config, { quiet: true });
          const selected =
            args.device || args.simulator
              ? args
              : {
                  device: settings.sessionDefaults.deviceId,
                  simulator: settings.sessionDefaults.simulatorId,
                };
          value = await api.connect(selected);
          break;
        }
        case "device_ui_status":
          value = await api.status();
          break;
        case "device_ui_snapshot":
          value = await api.snapshot();
          break;
        case "device_ui_screenshot":
          return {
            content: [
              {
                type: "image",
                mimeType: "image/png",
                data: await api.screenshot(),
              },
            ],
          };
        case "device_ui_tap":
          value = await api.tap(args);
          break;
        case "device_ui_swipe":
          value = await api.swipe(args.direction);
          break;
        case "device_ui_type":
          value = await api.type(args);
          break;
        case "device_ui_disconnect":
          value = await api.disconnect();
          break;
      }
      return {
        content: [
          { type: "text", text: JSON.stringify(value ?? { ok: true }) },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    if (api.ownsSession) await api.disconnect().catch(() => {});
    await Promise.allSettled([appium?.stop(), upstream?.close()]);
    await server.close();
    process.off("SIGINT", close);
    process.off("SIGTERM", close);
  };
  server.onclose = () => {
    void close();
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  await server.connect(transport ?? new StdioServerTransport());
  return { close };
}
