export default {
  locales: ["ja", "en"],
  output: "src/locales/$LOCALE/$NAMESPACE.json",
  input: ["src/**/*.{ts,tsx}", "!src/**/*.stories.tsx", "!src/**/*.test.{ts,tsx}"],
  defaultNamespace: "common",
  keepRemoved: false,
  sort: true,
  verbose: false,
  failOnWarnings: false,
  createOldCatalogs: false,
};
