import type { UserRole } from "./devtools.js";
import { DevtoolsClient } from "./devtools.js";
import { HttpClient, requireOk } from "./http.js";
import type { Category, Order } from "./devtools.js";

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
}
