import * as Device from "expo-device";
import { useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeFeaturesPanel } from "../components/native-features";
import { ProofCanvas, type Metrics } from "../components/proof-canvas";
import type { Sample } from "../lib/proof-scene";
import { DevicePreview } from "../../packages/three-native/runtime/DevicePreview";

export default function Home() {
  return (
    <DevicePreview simulatorUrl={process.env.EXPO_PUBLIC_SIMULATOR_URL}>
      <Demo />
    </DevicePreview>
  );
}

function Demo() {
  const wide = useWindowDimensions().width >= 900;
  const [sample, setSample] = useState<Sample>("sculpture");
  const [paused, setPaused] = useState(false);
  const [finish, setFinish] = useState(0);
  const [reset, setReset] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [picks, setPicks] = useState(0);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setPaused);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setPaused,
    );
    return () => sub.remove();
  }, []);
  const pick = useCallback(() => {
    setFinish((value) => value + 1);
    setPicks((value) => value + 1);
  }, []);
  const platform =
    Platform.OS === "web"
      ? "Browser / WebGPU"
      : `${Device.modelName ?? Platform.OS} / ${Device.isDevice ? "Physical device" : "iOS Simulator"}`;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.heading}>
          <View>
            <Text style={styles.title}>Three Native Lab</Text>
            <Text style={styles.subtitle}>
              One scene. Two ways to experience it.
            </Text>
          </View>
          <View style={styles.badge}>
            <View style={styles.dot} />
            <Text style={styles.badgeText}>{platform}</Text>
          </View>
        </View>
        <View style={[styles.workspace, wide && styles.workspaceWide]}>
          <View style={[styles.stage, wide && styles.stageWide]}>
            <View style={styles.stageHeading}>
              <Text style={styles.sceneTitle}>
                {sample === "sculpture" ? "Copper orbit" : "The texture test"}
              </Text>
              <Text style={styles.sceneHint}>
                {sample === "sculpture"
                  ? "Tap the sculpture to change its finish"
                  : "Tap the avocado to turn it"}
              </Text>
            </View>
            <View style={[styles.viewport, wide && styles.viewportWide]}>
              <ProofCanvas
                key={`${sample}-${generation}`}
                sample={sample}
                paused={paused}
                finish={finish}
                reset={reset}
                onPick={pick}
                onMetrics={setMetrics}
              />
            </View>
            <View style={styles.stats}>
              <Stat label="Frames / second" value={metrics?.fps ?? "—"} />
              <Stat label="Draw calls" value={metrics?.calls ?? "—"} />
              <Stat
                label="Triangles"
                value={metrics ? metrics.triangles.toLocaleString() : "—"}
              />
              <Stat label="Object taps" value={picks} />
            </View>
          </View>
          <View style={[styles.inspector, wide && styles.inspectorWide]}>
            <Text style={styles.sectionTitle}>Explore the proof</Text>
            <Text style={styles.body}>
              The same Three.js source runs here and in the native iOS app.
            </Text>
            <Choice
              title="Copper orbit"
              detail="PBR materials + 64 instanced spheres"
              active={sample === "sculpture"}
              onPress={() => {
                setSample("sculpture");
                setMetrics(null);
              }}
            />
            <Choice
              title="Bundled glTF"
              detail="A real model with embedded textures"
              active={sample === "model"}
              onPress={() => {
                setSample("model");
                setMetrics(null);
              }}
            />
            <View style={styles.actions}>
              <Action
                title={paused ? "Resume motion" : "Pause motion"}
                onPress={() => setPaused((value) => !value)}
              />
              <Action
                title={sample === "sculpture" ? "Change finish" : "Turn model"}
                onPress={pick}
              />
              <Action
                title="Reset view"
                onPress={() => setReset((value) => value + 1)}
              />
              <Action
                title="Reload scene"
                onPress={() => {
                  setGeneration((value) => value + 1);
                  setMetrics(null);
                }}
              />
            </View>
            <View style={styles.note}>
              <Text style={styles.noteTitle}>
                {Platform.OS === "web"
                  ? "This is the web build"
                  : "This is the native build"}
              </Text>
              <Text style={styles.body}>
                {Platform.OS === "web"
                  ? "It renders directly in your browser. The iOS preview streams the actual Simulator app."
                  : "Three.js renders through native WebGPU and Dawn to Metal. No web view is used."}
              </Text>
            </View>
            {Platform.OS === "web" && process.env.EXPO_PUBLIC_SIMULATOR_URL && (
              <Action
                title="Open live iOS Simulator"
                onPress={() => {
                  void Linking.openURL(process.env.EXPO_PUBLIC_SIMULATOR_URL!);
                }}
              />
            )}
            <NativeFeaturesPanel />
            <Text style={styles.footnote}>
              FPS is measured in this runtime, not a physical-device benchmark.
              Model: Microsoft / Khronos, CC0.
            </Text>
          </View>
        </View>
        <Text style={styles.footer}>
          Three.js · React Native WebGPU · Metal on iOS
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}
function Choice({
  title,
  detail,
  active,
  onPress,
}: {
  title: string;
  detail: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceDetail}>{detail}</Text>
    </Pressable>
  );
}
function Action({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Text style={styles.actionText}>{title}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f4f7fa" },
  page: {
    padding: 22,
    paddingBottom: 28,
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
  },
  heading: {
    gap: 18,
    marginBottom: 26,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 29,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#183548",
  },
  subtitle: { fontSize: 15, color: "#64798b", marginTop: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#e3edf2",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, color: "#235570", fontWeight: "600" },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#297d8d" },
  workspace: { gap: 26 },
  workspaceWide: { flexDirection: "row", alignItems: "flex-start" },
  stage: { backgroundColor: "#dde8ee", borderRadius: 22, overflow: "hidden" },
  stageWide: { flex: 1 },
  stageHeading: { paddingHorizontal: 22, paddingTop: 22, gap: 5 },
  sceneTitle: { fontSize: 21, fontWeight: "600", color: "#183548" },
  sceneHint: { fontSize: 13, color: "#526d80" },
  viewport: { height: 350 },
  viewportWide: { height: 485 },
  stats: {
    flexDirection: "row",
    backgroundColor: "#e8f0f4",
    padding: 18,
    gap: 12,
  },
  stat: { flex: 1 },
  statValue: {
    color: "#183548",
    fontSize: 20,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontSize: 10, lineHeight: 15, color: "#64798b", marginTop: 5 },
  inspector: { gap: 12 },
  inspectorWide: { width: 286, paddingTop: 6 },
  sectionTitle: { color: "#183548", fontSize: 20, fontWeight: "600" },
  body: { color: "#64798b", fontSize: 14, lineHeight: 22 },
  choice: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#d5e0e8",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  choiceActive: { borderColor: "#297d8d", backgroundColor: "#eaf3f5" },
  choiceTitle: { fontSize: 15, fontWeight: "600", color: "#183548" },
  choiceDetail: { marginTop: 5, fontSize: 12, color: "#64798b" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: "#ffffff",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#d5e0e8",
    minHeight: 44,
  },
  actionText: { color: "#235570", fontSize: 13, fontWeight: "600" },
  pressed: { opacity: 0.65 },
  note: { gap: 6, marginTop: 8 },
  noteTitle: { color: "#183548", fontSize: 14, fontWeight: "600" },
  footnote: { color: "#768999", fontSize: 11, lineHeight: 18 },
  footer: {
    marginTop: 22,
    color: "#768999",
    fontSize: 12,
    textAlign: "center",
  },
});
