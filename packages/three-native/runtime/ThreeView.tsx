import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  PixelRatio,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type GestureResponderEvent,
} from "react-native";
import { Canvas, type CanvasRef } from "react-native-webgpu";
import * as THREE from "three/webgpu";

export interface SceneContext {
  width: number;
  height: number;
  resolveAsset(module: number | string): Promise<string>;
  renderer: THREE.WebGPURenderer;
}
export interface NativePointerEvent {
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
  x: number;
  y: number;
}
export interface NativeScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update?(deltaSeconds: number, elapsedSeconds: number): void;
  resize?(width: number, height: number): void;
  onPointer?(x: number, y: number): void;
  onPointerEvent?(event: NativePointerEvent): void;
  dispose?(): void;
}
export type SceneFactory<T extends NativeScene = NativeScene> = (
  context: SceneContext,
) => T | Promise<T>;
export type Metrics = {
  fps: number;
  calls: number;
  triangles: number;
  frames: number;
};

function release(scene: NativeScene) {
  if (scene.dispose) {
    scene.dispose();
    return;
  }
  const resources = new Set<{ dispose(): void }>();
  scene.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.InstancedMesh) resources.add(object);
    resources.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      resources.add(material);
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) resources.add(value);
    }
  });
  for (const resource of resources) {
    resource.dispose();
    if (resource instanceof THREE.Texture) {
      const image = resource.source.data;
      if (
        image &&
        typeof image === "object" &&
        "close" in image &&
        typeof image.close === "function"
      )
        image.close();
    }
  }
}

