import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  parseSync,
  traverse,
  transformFromAstSync,
  types as t,
} from "@babel/core";

const codeExtensions = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"];
const pointerEvents = new Set([
  "resize",
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "click",
]);
const rendererMembers = new Set([
  "render",
  "setAnimationLoop",
  "domElement",
  "setSize",
  "setPixelRatio",
  "getSize",
  "getPixelRatio",
  "setClearColor",
  "getClearColor",
  "setClearAlpha",
  "getClearAlpha",
  "clear",
  "init",
  "dispose",
  "toneMapping",
  "toneMappingExposure",
  "outputColorSpace",
  "shadowMap",
  "info",
  "autoClear",
]);
const property = (node) =>
  !node.computed && t.isIdentifier(node.property)
    ? node.property.name
    : t.isStringLiteral(node.property)
      ? node.property.value
      : undefined;
const isGlobal = (p, name) =>
  p.isIdentifier({ name }) && !p.scope.getBinding(name);
const at = (node) => ({
  line: node?.loc?.start.line ?? 1,
  column: (node?.loc?.start.column ?? 0) + 1,
});

export function formatDiagnostic(diagnostic) {
  const { severity, code, file, line, column, message, fix } = diagnostic;
  return `${severity.toUpperCase()} ${code} ${file}:${line}:${column}\n  ${message}${fix ? `\n  Change: ${fix}` : ""}`;
}

