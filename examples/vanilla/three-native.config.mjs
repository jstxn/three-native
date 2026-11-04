import { defineConfig } from "@jstxn/three-native";
export default defineConfig({
  entry: "./src/main.js",
  name: "Vanilla Three Demo",
  preview: { device: "iphone-18-pro", orientation: "portrait" },
  ios: { bundleIdentifier: "dev.jstxn.threenative.vanilla" },
});
