import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { createNativeFeatures } from "./native-core.mjs";

export { NativeFeatureError } from "./native-core.mjs";
export type {
  NativeFeatures,
  MotionSample,
  LocationSample,
  CapturedImage,
} from "./native-core.mjs";
export const native = createNativeFeatures({
  os: Platform.OS,
  physical: Device.isDevice,
  model: Device.modelName,
  haptics: {
    impactAsync: (style) =>
      Haptics.impactAsync(style as Haptics.ImpactFeedbackStyle),
  },
  motion: Accelerometer,
  location: Location,
  camera: ImagePicker,
  appState: AppState,
});
