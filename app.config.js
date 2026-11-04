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
      [
        "expo-sensors",
        {
          motionPermission:
            "Allow $(PRODUCT_NAME) to use motion for interactive scenes.",
        },
      ],
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location when you request it.",
        },
      ],
      [
        "expo-image-picker",
        {
          cameraPermission:
            "Allow $(PRODUCT_NAME) to take a photo when you request it.",
          microphonePermission: false,
        },
      ],
      ["expo-asset", { assets: ["./assets/models/Avocado.glb"] }],
    ],
    web: { bundler: "metro", output: "single", name: "Three Native Lab" },
  },
};
