import assert from "node:assert/strict";
import { test } from "node:test";
import {
  devices,
  deviceViewport,
  fitViewport,
  getDevice,
} from "../runtime/devices.mjs";

test("device presets preserve Apple's physical pixel dimensions and logical scale", () => {
  assert.equal(new Set(devices.map((d) => d.id)).size, devices.length);
  for (const device of devices) {
    assert.equal(device.width * device.scale, device.pixelWidth, device.id);
    assert.equal(device.height * device.scale, device.pixelHeight, device.id);
    assert.ok(device.width < device.height, device.id);
    assert.match(
      device.source,
      /^https:\/\/(www\.apple\.com|support\.apple\.com)\//,
    );
  }
  assert.deepEqual(deviceViewport("iphone-18-pro"), {
    width: 402,
    height: 874,
  });
  assert.deepEqual(deviceViewport("iphone-se-3"), { width: 375, height: 667 });
  assert.deepEqual(deviceViewport("ipad-pro-13-m5"), {
    width: 1032,
    height: 1376,
  });
});
test("landscape swaps the logical viewport without changing the profile", () => {
  assert.deepEqual(deviceViewport("iphone-18-pro", "landscape"), {
    width: 874,
    height: 402,
  });
  assert.equal(getDevice("iphone-18-pro").width, 402);
  assert.throws(
    () => deviceViewport("invented-phone"),
    /Unknown preview device/,
  );
  assert.throws(
    () => deviceViewport("iphone-18-pro", "upside-down"),
    /portrait or landscape/,
  );
});
test("fitting changes visual scale without stretching the target aspect ratio", () => {
  const scale = fitViewport(402, 874, 320, 500);
  assert.ok(402 * scale <= 320.000001 && 874 * scale <= 500.000001);
  assert.ok(Math.abs((402 * scale) / (874 * scale) - 402 / 874) < 1e-10);
  assert.equal(fitViewport(402, 874, 1200, 1400), 1);
  assert.equal(fitViewport(402, 874, 0, 500), 0);
});
