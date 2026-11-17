import type { QaseCase } from "../types.js";

/**
 * Profile: the account's own data.
 *
 * One entry per test in `tests/profile/profile.spec.ts`. The screen is shared by
 * every role, so the module also holds the role boundary: a customer's profile
 * must not offer the executor's rate form.
 */
export const profileCases = [
  {
    key: "profile.customer.name",
    title: "Renames the account and the profile keeps the new name",
    suite: ["E2E", "Profile", "Name"],
    description:
      "A customer edits the name on their own profile and saves it: the field shows the new value, the " +
      "stored account carries it and a reload reads it back. The API wants the current password as proof, " +
      "so saving is also the case's check that the form sends it.",
    preconditions:
      "A customer account created for the case, whose password the case knows, and a name unique to the case.",
    steps: [
      {
        action: "Sign in as the customer and open the profile.",
        expected: "The profile form holds the account's current name and names the customer role.",
      },
      {
        action: "Replace the name and save with the current password.",
        expected: "The name field shows the new value.",
      },
      {
        action: "Read the account through the API.",
        expected: "The stored name is the new one.",
      },
      {
        action: "Reload the profile.",
        expected: "The new name is still shown.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "profile.executor.rate-read",
    title: "Shows the saved hourly rate on the executor's profile",
    suite: ["E2E", "Profile", "Rate (read)"],
    description:
      "An executor whose rate is set sees it on the profile card and in the rate form, and a reload keeps " +
      "it. The rate is the value an estimate amount is computed from, so reading the stored one rather " +
      "than a default is what makes every estimate assertable.",
    preconditions: "An executor account whose hourly rate the case has already set.",
    steps: [
      {
        action: "Sign in as the executor and open the profile.",
        expected: "The rate card and the rate form are visible.",
      },
      {
        action: "Read the value the rate field holds.",
        expected: "It is the rate the precondition wrote.",
      },
      {
        action: "Reload the profile.",
        expected: "The same rate is shown and the save action is still offered.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "profile.customer.role-boundary",
    title: "Offers a customer no hourly rate and the role as read-only",
    suite: ["E2E", "Profile", "Role boundary"],
    description:
      "The hourly rate is an executor attribute: a customer's profile names the role and offers no rate " +
      "form, so the screen does not invite an action the API would refuse with a forbidden answer.",
    preconditions: "A customer account with its own sign-in.",
    steps: [
      {
        action: "Sign in as the customer and open the profile.",
        expected: "The role block names the customer role and the name and e-mail fields are offered.",
      },
      {
        action: "Look for the rate controls.",
        expected: "Neither the rate card, the rate form nor the rate field is rendered.",
      },
    ],
    severity: "minor",
    priority: "low",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "profile.password.change",
    title: "Changes the password from the profile and signs in with the new one",
    suite: ["E2E", "Profile", "Password"],
    description:
      "The customer changes the password from their profile, and the credential is what changed: the new " +
      "password opens the panel and the old one is refused on the form. The second half is the point — a " +
      "form that says success while the old password still works would pass a one-sided case.",
    preconditions:
      "A customer account created for the case, whose current password the case knows, and a new password " +
      "chosen by the case.",
    steps: [
      {
        action: "Sign in as the customer, open the profile and open the password form.",
        expected: "The form offers a current, a new and a confirmation field.",
      },
      {
        action: "Fill the three fields and submit.",
        expected: "The form reports the change and stays on the profile.",
      },
      {
        action: "Sign in with the new password.",
        expected: "The customer panel opens.",
      },
      {
        action: "Sign in with the original password.",
        expected: "The sign-in form stays on screen and no panel opens.",
      },
    ],
    severity: "critical",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "profile.password.wrong-current",
    title: "Refuses a password change when the current password is wrong",
    suite: ["E2E", "Profile", "Rejections"],
    description:
      "A wrong current password does not change the credential: the form stays open, the old password " +
      "keeps working and the password the case tried to set does not. The pair of sign-ins is what proves " +
      "nothing was written.",
    preconditions:
      "A customer account created for the case, whose current password the case knows.",
    steps: [
      {
        action: "Sign in as the customer, open the password form and submit it with a wrong current password.",
        expected: "The password form is still on screen.",
      },
      {
        action: "Sign in with the original password.",
        expected: "The customer panel opens.",
      },
      {
        action: "Sign in with the password the form tried to set.",
        expected: "The sign-in form stays on screen and no panel opens.",
      },
    ],
    severity: "major",
    priority: "low",
    layer: "e2e",
    type: "security",
    behavior: "negative",
  },
] as const satisfies readonly QaseCase[];
