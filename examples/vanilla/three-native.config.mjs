import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/scene.js",
  name: "Vanilla Three Demo",
  ios: { bundleIdentifier: "dev.jstxn.threenative.vanilla" },
});
