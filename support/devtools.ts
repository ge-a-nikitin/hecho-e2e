import { API_URL, DEVTOOLS_API_KEY } from "./env.js";
import { cookieHeaderOf, HttpClient, requireOk, type ApiResponse } from "./http.js";

/** Roles the API accepts; the enum is case-sensitive and uppercase. */
export type UserRole = "CUSTOMER" | "EXECUTOR" | "ADMIN";

/** Order lifecycle values, in the order the SUT documents them. */
export type OrderStatus =
  | "NEW"
  | "WAITING_DISTRIBUTION"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "ON_REVIEW"
  | "NEEDS_REVISION"
  | "INVOICE_ISSUED"
  | "INVOICE_PAID"
  | "COMPLETED"
  | "CANCELLED";

export type EstimateStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type InvoiceStatus = "ISSUED" | "PAID" | "VOID";
export type PaymentReportStatus = "PENDING" | "REJECTED" | "CONFIRMED";

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly isActive?: boolean;
}

export interface DevtoolsUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly createdAt?: string;
}

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly isActive?: boolean;
  readonly hourlyRate?: number | string | null;
}

export interface Estimate {
  readonly id: string;
  readonly hours: number | string;
  readonly amount: number | string;
  readonly hourlyRate?: number | string;
  readonly status: EstimateStatus;
  readonly responseComment?: string | null;
  readonly proposedAt?: string;
}

/** A receipt as the order's invoice carries it. */
export interface PaymentReport {
  readonly id: string;
  readonly filename: string;
  readonly status: PaymentReportStatus;
  readonly reviewComment?: string | null;
}

export interface Invoice {
  readonly id: string;
  readonly number: string;
  readonly status: InvoiceStatus;
  readonly amount?: number | string;
  readonly paymentReports?: readonly PaymentReport[];
}

export interface OrderAttachment {
  readonly id: string;
  readonly filename: string;
  readonly sizeBytes?: number;
  readonly contentType?: string | null;
}

export interface OrderComment {
  readonly id: string;
  readonly content: string;
  readonly author?: { readonly id: string; readonly name: string };
}

/**
 * The order as the API returns it: every relation is included
 * (`apps/api/src/orders/orders.service.ts:26-45`), which is what lets a case
 * read an estimate, an invoice or a receipt id without a second endpoint.
 */
export interface Order {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: OrderStatus;
  readonly category?: Category;
  readonly customerId?: string;
  readonly customer?: { readonly id: string; readonly name: string };
  readonly executorId?: string | null;
  readonly executor?: { readonly id: string; readonly name: string } | null;
  readonly createdAt: string;
  readonly dueAt: string | null;
  readonly location: string | null;
  readonly acceptedAt?: string | null;
  readonly completedAt?: string | null;
  readonly cancellationReason?: string | null;
  readonly approvedAmount?: number | string | null;
  readonly estimates?: readonly Estimate[];
  readonly invoices?: readonly Invoice[];
  readonly attachments?: readonly OrderAttachment[];
  readonly comments?: readonly OrderComment[];
  readonly timeEntry?: { readonly minutes: number; readonly comment: string | null } | null;
}

/**
 * The devtools API is the only way this repository prepares data: it is the one
 * trusted, documented channel of the SUT, and it answers 404 unless the stack was
 * started with DEVTOOLS_ENABLED=true.
 */
export class DevtoolsClient {
  private readonly http: HttpClient;
  private readonly headers: Readonly<Record<string, string>>;

  constructor(http: HttpClient = new HttpClient(API_URL), key: string = DEVTOOLS_API_KEY) {
    this.http = http;
    this.headers = { "x-devtools-api-key": key };
  }

  /** Explains a missing devtools API instead of letting the first fixture fail obscurely. */
  async verify(): Promise<void> {
    const response = await this.http.get<DevtoolsUser[]>("/devtools/users?role=ADMIN", {
      headers: this.headers,
    });

    if (response.status === 200) return;
    if (response.status === 404) {
      throw new Error(
        `The devtools API answered 404 at ${API_URL}/devtools: the stack was started without ` +
          "DEVTOOLS_ENABLED=true. Start it with `pnpm stack:up` or point BASE_URL at an e2e stack.",
      );
    }
    if (response.status === 401) {
      throw new Error(
        "The devtools API answered 401: E2E_DEVTOOLS_API_KEY does not match DEVTOOLS_API_KEY " +
          "of the running stack.",
      );
    }

    throw new Error(`The devtools API answered ${response.status}: ${response.text}`);
  }

  /** Deletes every row and recreates the administrator from ADMIN_EMAIL/ADMIN_PASSWORD. */
  async reset(options: { readonly purgeFiles?: boolean } = {}): Promise<void> {
    requireOk(
      await this.http.post("/devtools/reset", {
        headers: this.headers,
        body: { confirm: "reset-all-data", ...options },
      }),
      "POST /api/devtools/reset",
    );
  }

  async listUsers(role: UserRole): Promise<DevtoolsUser[]> {
    return requireOk(
      await this.http.get<DevtoolsUser[]>(`/devtools/users?role=${role}`, { headers: this.headers }),
      `GET /api/devtools/users?role=${role}`,
    );
  }

  async createUser(role: UserRole, email: string, password: string): Promise<string> {
    const body = requireOk(
      await this.http.post<{ id: string }>("/devtools/users", {
        headers: this.headers,
        body: { role, email, password },
      }),
      `POST /api/devtools/users (${email})`,
    );

    return body.id;
  }

  async updateUser(
    id: string,
    patch: { readonly email?: string; readonly password?: string; readonly isActive?: boolean },
  ): Promise<void> {
    requireOk(
      await this.http.patch(`/devtools/users/${id}`, { headers: this.headers, body: patch }),
      `PATCH /api/devtools/users/${id}`,
    );
  }

  /**
   * Makes an account usable no matter what state the database is in.
   *
   * The global setup resets the database first, but a run with E2E_RESET=never
   * reuses whatever an earlier run left behind, so an existing account gets its
   * password and active flag restored instead of a 409.
   */
  async ensureUser(role: UserRole, email: string, password: string): Promise<DevtoolsUser> {
    const wanted = email.trim().toLowerCase();
    const existing = (await this.listUsers(role)).find((user) => user.email === wanted);

    if (existing === undefined) {
      const id = await this.createUser(role, wanted, password);
      return { id, email: wanted, name: wanted.slice(0, wanted.indexOf("@")), role, isActive: true };
    }

    await this.updateUser(existing.id, { password, isActive: true });
    return { ...existing, isActive: true };
  }

  /** Signs in through Better Auth and returns the cookie header for API actors. */
  async signIn(email: string, password: string): Promise<string> {
    const response = await this.http.post("/auth/sign-in/email", { body: { email, password } });
    requireOk(response, `POST /api/auth/sign-in/email (${email})`);

    const cookie = cookieHeaderOf(response);
    if (cookie === "") {
      throw new Error(`Sign-in of ${email} succeeded but returned no session cookie.`);
    }

    return cookie;
  }
}

export type { ApiResponse };
