import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // COD-007: cópias antigas do projeto, bibliotecas copiadas e builds dos
    // instaladores não são código do sistema.
    ".claude/**",
    "installer-*/**",
    "**/build/**",
    "**/dist/**",
    "public/app/**",
    "app-*/www/jsQR.js",
    "app-*/android/**",
    "app-*/ios/**",
  ]),
]);

export default eslintConfig;
