export class NativeFeatureError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "NativeFeatureError";
    this.code = code;
  }
}

export function createNativeFeatures(services) {
  const environment =
    services.os === "web"
      ? "browser"
      : services.physical
        ? "device"
        : "simulator";
  function requireIOS(feature, hardware = false) {
    if (services.os !== "ios" || (hardware && environment !== "device")) {
      throw new NativeFeatureError(
        "unavailable",
        `${feature} requires ${hardware ? "a physical iOS device" : "the iOS app"}; current runtime is ${environment}.`,
      );
    }
  }
  async function permission(request, feature) {
    if (!(await request()).granted) {
      throw new NativeFeatureError(
        "permission-denied",
        `${feature} permission was denied. Enable it in iOS Settings to try again.`,
      );
    }
  }
  return {
    info: () => ({
      platform: services.os,
      environment,
      model: services.model ?? null,
    }),
    haptics: {
      async impact(style = "medium") {
        requireIOS("Haptics", true);
        if (!["light", "medium", "heavy", "soft", "rigid"].includes(style))
          throw new TypeError("Unknown haptic impact style.");
        await services.haptics.impactAsync(style);
      },
    },
    motion: {
      async watch(listener, { intervalMs = 100 } = {}) {
        requireIOS("Motion", true);
        if (
          typeof listener !== "function" ||
          !Number.isInteger(intervalMs) ||
          intervalMs < 16 ||
          intervalMs > 1000
        ) {
          throw new TypeError(
            "Motion needs a listener and intervalMs between 16 and 1000.",
          );
        }
        const sensor = services.motion;
        if (!(await sensor.isAvailableAsync()))
          throw new NativeFeatureError(
            "unavailable",
            "This device has no available accelerometer.",
          );
        await permission(() => sensor.requestPermissionsAsync(), "Motion");
        sensor.setUpdateInterval(intervalMs);
        let subscription;
        let stopped = false;
        const update = (state) => {
          subscription?.remove();
          subscription = undefined;
          if (!stopped && state === "active")
            subscription = sensor.addListener(listener);
        };
        let lifecycle;
        try {
          update(services.appState.currentState);
          lifecycle = services.appState.addEventListener("change", update);
        } catch (error) {
          subscription?.remove();
          throw error;
        }
        return () => {
          if (stopped) return;
          stopped = true;
          subscription?.remove();
          subscription = undefined;
          lifecycle.remove();
        };
      },
    },
    location: {
      async current() {
        requireIOS("Location");
        await permission(
          () => services.location.requestForegroundPermissionsAsync(),
          "Location",
        );
        const location = await services.location.getCurrentPositionAsync({});
        return { ...location, source: environment };
      },
    },
    camera: {
      async capture() {
        requireIOS("Camera", true);
        await permission(
          () => services.camera.requestCameraPermissionsAsync(),
          "Camera",
        );
        const result = await services.camera.launchCameraAsync({
          mediaTypes: ["images"],
        });
        return result.canceled ? null : result.assets[0];
      },
    },
  };
}