export function ThreeView<T extends NativeScene>({
  createScene,
  paused = false,
  onReady,
  onMetrics,
  style,
}: {
  createScene: SceneFactory<T>;
  paused?: boolean;
  onReady?: (scene: T | null) => void;
  onMetrics?: (metrics: Metrics) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const canvas = useRef<CanvasRef>(null);
  const current = useRef<T | null>(null);
  const rendererRef = useRef<THREE.WebGPURenderer | null>(null);
  const size = useRef({ width: 0, height: 0 });
  const pause = useRef(paused);
  const [laidOut, setLaidOut] = useState(false);
  const [status, setStatus] = useState("Starting WebGPU…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    pause.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!laidOut) return;
    let cancelled = false;
    let device: GPUDevice | undefined;
    let renderer: THREE.WebGPURenderer | undefined;
    let initialized = false;
    let scene: T | undefined;
    let foreground = AppState.currentState === "active";
    const listener = AppState.addEventListener("change", (state) => {
      foreground = state === "active";
    });
    const fail = (error: unknown) => {
      if (!cancelled) {
        renderer?.setAnimationLoop(null);
        setFailed(true);
        setStatus(error instanceof Error ? error.message : String(error));
      }
    };
    void (async () => {
      setFailed(false);
      setStatus("Starting WebGPU…");
      const context = canvas.current?.getContext("webgpu");
      if (!context)
        throw new Error(
          "WebGPU is unavailable. Use a WebGPU-enabled browser or the native iOS build.",
        );
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter is available.");
      device = await adapter.requestDevice();
      if (cancelled) {
        device.destroy();
        return;
      }
      device.addEventListener("uncapturederror", (event) => fail(event.error));
      void device.lost.then((info) => {
        if (info.reason !== "destroyed")
          fail(`GPU device lost: ${info.message}`);
      });
      renderer = new THREE.WebGPURenderer({
        antialias: true,
        canvas: context.canvas as HTMLCanvasElement,
        context,
        device,
      });
      // shortcut: cap the drawing buffer at 2×; tune after profiling real iPhones.
      renderer.setPixelRatio(Math.min(PixelRatio.get(), 2));
      renderer.setSize(size.current.width, size.current.height, false);
      await renderer.init();
      initialized = true;
      if (cancelled) {
        renderer.dispose();
        return;
      }
      setStatus("Loading scene…");
      const candidate = await createScene({
        ...size.current,
        renderer,
        resolveAsset: async (module) => {
          const asset = Asset.fromModule(module);
          await asset.downloadAsync();
          return asset.localUri ?? asset.uri;
        },
      });
      if (!candidate?.scene?.isScene || !candidate?.camera?.isCamera)
        throw new Error(
          "createScene must return { scene: THREE.Scene, camera: THREE.Camera }.",
        );
      scene = candidate;
      if (cancelled) {
        release(scene);
        return;
      }
      if (scene.camera instanceof THREE.PerspectiveCamera) {
        scene.camera.aspect = size.current.width / size.current.height;
        scene.camera.updateProjectionMatrix();
      }
      scene.resize?.(size.current.width, size.current.height);
      current.current = scene;
      rendererRef.current = renderer;
      onReady?.(scene);
      setStatus("");
      let previous = 0,
        lastReport = 0,
        intervalFrames = 0,
        frames = 0,
        elapsed = 0;
      renderer.setAnimationLoop((time) => {
        if (cancelled || !renderer || !scene) return;
        const delta = previous
          ? Math.min(Math.max((time - previous) / 1000, 0), 0.05)
          : 0;
        previous = time;
        if (!foreground) {
          lastReport = time;
          intervalFrames = 0;
          return;
        }
        try {
          if (!pause.current) {
            elapsed += delta;
            scene.update?.(delta, elapsed);
          }
          renderer.render(scene.scene, scene.camera);
          context.present();
        } catch (error) {
          fail(error);
          return;
        }
        intervalFrames++;
        frames++;
        if (!lastReport) lastReport = time;
        if (time - lastReport >= 1000) {
          onMetrics?.({
            fps: Math.round((intervalFrames * 1000) / (time - lastReport)),
            calls: renderer.info.render.drawCalls,
            triangles: renderer.info.render.triangles,
            frames,
          });
          intervalFrames = 0;
          lastReport = time;
        }
      });
    })().catch(fail);
    return () => {
      cancelled = true;
      listener.remove();
      renderer?.setAnimationLoop(null);
      if (scene) release(scene);
      if (initialized) renderer?.dispose();
      device?.destroy();
      current.current = null;
      rendererRef.current = null;
      onReady?.(null);
    };
  }, [createScene, laidOut, onReady, onMetrics]);

  const pointer = (
    type: NativePointerEvent["type"],
    event: GestureResponderEvent,
  ) => {
    if (!size.current.width || !size.current.height) return;
    const x = event.nativeEvent.locationX / size.current.width;
    const y = event.nativeEvent.locationY / size.current.height;
    try {
      current.current?.onPointerEvent?.({ type, x, y });
      if (type === "pointerup") current.current?.onPointer?.(x, y);
    } catch (error) {
      rendererRef.current?.setAnimationLoop(null);
      setFailed(true);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <View
      style={[{ flex: 1 }, style]}
      onLayout={({ nativeEvent: { layout } }) => {
        const { width, height } = layout;
        size.current = { width, height };
        if (width <= 0 || height <= 0) return;
        rendererRef.current?.setSize(width, height, false);
        const scene = current.current;
        if (scene?.camera instanceof THREE.PerspectiveCamera) {
          scene.camera.aspect = width / height;
          scene.camera.updateProjectionMatrix();
        }
        scene?.resize?.(width, height);
        setLaidOut(true);
      }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(event) => pointer("pointerdown", event)}
      onResponderMove={(event) => pointer("pointermove", event)}
      onResponderRelease={(event) => pointer("pointerup", event)}
      onResponderTerminate={(event) => pointer("pointercancel", event)}
      accessibilityLabel="Interactive Three.js scene"
    >
      <Canvas ref={canvas} style={{ flex: 1 }} />
      {!!status && (
        <View style={styles.status} pointerEvents="none">
          {!failed && <ActivityIndicator color="#205c76" />}
          <Text style={styles.message}>{status}</Text>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  status: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#dde8ee",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 28,
  },
  message: { color: "#183548", textAlign: "center", lineHeight: 23 },
});
