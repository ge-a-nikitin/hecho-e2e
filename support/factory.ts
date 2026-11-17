import type { UserRole } from "./devtools.js";
import { DevtoolsClient } from "./devtools.js";
import { formDataOf, pdfFile, type UploadableFile } from "./files.js";
import { HttpClient, requireOk } from "./http.js";
import type {
  Category,
  Invoice,
  Order,
  PaymentReport,
  SessionUser,
} from "./devtools.js";

/** A signed-in API actor: a cookie and the id behind it, no browser involved. */
export interface Actor {
  readonly id: string;
  readonly email: string;
  readonly password: string;
  readonly role: UserRole;
  readonly cookie: string;
}

export interface CreateOrderInput {
  readonly title?: string;
  readonly description?: string;
  readonly categoryId?: string;
  readonly executorId?: string;
  readonly dueAt?: string;
  readonly location?: string;
}

/**
 * Builds data through the public API, never through the database.
 *
 * A test that needs its own account or order calls this instead of sharing the
 * baseline actors, so the preconditions of one case cannot leak into another and
 * every case still asserts what a user could observe.
 */
export class DataFactory {
  private sequence = 0;
  private cachedAdmin?: Actor;
  private cachedCategory?: Category;

  constructor(
    private readonly devtools: DevtoolsClient = new DevtoolsClient(),
    private readonly http: HttpClient = new HttpClient(),
  ) {}

  /** Creates an isolated account and signs it in. */
  async createActor(
    role: UserRole,
    options: { readonly email?: string; readonly password?: string } = {},
  ): Promise<Actor> {
    this.sequence += 1;

    const email = options.email ?? `${role.toLowerCase()}.${Date.now().toString(36)}.${this.sequence}@example.test`;
    const password = options.password ?? "e2e-account-password";
    const id = await this.devtools.createUser(role, email, password);

    return { id, email, password, role, cookie: await this.devtools.signIn(email, password) };
  }

  /** An administrator created on demand, for steps that only an admin may perform. */
  async admin(): Promise<Actor> {
    this.cachedAdmin ??= await this.createActor("ADMIN");
    return this.cachedAdmin;
  }

  async createCategory(actor: Actor, name: string): Promise<Category> {
    return requireOk(
      await this.http.post<Category>("/categories", { cookie: actor.cookie, body: { name } }),
      "POST /api/categories",
    );
  }

  async listCategories(actor: Actor): Promise<Category[]> {
    return requireOk(
      await this.http.get<Category[]>("/categories", { cookie: actor.cookie }),
      "GET /api/categories",
    );
  }

  /**
   * A category for order preconditions; creating it needs an administrator.
   *
   * A category name is unique, so a run that reuses a database
   * (`E2E_RESET=never`) would otherwise fail on a 409 the second time. The
   * lookup keeps the helper usable in both modes, the same way `ensureUser`
   * does for accounts.
   */
  async category(name = "E2E category"): Promise<Category> {
    if (this.cachedCategory === undefined) {
      const admin = await this.admin();
      const existing = (await this.listCategories(admin)).find((entry) => entry.name === name);

      this.cachedCategory = existing ?? (await this.createCategory(admin, name));
    }

    return this.cachedCategory;
  }

  /** Creates a customer draft; pass a category id to keep it out of the default. */
  async createOrder(actor: Actor, input: CreateOrderInput = {}): Promise<Order> {
    const categoryId = input.categoryId ?? (await this.category()).id;

    return requireOk(
      await this.http.post<Order>("/orders", {
        cookie: actor.cookie,
        body: {
          title: input.title ?? "E2E order",
          description: input.description ?? "Created by the end-to-end data factory.",
          categoryId,
          ...(input.executorId === undefined ? {} : { executorId: input.executorId }),
          ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
          ...(input.location === undefined ? {} : { location: input.location }),
        },
      }),
      "POST /api/orders",
    );
  }

  /** Submits a draft, which moves it to WAITING_DISTRIBUTION or ASSIGNED. */
  async submitDraft(actor: Actor, orderId: string): Promise<Order> {
    return requireOk(
      await this.http.post<Order>(`/orders/${orderId}/submit`, { cookie: actor.cookie }),
      `POST /api/orders/${orderId}/submit`,
    );
  }

  async getOrder(actor: Actor, orderId: string): Promise<Order> {
    return requireOk(
      await this.http.get<Order>(`/orders/${orderId}`, { cookie: actor.cookie }),
      `GET /api/orders/${orderId}`,
    );
  }

  /** Lists what the actor can see; the API returns a plain array. */
  async listOrders(actor: Actor): Promise<Order[]> {
    return requireOk(await this.http.get<Order[]>("/orders", { cookie: actor.cookie }), "GET /api/orders");
  }

