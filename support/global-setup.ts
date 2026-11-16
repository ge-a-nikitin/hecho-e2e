import { DevtoolsClient } from "./devtools.js";
import { RESET_MODE, STACK_MODE } from "./env.js";
import { ensureStack } from "./stack.js";

/**
 * Runs once before every project: makes sure the stack answers, that its devtools
 * API is usable, and that the database starts from a known state.
 *
 * The reset is what lets a case assert an empty list or an exact order count. It
 * is skipped with E2E_RESET=never, which is the only mode that makes sense
 * against an environment somebody else also uses.
 */
export default async function globalSetup(): Promise<void> {
  await ensureStack();

  if (STACK_MODE === "off" && RESET_MODE !== "never") {
    throw new Error(
      "E2E_STACK=off skips the stack check, so E2E_RESET must be never: an unattended reset " +
        "against an unknown environment would destroy its data.",
    );
  }

  const devtools = new DevtoolsClient();
  await devtools.verify();

  if (RESET_MODE === "run") {
    await devtools.reset();
    console.info("[stack] database reset, administrator recreated from ADMIN_EMAIL/ADMIN_PASSWORD");
  }
}
