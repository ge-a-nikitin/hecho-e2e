import type { QaseCase } from "../types.js";

/**
 * Access control, as far as a screen can show it.
 *
 * The role and ownership rules are enforced on the server and asserted at the API
 * level, where every client is covered; what the browser adds is the redirect a
 * wrong role gets when it opens a panel route. The web layer pins the role checks
 * it can see, so this slice holds exactly one screen case.
 */
export const guardsCases = [
  {
    key: "guards.ui.foreign-panel",
    title: "Redirects a role away from another role's panel",
    suite: ["E2E", "Access control", "Screen guard"],
    description:
      "A signed-in customer who types the address of another role's panel is returned to their own panel " +
      "instead: the foreign panel never renders, and the address is the assertion because the redirect " +
      "only happens once the session has loaded. Only a browser without a session reaches the sign-in " +
      "form, which is why the last step walks the customer's own panel.",
    preconditions: "The stored session of the baseline customer.",
    steps: [
      {
        action: "Open the administrator panel address.",
        expected:
          "The address becomes the customer panel route and the administrator panel is not rendered.",
      },
      {
        action: "Open the executor panel address.",
        expected: "The address becomes the customer panel route and the executor panel is not rendered.",
      },
      {
        action: "Open the customer panel address.",
        expected:
          "The customer panel is visible, so the session is healthy and only the foreign panels were refused.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "security",
    behavior: "positive",
  },
] as const satisfies readonly QaseCase[];
