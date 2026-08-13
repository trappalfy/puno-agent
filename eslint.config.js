// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      // contracts/ is a pure Solidity/Foundry project with its own toolchain
      // (forge fmt, solc) — no first-party JS/TS lives there. lib/ in
      // particular is vendored third-party source (forge-std, OpenZeppelin).
      "contracts/**",
      // Next.js-managed — it appends the triple-slash reference itself on
      // every dev/build run; the file's own header says not to edit it.
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  eslintConfigPrettier,
);
