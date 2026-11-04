import type { Camera, Scene } from "three";
import type { WebGPURenderer } from "three/webgpu";
export interface ThreeNativeConfig {
  entry: string;
  name?: string;
  ios?: { bundleIdentifier?: string; appleTeamId?: string };
  assets?: string[];
  preview?: { device?: string; orientation?: "portrait" | "landscape" };
}
export function defineConfig(config: ThreeNativeConfig): ThreeNativeConfig;
export interface SceneContext {
  width: number;
  height: number;
  resolveAsset(module: number | string): Promise<string>;
  renderer: WebGPURenderer;
}
export interface NativePointerEvent {
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel";
  x: number;
  y: number;
}
export interface NativeScene {
  scene: Scene;
  camera: Camera;
  update?(deltaSeconds: number, elapsedSeconds: number): void;
  resize?(width: number, height: number): void;
  onPointer?(x: number, y: number): void;
  onPointerEvent?(event: NativePointerEvent): void;
  dispose?(): void;
}
export type SceneFactory = (
  context: SceneContext,
) => NativeScene | Promise<NativeScene>;
