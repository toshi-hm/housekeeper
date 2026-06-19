export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "docs", "refactor", "test", "chore", "ci", "perf", "revert"],
    ],
    "subject-max-length": [2, "always", 80],
  },
};
