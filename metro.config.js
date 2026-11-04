const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push("glb");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "three" || moduleName === "three/webgpu") {
    return { filePath: require.resolve("three/webgpu"), type: "sourceFile" };
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
