import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/main.js",
  name: "Vanilla Three Demo",
  ios: { bundleIdentifier: "dev.jstxn.threenative.vanilla" },
});
