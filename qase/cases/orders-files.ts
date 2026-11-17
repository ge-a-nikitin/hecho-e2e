import type { QaseCase } from "../types.js";

/**
 * Customer / Orders: the comment thread and the files on an order card.
 *
 * One entry per test in `tests/orders/customer-order-files.spec.ts`. Both parts
 * only make sense across the role boundary, so every case acts on one side and
 * asserts on the other. The oversize upload is deliberately absent: the refusal
 * is a toast with no stable id, and the case waits for the SUT to expose the
 * error (`docs/backlog.md`).
 */
export const ordersFilesCases = [
  {
    key: "orders.comment.visibility",
    title: "Leaves a comment the other participant can read",
    suite: ["E2E", "Customer orders", "Comments"],
    description:
      "A customer writes a comment on an assigned order and the executor of that order reads it on the " +
      "same card. The case asserts the stored comment as well as the rendered one, because a thread that " +
      "is kept in the browser would pass a screen-only check.",
    preconditions:
      "A customer account, an executor with a rate, and an order assigned to that executor.",
    steps: [
      {
        action: "Sign in as the customer, open the order card and write a comment.",
        expected: "The comment is listed on the card as the customer wrote it.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order carries that comment.",
      },
      {
        action: "Sign in as the executor and open the same order card.",
        expected: "The comment is listed for the executor, so the other participant reads it.",
      },
    ],
    severity: "critical",
    priority: "high",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.attachment.upload",
    title: "Uploads an attachment the other participant can see",
    suite: ["E2E", "Customer orders", "Attachments"],
    description:
      "The customer attaches a picture to the draft, the API stores it with the type read from the bytes, " +
      "and the executor the order is submitted to finds the file on the card. A file the other side " +
      "cannot open would not be an attachment, so the case follows it to that panel.",
    preconditions:
      "A customer account, a draft owned by it, and an executor with a rate for the submission that follows.",
    steps: [
      {
        action: "Sign in as the customer and open the draft card.",
        expected: "The card offers the attachment form.",
      },
      {
        action: "Choose a PNG file and attach it.",
        expected: "The card lists the file under the name it was uploaded with.",
      },
      {
        action: "Read the order through the API as the customer.",
        expected: "The order carries one attachment with that name and the image type the bytes declare.",
      },
      {
        action: "Submit the order to the executor and open its card from the executor panel.",
        expected: "The executor finds the same file on the card.",
      },
    ],
    severity: "critical",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
  {
    key: "orders.attachment.download",
    title: "Downloads an attachment with its filename",
    suite: ["E2E", "Customer orders", "Attachments"],
    description:
      "An attachment is downloaded from the card and arrives under the name it was uploaded with, which " +
      "is what makes it recognisable once it leaves the browser. The case reads the download event rather " +
      "than the bytes, because the bytes are the product's own file.",
    preconditions:
      "A customer account and a draft of it that already carries one attachment.",
    steps: [
      {
        action: "Sign in as the customer and open the draft card.",
        expected: "The card lists the attachment with its name.",
      },
      {
        action: "Download the attachment.",
        expected: "The browser receives a file named exactly as the attachment.",
      },
    ],
    severity: "major",
    priority: "medium",
    layer: "e2e",
    type: "functional",
    behavior: "positive",
  },
] as const satisfies readonly QaseCase[];
