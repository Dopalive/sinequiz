// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    rules: {
      // Reanimated shared values are mutated by design (`sv.value = withSpring(...)`) inside event
      // handlers and effects; the React Compiler rule reads that as mutating immutable hook state.
      "react-hooks/immutability": "off",
    },
  },
]);
