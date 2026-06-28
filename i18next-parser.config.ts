export default {
  locales: ["ja", "en"],
  output: "src/locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}", "!src/**/*.stories.tsx", "!src/**/*.test.{ts,tsx}"],
  defaultNamespace: "common",
  // i18next-parser only extracts keys from string-literal t() calls. It cannot
  // resolve dynamic keys (t(map[x]), t(variable)) or keys whose runtime
  // namespace differs from where they are stored. keepRemoved must stay true so
  // those live keys are never deleted on a parser run. Prune dead keys manually.
  keepRemoved: true,
  sort: true,
  verbose: false,
  failOnWarnings: false,
  createOldCatalogs: false,
};
