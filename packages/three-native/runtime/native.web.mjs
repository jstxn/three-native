import { createNativeFeatures } from "./native-core.mjs";
export { NativeFeatureError } from "./native-core.mjs";
export const native = createNativeFeatures({ os: "web", physical: false });
