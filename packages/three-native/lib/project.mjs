import { createHash } from "node:crypto";
import { access, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { analyzeProject, formatDiagnostic } from "./analyze.mjs";

export const packageRoot = fileURLToPath(new URL("../", import.meta.url));
export const configName = "three-native.config.mjs";
export const hostDependencies = {
  expo: "57.0.31",
  "expo-asset": "57.0.20",
  "expo-build-properties": "57.0.22",
  "fast-text-encoding": "1.0.6",
  react: "19.2.3",
  "react-dom": "19.2.3",
  "react-native": "0.86.3",
  "react-native-web": "0.21.2",
  "react-native-webgpu": "0.21.1",
  "react-native-reanimated": "4.5.1",
  "react-native-worklets": "0.10.1",
};
export async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
function inside(root, relative, label) {
  if (typeof relative !== "string" || !relative.trim())
    throw new Error(`${label} must be a nonempty relative path.`);
  const absolute = path.resolve(root, relative);
  if (
    !absolute.startsWith(root + path.sep) ||
    absolute.startsWith(path.join(root, ".three-native") + path.sep)
  ) {
    throw new Error(
      `${label} must point inside this project, outside .three-native/.`,
    );
  }
  return absolute;
}
export async function loadConfig(root) {
  root = path.resolve(root);
  const filename = path.join(root, configName);
  if (!(await exists(filename)))
    throw new Error(`Missing ${configName}. Run three-native init first.`);
  const declared = (
    await import(`${pathToFileURL(filename).href}?t=${Date.now()}`)
  ).default;
  if (!declared || typeof declared !== "object" || Array.isArray(declared))
    throw new Error(`${configName} must export a default config object.`);
  if (
    declared.ios !== undefined &&
    (!declared.ios ||
      typeof declared.ios !== "object" ||
      Array.isArray(declared.ios))
  )
    throw new Error("ios must be a configuration object.");
  const config = {
    name: "Three Native App",
    ...declared,
    ios: { bundleIdentifier: "com.example.threenative", ...declared.ios },
  };
  if (
    typeof config.name !== "string" ||
    !config.name.trim() ||
    !/[a-zA-Z]/.test(config.name)
  )
    throw new Error("name must contain a letter.");
  if (
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(
      config.ios?.bundleIdentifier ?? "",
    )
  )
    throw new Error(
      "ios.bundleIdentifier must be a reverse-domain identifier such as com.example.myapp.",
    );
  const entry = inside(root, config.entry, "entry");
  if (!(await exists(entry)))
    throw new Error(`Scene entry does not exist: ${config.entry}`);
  if (config.assets !== undefined && !Array.isArray(config.assets))
    throw new Error("assets must be an array of project-relative paths.");
  const assets = (config.assets ?? []).map((asset) =>
    inside(root, asset, "asset"),
  );
  for (const asset of assets)
    if (!(await exists(asset)))
      throw new Error(`Asset does not exist: ${path.relative(root, asset)}`);
  return { root, entry, assets, name: config.name, ios: config.ios };
}
export async function initProject(root, options = {}) {
  root = path.resolve(root);
  const configFile = path.join(root, configName);
  if (await exists(configFile))
    throw new Error(`${configName} already exists; it was not changed.`);
  const entry = options.entry ?? "./src/native-scene.ts";
  const absoluteEntry = inside(root, entry, "entry");
  if (options.entry && !(await exists(absoluteEntry)))
    throw new Error(`Scene entry does not exist: ${entry}`);
  if (!(await exists(absoluteEntry))) {
    await mkdir(path.dirname(absoluteEntry), { recursive: true });
    await writeFile(
      absoluteEntry,
      `import * as THREE from 'three/webgpu';\n\nexport function createScene() {\n  const scene = new THREE.Scene();\n  scene.background = new THREE.Color('#dde8ee');\n  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);\n  camera.position.z = 4;\n  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.23, 96, 16), new THREE.MeshNormalMaterial());\n  scene.add(mesh);\n  return { scene, camera, update(delta: number) { mesh.rotation.y += delta * 0.5; } };\n}\n`,
      { flag: "wx" },
    );
  }
  await writeFile(
    configFile,
    `export default ${JSON.stringify({ entry, name: options.name ?? "Three Native App", ios: { bundleIdentifier: options["bundle-id"] ?? "com.example.threenative" }, assets: [] }, null, 2)};\n`,
    { flag: "wx" },
  );
  return configFile;
}
export async function prepareProject(config, report) {
  report ??= await analyzeProject(config);
  if (!report.ok)
    throw new Error(
      report.diagnostics
        .filter((item) => item.severity === "error")
        .map(formatDiagnostic)
        .join("\n"),
    );
  const host = path.join(config.root, ".three-native");
  if (await exists(host)) {
    if ((await lstat(host)).isSymbolicLink())
      throw new Error(".three-native must not be a symlink.");
    if (!(await exists(path.join(host, ".generated-by-three-native"))))
      throw new Error(
        "Refusing to overwrite an unowned .three-native directory.",
      );
  }
  await mkdir(host, { recursive: true });
  for (const name of [
    ".generated-by-three-native",
    "package.json",
    "app.json",
    "index.ts",
    "App.tsx",
    "scene.ts",
    "ThreeView.tsx",
    "BrowserEntry.mjs",
    "metro.config.js",
  ]) {
    try {
      if ((await lstat(path.join(host, name))).isSymbolicLink())
        throw new Error(`Refusing to overwrite generated symlink: ${name}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  await writeFile(
    path.join(host, ".generated-by-three-native"),
    "Generated host. Edit three-native.config.mjs and your scene, not this folder.\n",
  );
  const hostPackage = {
    name: "three-native-generated-host",
    version: "0.0.0",
    private: true,
    main: "index.ts",
    dependencies: { ...hostDependencies, three: "0.186.0" },
  };
  const json = JSON.stringify(hostPackage, null, 2) + "\n";
  await writeFile(path.join(host, "package.json"), json);
  const expo = {
    name: config.name,
    slug: "three-native-host",
    version: "1.0.0",
    orientation: "default",
    ios: {
      bundleIdentifier: config.ios.bundleIdentifier,
      supportsTablet: true,
    },
    plugins: [
      ["expo-build-properties", { ios: { enableSceneSupport: true } }],
      "react-native-webgpu",
      [
        "expo-asset",
        { assets: config.assets.map((asset) => path.relative(host, asset)) },
      ],
    ],
    web: { bundler: "metro", output: "single" },
  };
  await writeFile(
    path.join(host, "app.json"),
    JSON.stringify({ expo }, null, 2) + "\n",
  );
  await writeFile(
    path.join(host, "index.ts"),
    `import 'fast-text-encoding';\nimport { registerRootComponent } from 'expo';\nimport App from './App';\nregisterRootComponent(App);\n`,
  );
  await writeFile(
    path.join(host, "App.tsx"),
    `import React from 'react';\nimport { StatusBar, View } from 'react-native';\nimport { ThreeView } from './ThreeView';\nimport { createScene } from './scene';\nexport default function App() { return <View style={{ flex: 1 }}><StatusBar hidden /><ThreeView createScene={createScene} style={{ flex: 1 }} /></View>; }\n`,
  );
  let relative = path.relative(host, config.entry).split(path.sep).join("/");
  if (!relative.startsWith(".")) relative = "./" + relative;
  await writeFile(
    path.join(host, "scene.ts"),
    report.mode === "entry"
      ? report.code
      : `export { createScene } from ${JSON.stringify(relative)};\n`,
  );
  await writeFile(
    path.join(host, "ThreeView.tsx"),
    await readFile(path.join(packageRoot, "runtime/ThreeView.tsx")),
  );
  await writeFile(
    path.join(host, "BrowserEntry.mjs"),
    await readFile(path.join(packageRoot, "runtime/BrowserEntry.mjs")),
  );
  await writeFile(
    path.join(host, "metro.config.js"),
    `const path = require('node:path');\nconst { getDefaultConfig } = require('expo/metro-config');\nconst config = getDefaultConfig(__dirname);\nconfig.watchFolders = [path.resolve(__dirname, '..')];\nconfig.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules'), path.resolve(__dirname, '../node_modules')];\nconfig.resolver.assetExts.push('glb', 'gltf', 'bin', 'hdr');\nconfig.resolver.resolveRequest = (context, name, platform) => {\n  if (name === 'three' || name === 'three/webgpu') return { filePath: require.resolve('three/webgpu'), type: 'sourceFile' };\n  return context.resolveRequest(context, name, platform);\n};\nmodule.exports = config;\n`,
  );
  return { host, installHash: createHash("sha256").update(json).digest("hex") };
}
export async function inspectProject(config) {
  return analyzeProject(config);
}
