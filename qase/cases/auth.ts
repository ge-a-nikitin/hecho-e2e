import type { QaseCase } from "../types.js";

/**
 * Public pages and the session they create.
 *
 * One entry per test in `tests/auth/auth.spec.ts`. The suite path keeps the draft
 * slice name (`Public + auth`) so a reader can walk from the case list to the
 * draft without a translation table.
 */
export const authCases = [
  {
    key: "auth.sign-in.panel",
    title: "Signs a customer in from the landing page and opens the customer panel",
    suite: ["E2E", "Public + auth", "Sign-in"],
    description:
      "A visitor lands on the marketing page, follows the sign-in link, authenticates with the baseline " +
      "customer and is left on the customer panel. It is the first step of every other journey in the " +
      "suite, and the only place where the session cookie and the redirect after signing in are " +
      "observed together.",
    preconditions:
      "The baseline customer account the setup project stores, and a browser without a session.",
    steps: [
      {
        action: "Open the landing page.",
        expected: "The landing page is visible and offers the sign-in link.",
      },
      {
        action: "Follow the sign-in link.",
        expected: "The sign-in screen is on screen with the e-mail, password and submit controls.",
      },
      {
        action: "Sign in with the shared sign-in step.",
        expected: "The customer panel is visible and the address is the customer panel route.",
      },
      {
        action: "Open the landing page again and follow the dashboard link.",
        expected:
          "The page offers the dashboard instead of sign-in, and the link opens the customer panel.",
      },
    ],
    severity: "blocker",
    priority: "high",
    layer: "e2e",
    type: "smoke",
    behavior: "positive",
  },
  {
    key: "auth.register.customer",
    title: "Registers a new customer and opens that customer's panel",
    suite: ["E2E", "Public + auth", "Registration"],
    description:
      "A visitor creates a customer account through the public form and reaches a customer panel that " +
      "belongs to that account. Registration is the only path by which a customer exists without an " +
      "administrator, so the case proves the account, the session and the panel in one walk.",
    preconditions:
      "A unique e-mail address for this case and the documented fixture password; the baseline accounts " +
      "are left alone.",
    steps: [
      {
        action: "Open the registration page.",
        expected: "The registration form offers a name, an e-mail, a password and a submit control.",
      },
      {
        action: "Fill the three fields with a new account and submit.",
        expected:
          "The customer panel opens, and it shows the empty board because the account has no orders.",
      },
      {
        action: "Reload the panel.",
        expected: "The session survives the reload and the empty board is still shown.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "auth.sign-out.control",
    title: "Signs out from the panel and needs a new sign-in to return",
    suite: ["E2E", "Public + auth", "Sign-out"],
    description:
      "A signed-in customer uses whichever sign-out control the viewport shows and is returned to the " +
      "public page. Afterwards the panel is no longer reachable: the route guard sends the browser to " +
      "the sign-in form, which is the part of sign-out a cookie check alone cannot prove.",
    preconditions:
      "A customer account created for the case with its own sign-in, because signing out revokes the " +
      "session on the server and the stored baseline session is shared with every other case.",
    steps: [
      {
        action: "Sign the account in and open the customer panel.",
        expected: "The customer panel is visible.",
      },
      {
        action: "Click the sign-out control the viewport shows.",
        expected: "The landing page is visible and offers sign-in again.",
      },
      {
        action: "Open the customer panel address.",
        expected: "The address becomes the sign-in route and the customer panel is not rendered.",
      },
    ],
    severity: "critical",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "auth.landing.session-aware",
    title: "Shows a signed-in visitor the way to their own panel",
    suite: ["E2E", "Public + auth", "Landing"],
    description:
      "An executor who opens the public page while signed in is offered a link to their own panel " +
      "instead of a sign-in link, and the link leads to the executor panel rather than to a generic " +
      "one. The page has to read the session, which no unit test of the landing page can do.",
    preconditions: "The stored session of the baseline executor.",
    steps: [
      {
        action: "Open the landing page.",
        expected: "The dashboard link is offered and the sign-in link is not.",
      },
      {
        action: "Follow the dashboard link.",
        expected: "The executor panel is visible and the address is the executor panel route.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "auth.session.replace",
    title: "Replaces a live session when another role signs in",
    suite: ["E2E", "Public + auth", "Session replacement"],
    description:
      "Signing in as another role while a session already exists swaps the session instead of stacking " +
      "two: the new panel opens and the previous role's panel is no longer reachable in that browser. " +
      "The case is what makes a second role reachable inside one case without a second browser context.",
    preconditions: "The stored session of the baseline customer.",
    steps: [
      {
        action: "Open the customer panel.",
        expected: "The customer panel is visible.",
      },
      {
        action: "Sign in as the baseline executor through the shared sign-in step.",
        expected: "The executor panel is visible.",
      },
      {
        action: "Open the customer panel address.",
        expected:
          "The address becomes the executor panel route, because the session now belongs to the executor.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "auth.sign-in.wrong-password",
    title: "Keeps the visitor on the sign-in form when the password is wrong",
    suite: ["E2E", "Public + auth", "Rejections"],
    description:
      "A wrong password is refused visibly: the visitor stays on the sign-in form with no panel behind " +
      "it, and the same form still accepts the right password immediately afterwards. The second half " +
      "is what keeps the case from passing on a form that simply never works.",
    preconditions:
      "The baseline customer e-mail and a password that is deliberately not the account's; the e2e stack " +
      "raises the attempt limit, so one wrong attempt is free.",
    steps: [
      {
        action: "Submit the sign-in form with the right e-mail and a wrong password.",
        expected: "The sign-in route stays on screen, the form is visible and no panel is rendered.",
      },
      {
        action: "Submit the same form with the account's password.",
        expected: "The customer panel is visible.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
