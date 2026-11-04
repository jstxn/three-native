import type { Camera, Scene } from "three";
export interface ThreeNativeConfig {
  entry: string;
  name: string;
  ios: { bundleIdentifier: string };
  assets?: string[];
}
export function defineConfig(config: ThreeNativeConfig): ThreeNativeConfig;
export interface SceneContext {
  width: number;
  height: number;
  resolveAsset(module: number | string): Promise<string>;
}
export interface NativeScene {
  scene: Scene;
  camera: Camera;
  update?(deltaSeconds: number, elapsedSeconds: number): void;
  resize?(width: number, height: number): void;
  onPointer?(x: number, y: number): void;
  dispose?(): void;
}
export type SceneFactory = (
  context: SceneContext,
) => NativeScene | Promise<NativeScene>;
