import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { native } from "../../packages/three-native/runtime/native";

export function NativeFeaturesPanel() {
  const info = native.info();
  const [result, setResult] = useState(
    "Choose a feature to test on this runtime.",
  );
  const [busy, setBusy] = useState(false);
  const [watching, setWatching] = useState(false);
  const stopMotion = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopMotion.current?.();
    };
  }, []);
  async function run(action: () => Promise<string>) {
    setBusy(true);
    try {
      const message = await action();
      if (mounted.current) setResult(message);
    } catch (error) {
      if (mounted.current)
        setResult(error instanceof Error ? error.message : String(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function toggleMotion() {
    if (stopMotion.current) {
      stopMotion.current();
      stopMotion.current = null;
      setWatching(false);
      return "Motion sensor stopped.";
    }
    const stop = await native.motion.watch(
      ({ x, y, z }) => {
        if (mounted.current)
          setResult(
            `Acceleration (g): x ${x.toFixed(2)} · y ${y.toFixed(2)} · z ${z.toFixed(2)}`,
          );
      },
      { intervalMs: 100 },
    );
    if (!mounted.current) {
      stop();
      return "";
    }
    stopMotion.current = stop;
    setWatching(true);
    return "Motion sensor active. Move your device.";
  }
  const hardware = info.environment === "device";
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Native device features</Text>
      <Text style={styles.body}>
        {info.environment === "browser"
          ? "Open the iOS app to test hardware features."
          : info.environment === "simulator"
            ? "Simulator: location can be simulated. Camera, motion and haptics need a physical device."
            : `${info.model ?? "iOS device"}: permissions are requested when you tap a feature.`}
      </Text>
      <View style={styles.actions}>
        <FeatureButton
          title="Haptic impact"
          disabled={!hardware || busy}
          onPress={() =>
            void run(async () => {
              await native.haptics.impact("medium");
              return "Impact requested. Feedback depends on device hardware and system settings.";
            })
          }
        />
        <FeatureButton
          title={watching ? "Stop motion sensor" : "Read motion sensor"}
          disabled={!hardware || busy}
          onPress={() => void run(toggleMotion)}
        />
        <FeatureButton
          title="Read location"
          disabled={info.environment === "browser" || busy}
          onPress={() =>
            void run(async () => {
              const position = await native.location.current();
              return `${position.source === "simulator" ? "Simulated location" : "Device location"}: ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
            })
          }
        />
        <FeatureButton
          title="Take a photo"
          disabled={!hardware || busy}
          onPress={() =>
            void run(async () => {
              const photo = await native.camera.capture();
              return photo
                ? `Captured ${photo.width} × ${photo.height} photo. Kept in the app cache.`
                : "Camera canceled.";
            })
          }
        />
      </View>
      <Text accessibilityLiveRegion="polite" selectable style={styles.result}>
        {result}
      </Text>
    </View>
  );
}
function FeatureButton({
  title,
  disabled,
  onPress,
}: {
  title: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  panel: { marginTop: 20, gap: 12 },
  title: { fontSize: 17, fontWeight: "600", color: "#183548" },
  body: { fontSize: 13, lineHeight: 20, color: "#64798b" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#bdd3de",
    backgroundColor: "#f6fbfd",
    padding: 12,
    minHeight: 44,
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#245e70", fontSize: 12, fontWeight: "600" },
  result: { fontSize: 12, lineHeight: 18, color: "#415c6e" },
});