// Parsing never imports or executes application code or its Babel configuration.
export async function analyzeProject(config) {
  config = {
    ...config,
    root: await realpath(config.root),
    entry: await realpath(config.entry),
  };
  const diagnostics = [],
    files = [],
    seen = new Set(),
    keys = new Set();
  let mode, generatedCode;
  const add = (file, node, severity, code, message, fix) => {
    const location = { file: path.relative(config.root, file), ...at(node) };
    const key = `${code}:${location.file}:${location.line}:${location.column}`;
    if (keys.has(key)) return;
    keys.add(key);
    diagnostics.push({
      severity,
      code,
      ...location,
      message,
      ...(fix ? { fix } : {}),
    });
  };
  async function resolveLocal(from, specifier, node) {
    const base = path.resolve(path.dirname(from), specifier);
    const candidates = [
      base,
      ...codeExtensions.map((ext) => base + ext),
      ...codeExtensions.map((ext) => path.join(base, "index" + ext)),
    ];
    for (const candidate of candidates) {
      try {
        if (!(await stat(candidate)).isFile()) continue;
        const resolved = await realpath(candidate);
        if (
          !resolved.startsWith(config.root + path.sep) ||
          resolved.startsWith(
            path.join(config.root, ".three-native") + path.sep,
          )
        ) {
          add(
            from,
            node,
            "error",
            "TN101",
            `Import escapes the project: ${specifier}`,
            "Move this module into the project and use a relative import.",
          );
          return;
        }
        return resolved;
      } catch (error) {
        if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
      }
    }
    add(
      from,
      node,
      "error",
      "TN102",
      `Cannot resolve ${specifier}.`,
      "Use a relative path to an existing file; bundler aliases are not configured in the generated host.",
    );
  }
  async function scan(file, entry = false) {
    if (seen.has(file)) return;
    seen.add(file);
    files.push(path.relative(config.root, file));
    const source = await readFile(file, "utf8");
    let ast;
    try {
      ast = parseSync(source, {
        filename: file,
        configFile: false,
        babelrc: false,
        sourceType: "module",
        parserOpts: { plugins: ["typescript", "jsx"] },
      });
    } catch (error) {
      add(
        file,
        { loc: { start: error.loc } },
        "error",
        "TN100",
        error.message.split("\n")[0],
        "Fix this syntax or convert the entry to a JavaScript/TypeScript ES module.",
      );
      return;
    }
    const imports = [],
      threeNames = new Map(),
      replacements = new Map(),
      canvasBindings = new Set(),
      loaderBindings = new Map();
    let program,
      rendererBinding,
      rendererNode,
      rendererCount = 0,
      renderCalls = 0,
      bridge;
    const covered = (p) =>
      replacements.has(p.node) ||
      !!p.findParent((parent) => replacements.has(parent.node));
    const isThree = (p, names) => {
      if (p.isIdentifier()) {
        const binding = p.scope.getBinding(p.node.name);
        return binding && names.includes(threeNames.get(binding));
      }
      if (!p.isMemberExpression()) return false;
      const object = p.get("object");
      return (
        object.isIdentifier() &&
        threeNames.get(object.scope.getBinding(object.node.name)) === "*" &&
        names.includes(property(p.node))
      );
    };
    const native = (name) =>
      t.memberExpression(t.cloneNode(bridge), t.identifier(name));
    const rendererObject = (p) =>
      p.isIdentifier() &&
      rendererBinding &&
      p.scope.getBinding(p.node.name) === rendererBinding;
    const canvasObject = (p) =>
      (p.isIdentifier() &&
        canvasBindings.has(p.scope.getBinding(p.node.name))) ||
      (p.isMemberExpression() &&
        property(p.node) === "domElement" &&
        rendererObject(p.get("object")));
    const change = (p, name, message) => {
      replacements.set(p.node, native(name));
      add(file, p.node, "info", "TN001", message);
    };
    const unsupportedBrowser = (p, label, fix) =>
      add(
        file,
        p.node,
        "error",
        "TN201",
        `${label} needs a native adaptation.`,
        fix ??
          "Move this browser-only code to your web entry, or export createScene(context) and implement it in the native host.",
      );
    const hasFactory = ast.program.body.some(
      (node) =>
        t.isExportNamedDeclaration(node) &&
        ((t.isFunctionDeclaration(node.declaration) &&
          node.declaration.id?.name === "createScene") ||
          (t.isVariableDeclaration(node.declaration) &&
            node.declaration.declarations.some((d) =>
              t.isIdentifier(d.id, { name: "createScene" }),
            )) ||
          node.specifiers.some((s) => s.exported?.name === "createScene")),
    );
    if (entry) mode = hasFactory ? "scene" : "entry";
    const automatic = entry && mode === "entry";
    traverse(ast, {
      Program(p) {
        program = p;
        bridge = p.scope.generateUidIdentifier("native");
      },
      ImportDeclaration(p) {
        if (p.node.importKind === "type") return;
        imports.push({ node: p.node.source, value: p.node.source.value });
        if (
          ["three", "three/webgpu"].includes(p.node.source.value) ||
          /^three\/(?:addons|examples\/jsm)\/loaders\//.test(
            p.node.source.value,
          )
        ) {
          for (const s of p.get("specifiers")) {
            threeNames.set(
              s.scope.getBinding(s.node.local.name),
              s.isImportNamespaceSpecifier() ? "*" : s.node.imported?.name,
            );
          }
        }
      },
      ExportNamedDeclaration(p) {
        if (p.node.source && p.node.exportKind !== "type")
          imports.push({ node: p.node.source, value: p.node.source.value });
      },
      ExportAllDeclaration(p) {
        imports.push({ node: p.node.source, value: p.node.source.value });
      },
      NewExpression(p) {
        if (isThree(p.get("callee"), ["WebGLRenderer", "WebGPURenderer"])) {
          rendererCount++;
          rendererNode = p.node;
          if (!automatic) {
            add(
              file,
              p.node,
              "error",
              "TN202",
              "Renderer creation is only auto-adapted in the configured browser entry.",
              "Keep renderer startup in that entry, or use the renderer provided to createScene(context).",
            );
            return;
          }
          const declaration = p.parentPath;
          if (
            !declaration.isVariableDeclarator() ||
            !t.isIdentifier(declaration.node.id)
          ) {
            add(
              file,
              p.node,
              "error",
              "TN203",
              "The renderer must be assigned to a named variable.",
              "Use const renderer = new THREE.WebGLRenderer(...).",
            );
            return;
          }
          rendererBinding = declaration.scope.getBinding(
            declaration.node.id.name,
          );
          const options = p.node.arguments[0];
          if (options && !t.isObjectExpression(options))
            add(
              file,
              options,
              "error",
              "TN204",
              "Renderer options cannot be inspected.",
              "Use an object literal with canvas and/or antialias: true; configure other native settings through createScene(context).",
            );
          if (t.isObjectExpression(options)) {
            for (const option of options.properties) {
              const key = option.key?.name ?? option.key?.value;
              if (key === "canvas" && t.isObjectProperty(option)) {
                if (
                  t.isIdentifier(option.value) &&
                  p.scope.getBinding(option.value.name)
                )
                  canvasBindings.add(p.scope.getBinding(option.value.name));
              } else if (
                key !== "antialias" ||
                !t.isBooleanLiteral(option.value, { value: true })
              ) {
                add(
                  file,
                  option,
                  "error",
                  "TN204",
                  `Unsupported renderer option: ${key ?? "spread"}.`,
                  "Remove this option or export createScene(context) to configure native rendering explicitly.",
                );
              }
            }
          }
          replacements.set(
            p.node,
            t.callExpression(native("createRenderer"), []),
          );
          add(
            file,
            p.node,
            "info",
            "TN002",
            "Replace browser renderer startup with the host's native WebGPU renderer.",
          );
        }
        if (isThree(p.get("callee"), ["ShaderMaterial", "RawShaderMaterial"])) {
          add(
            file,
            p.node,
            "error",
            "TN301",
            "GLSL ShaderMaterial cannot run through the native WebGPU target.",
            "Port vertex/fragment shaders to Three.js TSL/NodeMaterial, then import the node material from three/webgpu.",
          );
        }
        if (
          p.parentPath.isVariableDeclarator() &&
          t.isIdentifier(p.parentPath.node.id) &&
          isThree(p.get("callee"), [
            "GLTFLoader",
            "RGBELoader",
            "TextureLoader",
            "DRACOLoader",
            "KTX2Loader",
          ])
        )
          loaderBindings.set(
            p.scope.getBinding(p.parentPath.node.id.name),
            isThree(p.get("callee"), ["GLTFLoader"]) ? "glb" : "image",
          );
      },
    });
    traverse(ast, {
      JSXElement(p) {
        add(
          file,
          p.node,
          "error",
          "TN302",
          "Browser JSX is not a portable Three.js entry.",
          "Point entry at the Three.js scene module; mount native UI separately. React Three Fiber is not supported by this adapter.",
        );
        p.skip();
      },
      ExportDefaultDeclaration(p) {
        if (automatic)
          add(
            file,
            p.node,
            "error",
            "TN205",
            "A default export does not describe how to start this game.",
            "Run startup at module scope, or export a named createScene(context) factory.",
          );
      },
      MetaProperty(p) {
        add(
          file,
          p.node,
          "error",
          "TN303",
          "import.meta depends on your browser bundler.",
          "Use a static asset import with context.resolveAsset(), or pass configuration explicitly.",
        );
      },
      CallExpression(p) {
        const callee = p.get("callee");
        if (callee.isImport() || isGlobal(callee, "require")) {
          const arg = p.node.arguments[0];
          if (t.isStringLiteral(arg))
            imports.push({ node: arg, value: arg.value });
          else
            add(
              file,
              p.node,
              "error",
              "TN103",
              "A computed module or asset path cannot be bundled reliably.",
              "Replace it with explicit static imports or require() calls for each file.",
            );
        }
        if (!callee.isMemberExpression()) return;
        const name = property(callee.node),
          object = callee.get("object");
        if (rendererObject(object)) {
          if (name === "render") renderCalls++;
          if (!rendererMembers.has(name))
            add(
              file,
              p.node,
              "error",
              "TN206",
              `renderer.${name ?? "[computed]"} is not supported by automatic adaptation.`,
              "Use a single renderer.render(scene, camera) call; move custom render targets, postprocessing, or WebGL access to a WebGPU createScene adapter.",
            );
        }
        const loaderKind = object.isIdentifier()
          ? loaderBindings.get(p.scope.getBinding(object.node.name))
          : object.isNewExpression() &&
              isThree(object.get("callee"), [
                "GLTFLoader",
                "RGBELoader",
                "TextureLoader",
                "DRACOLoader",
                "KTX2Loader",
              ])
            ? isThree(object.get("callee"), ["GLTFLoader"])
              ? "glb"
              : "image"
            : null;
        if (["load", "loadAsync"].includes(name) && loaderKind)
          add(
            file,
            p.node,
            "error",
            "TN304",
            "URL-based Three.js asset loading needs native asset resolution.",
            loaderKind === "glb"
              ? "Statically import a self-contained .glb, resolve it with context.resolveAsset(), fetch its arrayBuffer(), and call GLTFLoader.parseAsync(bytes, ''). Use createScene(context) for this loader."
              : "Statically import the asset, resolve it with context.resolveAsset(), and use a React Native WebGPU-compatible image/byte loader inside createScene(context).",
          );
        if (
          automatic &&
          name === "appendChild" &&
          object.matchesPattern("document.body") &&
          !p.scope.getBinding("document") &&
          canvasObject(p.get("arguments.0"))
        ) {
          replacements.set(p.node, t.callExpression(native("mount"), []));
          add(
            file,
            p.node,
            "info",
            "TN003",
            "Mount the canvas in the native host instead of document.body.",
          );
          return;
        }
        if (
          automatic &&
          ["querySelector", "getElementById"].includes(name) &&
          isGlobal(object, "document")
        ) {
          const inCanvasOption =
            p.parentPath.isObjectProperty() &&
            (p.parentPath.node.key.name ?? p.parentPath.node.key.value) ===
              "canvas" &&
            p.findParent((parent) => parent.node === rendererNode);
          const assignedCanvas =
            p.parentPath.isVariableDeclarator() &&
            canvasBindings.has(
              p.parentPath.scope.getBinding(p.parentPath.node.id.name),
            );
          if (inCanvasOption || assignedCanvas) {
            change(
              p,
              "canvas",
              "Use the host canvas instead of looking up an HTML canvas.",
            );
            return;
          }
        }
        if (
          ["addEventListener", "removeEventListener"].includes(name) &&
          (isGlobal(object, "window") ||
            isGlobal(object, "document") ||
            canvasObject(object))
        ) {
          const event = p.node.arguments[0];
          if (
            !automatic ||
            !t.isStringLiteral(event) ||
            !pointerEvents.has(event.value)
          ) {
            unsupportedBrowser(
              p,
              `Event listener ${t.isStringLiteral(event) ? event.value : "with a computed event name"}`,
              "Use resize or pointerdown/pointermove/pointerup/pointercancel/click in the browser entry. Keyboard, wheel, DOM loading, and multitouch controls need a native implementation.",
            );
          } else
            add(
              file,
              p.node,
              "info",
              "TN004",
              `Map ${event.value} to native viewport/touch events.`,
            );
        }
      },
      MemberExpression(p) {
        if (covered(p)) return;
        const name = property(p.node);
        if (name === "onBeforeCompile")
          add(
            file,
            p.node,
            "error",
            "TN301",
            "onBeforeCompile changes GLSL shader source.",
            "Port this customization to Three.js TSL/NodeMaterial for WebGPU.",
          );
        const object = p.get("object");
        if (
          automatic &&
          isGlobal(object, "window") &&
          ["requestAnimationFrame", "cancelAnimationFrame"].includes(name)
        )
          change(
            p,
            name,
            "Schedule the existing loop on the native render clock.",
          );
        if (
          automatic &&
          isGlobal(object, "window") &&
          [
            "innerWidth",
            "innerHeight",
            "devicePixelRatio",
            "addEventListener",
            "removeEventListener",
          ].includes(name)
        )
          change(
            object,
            "window",
            "Use native viewport dimensions and event dispatch.",
          );
        if (
          automatic &&
          isGlobal(object, "document") &&
          ["addEventListener", "removeEventListener"].includes(name)
        )
          change(object, "document", "Use native touch event dispatch.");
        if (automatic && isGlobal(object, "performance") && name === "now")
          change(p, "now", "Use the host animation clock.");
      },
      ReferencedIdentifier(p) {
        if (covered(p) || p.scope.getBinding(p.node.name)) return;
        const name = p.node.name;
        if (
          automatic &&
          ["innerWidth", "innerHeight", "devicePixelRatio"].includes(name)
        ) {
          replacements.set(
            p.node,
            t.memberExpression(native("window"), t.identifier(name)),
          );
          add(file, p.node, "info", "TN001", "Use native viewport dimensions.");
        } else if (
          automatic &&
          ["requestAnimationFrame", "cancelAnimationFrame"].includes(name)
        )
          change(
            p,
            name,
            "Schedule the existing loop on the native render clock.",
          );
        else if (
          [
            "window",
            "document",
            "localStorage",
            "sessionStorage",
            "Audio",
            "AudioContext",
            "Image",
            "Worker",
            "OffscreenCanvas",
            "setInterval",
            "setTimeout",
            "globalThis",
            "self",
            "navigator",
            "requestAnimationFrame",
            "cancelAnimationFrame",
            "performance",
          ].includes(name)
        )
          unsupportedBrowser(p, name);
      },
    });
    if (automatic && rendererCount !== 1)
      add(
        file,
        rendererNode ?? ast.program,
        "error",
        "TN207",
        `Expected one browser renderer; found ${rendererCount}.`,
        "Point entry at the module that creates the renderer, or export createScene(context) returning { scene, camera, update }.",
      );
    if (automatic && renderCalls !== 1)
      add(
        file,
        rendererNode ?? ast.program,
        "error",
        "TN208",
        `Expected one renderer.render(scene, camera) call site; found ${renderCalls}.`,
        "Use one render call inside your animation loop. Custom multipass rendering needs an explicit WebGPU adapter.",
      );
    for (const item of imports) {
      if (item.value.startsWith(".")) {
        const resolved = await resolveLocal(file, item.value, item.node);
        if (resolved && codeExtensions.includes(path.extname(resolved)))
          await scan(resolved);
        else if (resolved && /\.(css|scss|sass|html)$/.test(resolved))
          add(
            file,
            item.node,
            "error",
            "TN305",
            `Browser presentation import: ${item.value}`,
            "Keep CSS/HTML imports in the web entry and style native UI in React Native.",
          );
        if (entry && resolved)
          item.node.value = path
            .relative(path.join(config.root, ".three-native"), resolved)
            .split(path.sep)
            .join("/");
      } else if (
        !/^(three(?:\/|$)|@jstxn\/three-native(?:\/|$))/.test(item.value)
      ) {
        const blocked = /^(react-dom|@react-three\/|node:|fs$|path$)/.test(
          item.value,
        );
        add(
          file,
          item.node,
          blocked ? "error" : "warning",
          blocked ? "TN306" : "TN401",
          `Dependency ${item.value} ${blocked ? "is not supported by this native adapter" : "has not been checked for React Native compatibility"}.`,
          blocked
            ? "Use a portable Three.js module as the entry and replace browser/Node integration with a native equivalent."
            : "Verify this package on iOS; third-party package internals are not scanned.",
        );
      } else if (
        /three\/(?:addons|examples\/jsm)\/(?:postprocessing|renderers)\//.test(
          item.value,
        )
      ) {
        add(
          file,
          item.node,
          "error",
          "TN307",
          "WebGL postprocessing/renderers need a WebGPU port.",
          "Use Three.js WebGPU/TSL equivalents in an explicit createScene(context) factory.",
        );
      } else if (/OrbitControls/.test(item.value) && automatic)
        add(
          file,
          item.node,
          "warning",
          "TN402",
          "OrbitControls maps single-finger drag to rotation.",
          "Pinch, two-finger pan, keyboard, and wheel input are not provided by this adapter.",
        );
    }
    if (automatic && !diagnostics.some((item) => item.severity === "error")) {
      traverse(ast, {
        enter(p) {
          const replacement = replacements.get(p.node);
          if (replacement) {
            p.replaceWith(t.cloneNode(replacement, true));
            p.skip();
          }
        },
      });
      const importNodes = ast.program.body.filter((node) =>
        t.isImportDeclaration(node),
      );
      for (const node of importNodes) {
        if (["three", "three/webgpu"].includes(node.source.value))
          node.specifiers = node.specifiers.filter(
            (s) =>
              !["WebGLRenderer", "WebGPURenderer"].includes(s.imported?.name),
          );
      }
      const body = ast.program.body
        .filter((node) => !t.isImportDeclaration(node))
        .map((node) =>
          t.isExportNamedDeclaration(node) ? node.declaration : node,
        )
        .filter(Boolean);
      const context = program.scope.generateUidIdentifier("context");
      const start = program.scope.generateUidIdentifier("startEntry");
      const factory = program.scope.generateUidIdentifier("createScene");
      ast.program.body = [
        t.importDeclaration(
          [t.importSpecifier(start, t.identifier("createEntryScene"))],
          t.stringLiteral("./BrowserEntry.mjs"),
        ),
        ...importNodes,
        t.functionDeclaration(
          factory,
          [context],
          t.blockStatement([
            t.returnStatement(
              t.callExpression(start, [
                context,
                t.arrowFunctionExpression(
                  [bridge],
                  t.blockStatement(body),
                  true,
                ),
              ]),
            ),
          ]),
        ),
        t.exportNamedDeclaration(null, [
          t.exportSpecifier(factory, t.identifier("createScene")),
        ]),
      ];
      generatedCode =
        transformFromAstSync(ast, source, {
          filename: file,
          configFile: false,
          babelrc: false,
          sourceMaps: "inline",
          sourceFileName: file,
        }).code + "\n";
    }
  }
  await scan(config.entry, true);
  diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.code.localeCompare(b.code),
  );
  return {
    mode,
    files,
    diagnostics,
    code: generatedCode,
    ok: !diagnostics.some((d) => d.severity === "error"),
  };
}
