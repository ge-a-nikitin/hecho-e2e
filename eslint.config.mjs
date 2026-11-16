import js from "@eslint/js";
import playwright from "eslint-plugin-playwright";
import tseslint from "typescript-eslint";

/**
 * Flat config for the end-to-end repository.
 *
 * The suites are the product here, so the rules concentrate on the two ways an
 * E2E test rots: a weak oracle and a conditional that hides a step. Locator
 * policy (test ids only) is documented in docs/conventions.md, because no lint
 * rule can tell a good CSS selector from a bad one.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "blob-report/**",
      "docs/generated/**",
      ".auth/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript owns identifier resolution and unused declarations.
      "no-undef": "off",
      "no-unused-vars": "off",
      // Playwright fixtures must start with a destructuring pattern, which is
      // legitimately empty when a fixture needs no other fixture.
      "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["tests/**/*.ts", "pages/**/*.ts", "support/**/*.ts", "qase/**/*.ts"],
    plugins: { playwright },
    rules: {
      "playwright/no-focused-test": "error",
      "playwright/no-force-option": "error",
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-element-handle": "error",
      "playwright/no-eval": "error",
      "playwright/missing-playwright-await": "error",
      "playwright/valid-expect": "error",
      "playwright/no-conditional-in-test": "error",
      "playwright/no-skipped-test": [
        "error",
        // A case that only makes sense on one viewport guards itself with a
        // reasoned, conditional skip (`test.skip(cond, reason)`); a bare
        // `test.skip()` stays an error because it silently drops a test.
        { allowConditional: { skip: true } },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toBeDefined']",
          message:
            "Assert the value or the property itself: `toBeDefined()` prints only `undefined` and hides which field broke.",
        },
        {
          selector: "BinaryExpression[operator='in']",
          message:
            "Assert the property with `toHaveProperty` instead of the `in` operator: it also counts inherited members.",
        },
        {
          selector: "CallExpression[callee.property.name='only']",
          message: "Remove `.only` before committing: it silently skips every other test.",
        },
      ],
    },
  },
);
