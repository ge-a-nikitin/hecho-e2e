import type { QaseCase } from "../types.js";

/**
 * Administration: assignment, accounts and categories.
 *
 * One entry per test in `tests/admin/admin.spec.ts`. Every case ends on the
 * persona the change was made for — the executor who receives an order, the
 * account that can or cannot sign in, the customer's form that offers a category
 * — because an administrator's own screen is the weakest evidence that the change
 * took effect.
 */
export const adminCases = [
  {
    key: "admin.orders.assign",
    title: "Assigns a pool order to an executor and takes it out of the pool",
    suite: ["E2E", "Administration", "Assignment"],
    description:
      "The administrator assigns a pooled order to a chosen executor: the order leaves the pool, names " +
      "that executor and offers them the estimate form. The case reads the executor's own panel, because " +
      "an assignment the executor cannot act on is not an assignment.",
    preconditions:
      "A customer order submitted without an executor, an executor account with no orders, and the " +
      "administrator's session.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The pooled order offers the assign form with a list of executors.",
      },
      {
        action: "Choose the executor and submit the assignment.",
        expected: "The order shows the executor it now belongs to.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The order is assigned to the chosen executor.",
      },
      {
        action: "Sign in as that executor and open the executor panel.",
        expected:
          "The order offers no claim action and does offer the estimate form, so it is the executor's work.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "admin.orders.reassign",
    title: "Reassigns an order to another executor and withdraws the pending estimate",
    suite: ["E2E", "Administration", "Assignment"],
    description:
      "Reassigning an assigned order moves it to another executor and withdraws the proposal the previous " +
      "one made, because the new executor has a rate of their own and has to price the work again. The " +
      "case asserts the withdrawn estimate and the second executor's estimate form.",
    preconditions:
      "A customer account, two executors with rates, and an order assigned to the first one with a pending estimate.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The assigned order offers the assign form with the second executor.",
      },
      {
        action: "Reassign the order to the second executor.",
        expected: "The order shows the new executor.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected:
          "The order is assigned to the new executor and the previous proposal is withdrawn.",
      },
      {
        action: "Sign in as the second executor, then as the first, and open the executor panel.",
        expected:
          "The new executor is offered the estimate form and the previous one is not offered any action.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "admin.orders.assign-claimed",
    title: "Refuses to assign an order to the executor who already owns it",
    suite: ["E2E", "Administration", "Guards"],
    description:
      "An assignment has to move the order to somebody else: the select does not offer the executor who " +
      "already owns it, and the same assignment sent to the API is refused with a state conflict that " +
      "leaves the order with the executor it had.",
    preconditions:
      "A customer account, an executor account, and an order already assigned to that executor.",
    steps: [
      {
        action: "Sign in as the administrator and open the administrator panel.",
        expected: "The assign form offers the executors, and the current owner cannot be chosen.",
      },
      {
        action: "Send the same assignment to the API with the page's own session.",
        expected: "The API answers 409 with a state conflict.",
      },
      {
        action: "Read the order through the API as the administrator.",
        expected: "The order is still assigned to the same executor.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
  {
    key: "admin.users.create-executor",
    title: "Creates an executor account that can sign in",
    suite: ["E2E", "Administration", "Accounts"],
    description:
      "The administrator creates an executor from the accounts screen, and the account works: the " +
      "credentials the form took sign in, the panel that opens is the executor's, and the profile confirms " +
      "the role. Only executors are created here, because customers register themselves.",
    preconditions:
      "The administrator's session and a unique e-mail address for the new account.",
    steps: [
      {
        action: "Sign in as the administrator and open the accounts screen.",
        expected: "The screen offers the form that creates an executor.",
      },
      {
        action: "Fill the name, the e-mail and the password and submit.",
        expected: "The executor list shows the new account with its e-mail.",
      },
      {
        action: "Sign in with the new credentials.",
        expected: "The executor panel opens.",
      },
      {
        action: "Open the profile.",
        expected: "The profile names the executor role and offers the hourly rate card.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "admin.users.reset-password",
    title: "Resets an executor password and the old one stops working",
    suite: ["E2E", "Administration", "Accounts"],
    description:
      "There is no password recovery by e-mail, so an administrator resets the password from the account " +
      "row. The case proves the reset reached the credential: the old password is refused on the sign-in " +
      "form and the new one opens the panel.",
    preconditions:
      "An executor account created through the administrator endpoint, whose credentials the case knows.",
    steps: [
      {
        action: "Sign in as the administrator, open the accounts screen and reset the password.",
        expected: "The account keeps its place in the list.",
      },
      {
        action: "Sign in with the old password.",
        expected: "The sign-in form stays on screen and no panel opens.",
      },
      {
        action: "Sign in with the new password.",
        expected: "The executor panel opens.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "admin.users.deactivate",
    title: "Deactivates an executor and blocks the sign-in",
    suite: ["E2E", "Administration", "Accounts"],
    description:
      "A deactivated executor keeps the account but loses the workspace: the panel loads and every domain " +
      "call is refused, so the order list shows its load error instead of work. The case asserts the " +
      "refusal on the screen and on the API, because the sign-in itself is not what the product blocks.",
    preconditions:
      "An executor account with no unfinished orders, because an account with orders cannot be deactivated, " +
      "and the administrator's session.",
    steps: [
      {
        action: "Sign in as the administrator, open the accounts screen and deactivate the executor.",
        expected: "The row shows the account as inactive.",
      },
      {
        action: "Sign in as the deactivated executor and open the executor panel.",
        expected: "The panel reports a load error instead of an order list.",
      },
      {
        action: "Read the own profile through the API with the page's session.",
        expected: "The API answers 401, so the account cannot use the domain at all.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
  {
    key: "admin.categories.create",
    title: "Creates a category that the customer's form then offers",
    suite: ["E2E", "Administration", "Categories"],
    description:
      "Only an administrator creates categories, and the point of one is that a customer can choose it: " +
      "the case creates the category on the administrator's screen and then selects it by name on the " +
      "customer's create-order form, which proves it reached the list the form builds from.",
    preconditions:
      "The administrator's session, a customer account, and a category name unique to the case.",
    steps: [
      {
        action: "Sign in as the administrator and open the categories screen.",
        expected: "The screen offers the form that creates a category.",
      },
      {
        action: "Fill the name and submit.",
        expected: "The category list shows the new category.",
      },
      {
        action: "Sign in as the customer, open the panel and open the create-order form.",
        expected: "The category select offers the new category and accepts it as a choice.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "admin.categories.deactivate",
    title: "Deactivates a category and the customer's form stops offering it",
    suite: ["E2E", "Administration", "Categories"],
    description:
      "A deactivated category stops being offered to customers while it keeps existing for the orders that " +
      "already carry it. The case asserts the absence on the customer's form next to the presence of a " +
      "category that stayed active, so it cannot pass on a form that lost every category.",
    preconditions:
      "The administrator's session, a customer account, and two categories with names unique to the case.",
    steps: [
      {
        action: "Sign in as the administrator, open the categories screen and deactivate one category.",
        expected: "The row shows the category as inactive.",
      },
      {
        action: "Sign in as the customer and open the create-order form.",
        expected:
          "The category select offers the active category and does not offer the deactivated one.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
] as const satisfies readonly QaseCase[];
