import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createNativeFeatures,
  NativeFeatureError,
} from "../runtime/native-core.mjs";

function fixture(overrides = {}) {
  const calls = [];
  let onState;
  const services = {
    os: "ios",
    physical: true,
    model: "Test iPhone",
    haptics: {
      async impactAsync(style) {
        calls.push(["impact", style]);
      },
    },
    motion: {
      async isAvailableAsync() {
        return true;
      },
      async requestPermissionsAsync() {
        return { granted: true };
      },
      setUpdateInterval(ms) {
        calls.push(["interval", ms]);
      },
      addListener(listener) {
        calls.push(["listen"]);
        listener({ x: 1, y: 2, z: 3, timestamp: 4 });
        return {
          remove() {
            calls.push(["remove"]);
          },
        };
      },
    },
    appState: {
      currentState: "active",
      addEventListener(_event, callback) {
        onState = callback;
        return {
          remove() {
            calls.push(["remove-state"]);
          },
        };
      },
    },
    location: {
      async requestForegroundPermissionsAsync() {
        return { granted: true };
      },
      async getCurrentPositionAsync() {
        calls.push(["location"]);
        return { coords: { latitude: 1, longitude: 2 }, timestamp: 3 };
      },
    },
    camera: {
      async requestCameraPermissionsAsync() {
        return { granted: true };
      },
      async launchCameraAsync(options) {
        calls.push(["camera", options]);
        return {
          canceled: false,
          assets: [{ uri: "file:///photo.jpg", width: 20, height: 30 }],
        };
      },
    },
    ...overrides,
  };
  return {
    native: createNativeFeatures(services),
    services,
    calls,
    changeState: (state) => onState(state),
  };
}

test("browser and Simulator never substitute fake hardware for native features", async () => {
  for (const os of ["ios", "web"]) {
    const { native, calls } = fixture({ os, physical: os === "web" });
    assert.equal(
      native.info().environment,
      os === "web" ? "browser" : "simulator",
    );
    for (const call of [
      () => native.haptics.impact(),
      () => native.motion.watch(() => {}),
      () => native.camera.capture(),
    ]) {
      await assert.rejects(
        call(),
        (error) =>
          error instanceof NativeFeatureError && error.code === "unavailable",
      );
    }
    if (os === "web")
      await assert.rejects(native.location.current(), /requires the iOS app/);
    else assert.equal((await native.location.current()).source, "simulator");
    assert.ok(calls.every(([name]) => name === "location"));
  }
});

test("permissions gate access and cancellation returns no camera asset", async () => {
  const { native, services, calls } = fixture();
  services.camera.requestCameraPermissionsAsync = async () => ({
    granted: false,
  });
  services.location.requestForegroundPermissionsAsync = async () => ({
    granted: false,
  });
  services.motion.requestPermissionsAsync = async () => ({ granted: false });
  for (const call of [
    () => native.camera.capture(),
    () => native.location.current(),
    () => native.motion.watch(() => {}),
  ]) {
    await assert.rejects(call(), (error) => error.code === "permission-denied");
  }
  assert.deepEqual(calls, []);
  services.camera.requestCameraPermissionsAsync = async () => ({
    granted: true,
  });
  services.camera.launchCameraAsync = async () => ({
    canceled: true,
    assets: null,
  });
  assert.equal(await native.camera.capture(), null);
});

test("native calls return real SDK values and pause motion in the background", async () => {
  const { native, calls, changeState } = fixture();
  await native.haptics.impact("light");
  await assert.rejects(native.haptics.impact("invalid"), /Unknown haptic/);
  assert.equal((await native.location.current()).source, "device");
  assert.equal((await native.camera.capture()).uri, "file:///photo.jpg");
  const samples = [];
  const stop = await native.motion.watch((value) => samples.push(value), {
    intervalMs: 50,
  });
  assert.equal(samples.length, 1);
  changeState("background");
  changeState("active");
  assert.equal(samples.length, 2);
  stop();
  stop();
  assert.equal(calls.filter(([name]) => name === "listen").length, 2);
  assert.equal(calls.filter(([name]) => name === "remove").length, 2);
  assert.equal(calls.filter(([name]) => name === "remove-state").length, 1);
  assert.deepEqual(
    calls.find(([name]) => name === "camera"),
    ["camera", { mediaTypes: ["images"] }],
  );
});

test("motion validates polling interval and reports missing sensors", async () => {
  const { native, services } = fixture();
  await assert.rejects(
    native.motion.watch(() => {}, { intervalMs: 0 }),
    /intervalMs/,
  );
  services.motion.isAvailableAsync = async () => false;
  await assert.rejects(
    native.motion.watch(() => {}),
    /no available accelerometer/,
  );
});

test("motion startup failure cleans up a started hardware subscription", async () => {
  const { native, services, calls } = fixture();
  services.appState.addEventListener = () => {
    throw new Error("lifecycle unavailable");
  };
  await assert.rejects(
    native.motion.watch(() => {}),
    /lifecycle unavailable/,
  );
  assert.deepEqual(
    calls.filter(([name]) => name === "remove"),
    [["remove"]],
  );
});
