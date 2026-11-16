# Screens and routes

The web app is a single-page React application with `react-router`. The same document is served for
every route, so a deep link works only through the web container's SPA fallback, which the stack
provides.

## Routes

| Path                | Element        | Notes                                                      |
| ------------------- | -------------- | ---------------------------------------------------------- |
| `/`                 | `LandingPage`  | public marketing page; `landing-page`                      |
| `/login`            | `AuthPage`     | `login-page`, `auth-form`, `auth-email`, `auth-password`, `auth-submit`, `auth-switch` |
| `/register`         | `AuthPage`     | `register-page`, plus `auth-name`                          |
| `/customer/*`       | `PanelRoute`   | customer panel; `customer-panel`                            |
| `/executor/*`       | `PanelRoute`   | executor panel; `executor-panel`                            |
| `/admin/*`          | `PanelRoute`   | administrator panel; `admin-panel`                          |
| anything else       | `NotFoundPage` |                                                            |

Inside a panel (`<panel>` is `/customer`, `/executor` or `/admin`):

| Path                     | Screen                                        |
| ------------------------ | --------------------------------------------- |
| `<panel>`                | order list of that role                       |
| `<panel>/orders/<id>`    | the order card over the list (deep link)       |
| `<panel>/profile`        | profile: name, email, password, hourly rate    |
| `/admin/categories`      | categories (administrator only)                |
| `/admin/users`           | accounts (administrator only)                  |

A panel route with the wrong session role redirects to `/login`; a signed-in user who opens the
landing page sees a link to their own panel instead of sign-in.

## Test ids by area

`docs/generated/testids.json` is the complete list with file and line. The groups below are what a
test author reaches for first; ids ending in `-<id>` are template literals in the SPA and are written
as ``getByTestId(`open-order-${orderId}`)`` in a test.

| Area        | Test ids                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| Landing     | `landing-page`, `brand-home`, `nav-how-it-works`, `nav-for-whom`, `nav-login`, `nav-dashboard`, `hero-register`, `hero-login`, `footer-login`, `process-step-1..3` |
| Auth        | `login-page`, `register-page`, `auth-form`, `auth-name`, `auth-email`, `auth-password`, `auth-submit`, `auth-switch`, `auth-back`, `auth-brand` |
| Panel shell | `<role>-panel`, `panel-orders-link`, `panel-profile-link`, `panel-categories-link`, `panel-users-link`, `sign-out`, `mobile-sign-out`, `panel-brand` |
| Customer    | `create-order`, `create-order-form`, `order-title`, `order-description`, `order-category`, `order-due-date`, `order-executor`, `order-location`, `save-draft`, `submit-create-order`, `orders-list`, `orders-empty-state`, `orders-no-results`, `orders-loading`, `orders-load-error`, `order-card-<id>`, `open-order-<id>`, `edit-order-<id>`, `submit-draft-<id>`, `accept-estimate-<id>`, `reject-estimate-<id>`, `accept-work-<id>`, `request-revision-<id>`, `payment-receipt-<invoiceId>`, `report-payment-<invoiceId>` |
| Executor    | `executor-orders`, `executor-refresh`, `claim-order-<id>`, `decline-order-<id>`, `estimate-hours-<id>`, `submit-review-<id>`, `resume-revisions-<id>` |
| Admin       | `admin-orders`, `admin-orders-list`, `assign-executor-<id>`, `submit-assignment-<id>`, `issue-invoice-<id>`, `void-invoice-<id>`, `void-invoice-reason-<invoiceId>`, `payment-review-<id>`, `confirm-payment-<id>`, `reject-payment-<id>`, `reject-payment-reason-<id>`, `complete-order-<id>`, `download-invoice-pdf-<invoiceId>` |
| Filters     | `order-filters`, `order-search`, `order-status-filter`, `order-category-filter`, `order-filters-reset`, `orders-pagination`, `orders-prev-page`, `orders-next-page`, `orders-page-summary` |
| Order card  | `order-detail`, `order-detail-backdrop`, `close-order-detail`, `order-comment-form`, `order-comment-input`, `submit-order-comment`, `attachment-upload-form`, `order-attachment-file`, `upload-order-attachment`, `cancel-order-form`, `cancel-order-reason`, `cancel-order-submit` |
| Profile     | `profile-page`, `profile-role`, `change-password`, `password-current`, `password-new`, `password-confirm` |
| Language    | `language-en`, `language-ru` (template `language-${option}`)                                  |

## Desktop and mobile

The layout changes at the panel breakpoint:

- On wide screens the panel has a sidebar with navigation, the profile card and `sign-out`; the order
  card is a centred dialog.
- On mobile the sidebar collapses into a top bar with `mobile-sign-out`, and the order card becomes a
  draggable bottom sheet over the list.

Both sign-out buttons exist in the DOM and one is hidden with CSS, so a locator must filter by
visibility (`getByTestId(/^(?:mobile-)?sign-out$/).filter({ visible: true })`), or select the one the
project's viewport shows.

## List behaviour

Search, status/category filters and 10-row paging run in the browser. An empty result has two
different states: `orders-empty-state` (no orders at all) and `orders-no-results` (filters exclude
everything) with `orders-reset-filters`. A case that asserts an empty list must say which one it
means.