  /**
   * The one order an actor has under this title.
   *
   * A case that drives the form in the browser does not learn the id of what it
   * created, and the id is what every templated test id needs. Titles are made
   * unique per case, so a single match is the contract; two matches mean the
   * case created something twice and should fail loudly.
   */
  async findOrder(actor: Actor, title: string): Promise<Order> {
    const matches = (await this.listOrders(actor)).filter((order) => order.title === title);

    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one order titled "${title}" for ${actor.email}, found ${matches.length}.`,
      );
    }

    return matches[0] as Order;
  }

  // ---------------------------------------------------------------------------
  // The order lifecycle, one method per endpoint.
  //
  // Every case that needs a precondition deeper than "a draft" calls these
  // instead of driving the UI to build it: the screen under test is the one the
  // case opens afterwards, and a precondition that goes through the same button
  // as the assertion cannot fail on its own terms. Each method re-reads the order
  // with the acting account, so the returned entity is what that role may see.
  // ---------------------------------------------------------------------------

  /** Executor takes an unassigned submitted order: `WAITING_DISTRIBUTION → ASSIGNED`. */
  async claim(executor: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/claim`, executor);
    return this.getOrder(executor, orderId);
  }

  /** Executor gives an assignment back: `ASSIGNED → WAITING_DISTRIBUTION`. */
  async decline(executor: Actor, orderId: string, comment?: string): Promise<Order> {
    await this.ok(
      "POST",
      `/orders/${orderId}/decline`,
      executor,
      comment === undefined ? {} : { comment },
    );
    return this.getOrder(executor, orderId);
  }

  /** Administrator assigns explicitly, which also reassigns a started order. */
  async assign(admin: Actor, orderId: string, executorId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/assign`, admin, { executorId });
    return this.getOrder(admin, orderId);
  }

  /**
   * The assigned executor proposes hours; the amount is their rate times them.
   *
   * The API refuses an estimate from an executor without a rate
   * (`orders.service.ts:366-371`), so the rate is set here when the account has
   * none: a case about an estimate should not fail on an unrelated precondition.
   */
  async proposeEstimate(executor: Actor, orderId: string, hours = 2): Promise<Order> {
    await this.ensureHourlyRate(executor);
    await this.ok("POST", `/orders/${orderId}/estimate`, executor, { hours });
    return this.getOrder(executor, orderId);
  }

  /**
   * Customer answers the pending estimate.
   *
   * Acceptance starts the work (`IN_PROGRESS`); a rejection records the comment,
   * releases the executor and returns the order to the pool, which is what
   * `orders.service.ts:432-492` does and what `estimates.customer.reject` asserts.
   */
  async respondToEstimate(
    customer: Actor,
    orderId: string,
    response: { readonly accepted: boolean; readonly comment?: string },
  ): Promise<Order> {
    const estimate = (await this.getOrder(customer, orderId)).estimates?.find(
      (entry) => entry.status === "PENDING",
    );

    if (estimate === undefined) {
      throw new Error(`Order ${orderId} has no estimate awaiting an answer.`);
    }

    await this.ok(
      "POST",
      `/orders/${orderId}/estimates/${estimate.id}/respond`,
      customer,
      response.comment === undefined
        ? { accepted: response.accepted }
        : { accepted: response.accepted, comment: response.comment },
    );

    return this.getOrder(customer, orderId);
  }

  /** Replaces the single time entry of an order in progress. */
  async logTime(
    executor: Actor,
    orderId: string,
    entry: { readonly minutes: number; readonly comment?: string },
  ): Promise<Order> {
    await this.ok(
      "POST",
      `/orders/${orderId}/time`,
      executor,
      entry.comment === undefined
        ? { minutes: entry.minutes }
        : { minutes: entry.minutes, comment: entry.comment },
    );
    return this.getOrder(executor, orderId);
  }

  /** `IN_PROGRESS → ON_REVIEW`. */
  async submitForReview(executor: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/submit-review`, executor);
    return this.getOrder(executor, orderId);
  }

  /** `ON_REVIEW → NEEDS_REVISION`. */
  async requestRevision(customer: Actor, orderId: string, comment: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/request-revision`, customer, { comment });
    return this.getOrder(customer, orderId);
  }

  /** `NEEDS_REVISION → IN_PROGRESS`: the executor takes the changes on. */
  async resumeRevisions(executor: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/resume-revisions`, executor);
    return this.getOrder(executor, orderId);
  }

  /**
   * Records the acceptance and keeps `ON_REVIEW`, which is the product rule
   * `statuses.md:39-41` states and the reason this is not a status transition.
   */
  async acceptWork(customer: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/accept`, customer);
    return this.getOrder(customer, orderId);
  }

  /** Cancels an order; a reason is required once the work has started. */
  async cancel(actor: Actor, orderId: string, reason?: string): Promise<Order> {
    await this.ok(
      "POST",
      `/orders/${orderId}/cancel`,
      actor,
      reason === undefined ? {} : { reason },
    );
    return this.getOrder(actor, orderId);
  }

  /** Issues the invoice for accepted work: `ON_REVIEW → INVOICE_ISSUED`. */
  async issueInvoice(admin: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/invoices`, admin);
    return this.getOrder(admin, orderId);
  }

  /** Customer sends a receipt for the active invoice. */
  async reportPayment(customer: Actor, orderId: string, file: UploadableFile): Promise<Order> {
    const invoice = this.activeInvoice(await this.getOrder(customer, orderId));
    await this.okForm(
      "POST",
      `/orders/${orderId}/invoices/${invoice.id}/payment-reports`,
      customer,
      formDataOf(file),
    );
    return this.getOrder(customer, orderId);
  }

  /** Administrator confirms the receipt waiting for review: `INVOICE_ISSUED → INVOICE_PAID`. */
  async confirmPayment(admin: Actor, orderId: string): Promise<Order> {
    const { invoice, report } = this.pendingReport(await this.getOrder(admin, orderId));
    await this.ok(
      "POST",
      `/orders/${orderId}/invoices/${invoice.id}/payment-reports/${report.id}/confirm`,
      admin,
    );
    return this.getOrder(admin, orderId);
  }

  /** Administrator refuses a receipt; the order stays `INVOICE_ISSUED`. */
  async rejectPaymentReport(admin: Actor, orderId: string, reason: string): Promise<Order> {
    const { invoice, report } = this.pendingReport(await this.getOrder(admin, orderId));
    await this.ok(
      "POST",
      `/orders/${orderId}/invoices/${invoice.id}/payment-reports/${report.id}/reject`,
      admin,
      { reason },
    );
    return this.getOrder(admin, orderId);
  }

  /** Voids the unpaid invoice; the order stays `INVOICE_ISSUED` and can be re-invoiced. */
  async voidInvoice(admin: Actor, orderId: string, reason: string): Promise<Order> {
    const invoice = this.activeInvoice(await this.getOrder(admin, orderId));
    await this.ok("POST", `/orders/${orderId}/invoices/${invoice.id}/void`, admin, { reason });
    return this.getOrder(admin, orderId);
  }

  /** `INVOICE_PAID → COMPLETED`. */
  async complete(admin: Actor, orderId: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/complete`, admin);
    return this.getOrder(admin, orderId);
  }

  async addComment(actor: Actor, orderId: string, content: string): Promise<Order> {
    await this.ok("POST", `/orders/${orderId}/comments`, actor, { content });
    return this.getOrder(actor, orderId);
  }

  async uploadAttachment(actor: Actor, orderId: string, file: UploadableFile): Promise<Order> {
    await this.okForm("POST", `/orders/${orderId}/attachments`, actor, formDataOf(file));
    return this.getOrder(actor, orderId);
  }

  // ---------------------------------------------------------------------------
  // Accounts, categories and the profile.
  // ---------------------------------------------------------------------------

  /** An executor with a rate, ready to estimate; the API requires the rate. */
  async executorWithRate(rate = 50): Promise<Actor> {
    const executor = await this.createActor("EXECUTOR");
    await this.setHourlyRate(executor, rate);

    return executor;
  }

  async setHourlyRate(executor: Actor, rate: number): Promise<SessionUser> {
    return requireOk(
      await this.http.patch<SessionUser>("/users/me/hourly-rate", {
        cookie: executor.cookie,
        body: { hourlyRate: rate },
      }),
      "PATCH /api/users/me/hourly-rate",
    );
  }

  /** The signed-in account as `/users/me` reports it. */
  async profile(actor: Actor): Promise<SessionUser> {
    return requireOk(
      await this.http.get<SessionUser>("/users/me", { cookie: actor.cookie }),
      "GET /api/users/me",
    );
  }

  /** Renames or re-emails an account; the API wants the current password as proof. */
  async updateProfile(
    actor: Actor,
    change: { readonly name?: string; readonly email?: string },
  ): Promise<void> {
    await this.ok("PATCH", "/users/me/profile", actor, {
      ...change,
      currentPassword: actor.password,
    });
  }

  /** Creates an executor through the administrator endpoint, not through devtools. */
  async createExecutorAccount(
    admin: Actor,
    options: { readonly name?: string; readonly email?: string; readonly password?: string } = {},
  ): Promise<{ readonly id: string; readonly name: string; readonly email: string; readonly password: string }> {
    this.sequence += 1;

    const name = options.name ?? `E2E executor ${this.sequence}`;
    const email =
      options.email ?? `executor.panel.${Date.now().toString(36)}.${this.sequence}@example.test`;
    const password = options.password ?? "e2e-executor-password";

    const created = requireOk(
      await this.http.post<{ id: string }>("/users/executors", {
        cookie: admin.cookie,
        body: { name, email, password },
      }),
      "POST /api/users/executors",
    );

    return { id: created.id, name, email, password };
  }

  async resetPassword(admin: Actor, userId: string, password: string): Promise<void> {
    await this.ok("POST", `/users/${userId}/reset-password`, admin, { password });
  }

  async setUserActive(admin: Actor, userId: string, isActive: boolean): Promise<void> {
    await this.ok("PATCH", `/users/${userId}/active?active=${isActive ? "true" : "false"}`, admin);
  }

  async setCategoryActive(admin: Actor, categoryId: string, isActive: boolean): Promise<void> {
    await this.ok(
      "PATCH",
      `/categories/${categoryId}/active?active=${isActive ? "true" : "false"}`,
      admin,
    );
  }

  async renameCategory(admin: Actor, categoryId: string, name: string): Promise<void> {
    await this.ok("PATCH", `/categories/${categoryId}`, admin, { name });
  }

  // ---------------------------------------------------------------------------
  // Preconditions expressed as a status.
  //
  // A case about one transition needs the order to sit exactly one step before
  // it; these builders stop there and leave the walk itself to the screen under
  // test. The executor the case created is reused, so the order is assigned to
  // the account the case signs in as.
  // ---------------------------------------------------------------------------

  /** Created with the executor chosen and submitted: `NEW → ASSIGNED`. */
  async orderAssigned(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const order = await this.createOrder(customer, { ...input, executorId: executor.id });

    return this.submitDraft(customer, order.id);
  }

  /** Waits for the customer's answer: `ASSIGNED` with a `PENDING` estimate. */
  async orderAwaitingEstimate(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
    hours = 2,
  ): Promise<Order> {
    const assigned = await this.orderAssigned(customer, executor, input);

    return this.proposeEstimate(executor, assigned.id, hours);
  }

  async orderInProgress(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const assigned = await this.orderAwaitingEstimate(customer, executor, input);

    return this.respondToEstimate(customer, assigned.id, { accepted: true });
  }

  async orderOnReview(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const started = await this.orderInProgress(customer, executor, input);
    await this.logTime(executor, started.id, { minutes: 90, comment: "Implementation and review" });

    return this.submitForReview(executor, started.id);
  }

  async orderNeedsRevision(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const review = await this.orderOnReview(customer, executor, input);

    return this.requestRevision(customer, review.id, "Please add the missing report");
  }

  /** Accepted work plus an invoice: the state a customer reports payment from. */
  async orderInvoiceIssued(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const review = await this.orderOnReview(customer, executor, input);
    await this.acceptWork(customer, review.id);

    return this.issueInvoice(await this.admin(), review.id);
  }

  async orderInvoicePaid(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const invoiced = await this.orderInvoiceIssued(customer, executor, input);
    await this.reportPayment(customer, invoiced.id, pdfFile());

    return this.confirmPayment(await this.admin(), invoiced.id);
  }

  async orderCompleted(
    customer: Actor,
    executor: Actor,
    input: CreateOrderInput = {},
  ): Promise<Order> {
    const paid = await this.orderInvoicePaid(customer, executor, input);

    return this.complete(await this.admin(), paid.id);
  }

  private async ensureHourlyRate(executor: Actor): Promise<void> {
    const profile = await this.profile(executor);

    if (profile.hourlyRate === null || profile.hourlyRate === undefined) {
      await this.setHourlyRate(executor, 50);
    }
  }

  private activeInvoice(order: Order): Invoice {
    const invoice = order.invoices?.find((entry) => entry.status === "ISSUED");

    if (invoice === undefined) {
      throw new Error(`Order ${order.id} has no issued invoice.`);
    }

    return invoice;
  }

  private pendingReport(order: Order): { readonly invoice: Invoice; readonly report: PaymentReport } {
    for (const invoice of order.invoices ?? []) {
      const report = invoice.paymentReports?.find((entry) => entry.status === "PENDING");

      if (report !== undefined) return { invoice, report };
    }

    throw new Error(`Order ${order.id} has no payment report awaiting review.`);
  }

  /** One call, with the factory's own error message when the API says no. */
  private async ok(method: string, path: string, actor: Actor, body?: unknown): Promise<void> {
    requireOk(
      await this.http.send(method, path, { cookie: actor.cookie, body }),
      `${method} /api${path}`,
    );
  }

  /** The same call with a multipart body, which the file endpoints require. */
  private async okForm(method: string, path: string, actor: Actor, form: FormData): Promise<void> {
    requireOk(
      await this.http.send(method, path, { cookie: actor.cookie, form }),
      `${method} /api${path}`,
    );
  }
}
