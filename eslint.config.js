const { defineConfig } = require("eslint/config");
const js = require("@eslint/js");
const expo = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  {
    ignores: [
      "**/dist/**",
      "ios/**",
      "android/**",
      "artifacts/**",
      "**/.three-native/**",
      ".agentdir/**",
      ".claude/**",
      ".cursor/**",
      ".windsurf/**",
    ],
  },
  js.configs.recommended,
  expo,
  {
    settings: {
      "import/resolver": {
        typescript: { project: ["tsconfig.json", "tsconfig.test.json"] },
        node: true,
      },
    },
  },
  {
    files: [
      "packages/three-native/{bin,lib,test}/**/*.{js,mjs}",
      "scripts/**/*.{js,mjs}",
      "tests/**/*.ts",
      "*.config.js",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.mjs"],
    settings: {
      "import/resolver": {
        typescript: { conditionNames: ["import", "node", "default"] },
        node: true,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          args: "none",
          ignoreRestSiblings: true,
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "none",
          ignoreRestSiblings: true,
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
