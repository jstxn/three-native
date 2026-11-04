module.exports = {
  expo: {
    name: "Three Native Lab",
    slug: "three-native-poc",
    scheme: "threenativelab",
    version: "1.0.0",
    orientation: "default",
    userInterfaceStyle: "light",
    ios: { bundleIdentifier: "dev.jstxn.threenativelab", supportsTablet: true },
    plugins: [
      "expo-router",
      ["expo-build-properties", { ios: { enableSceneSupport: true } }],
      "react-native-webgpu",
      ["expo-asset", { assets: ["./assets/models/Avocado.glb"] }],
    ],
    web: { bundler: "metro", output: "single", name: "Three Native Lab" },
  },
};
