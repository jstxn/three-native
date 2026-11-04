export interface MotionSample {
  x: number;
  y: number;
  z: number;
  timestamp: number;
}
export interface LocationSample {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
  source: "device" | "simulator";
}
export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}
export class NativeFeatureError extends Error {
  constructor(code: "unavailable" | "permission-denied", message: string);
  code: "unavailable" | "permission-denied";
}
export interface NativeFeatures {
  info(): {
    platform: string;
    environment: "browser" | "device" | "simulator";
    model: string | null;
  };
  haptics: {
    impact(
      style?: "light" | "medium" | "heavy" | "soft" | "rigid",
    ): Promise<void>;
  };
  motion: {
    watch(
      listener: (sample: MotionSample) => void,
      options?: { intervalMs?: number },
    ): Promise<() => void>;
  };
  location: { current(): Promise<LocationSample> };
  camera: { capture(): Promise<CapturedImage | null> };
}
interface Permission {
  granted: boolean;
}
interface Subscription {
  remove(): void;
}
export function createNativeFeatures(services: {
  os: string;
  physical: boolean;
  model?: string | null;
  haptics?: { impactAsync(style: string): Promise<void> };
  motion?: {
    isAvailableAsync(): Promise<boolean>;
    requestPermissionsAsync(): Promise<Permission>;
    setUpdateInterval(ms: number): void;
    addListener(listener: (sample: MotionSample) => void): Subscription;
  };
  appState?: {
    currentState: string | null;
    addEventListener(
      event: "change",
      listener: (state: string) => void,
    ): Subscription;
  };
  location?: {
    requestForegroundPermissionsAsync(): Promise<Permission>;
    getCurrentPositionAsync(
      options: object,
    ): Promise<Omit<LocationSample, "source">>;
  };
  camera?: {
    requestCameraPermissionsAsync(): Promise<Permission>;
    launchCameraAsync(options: {
      mediaTypes: ["images"];
    }): Promise<{ canceled: boolean; assets: CapturedImage[] | null }>;
  };
}): NativeFeatures;
