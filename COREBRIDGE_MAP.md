# CoreBridge V2 → CCS Signage Workflow — Module Mapping Specification

Source: read-only inventory of `https://cincinnaticustom.corebridge.net` (live instance, October 2026).
**No records were created, edited, submitted, converted, approved, paid, or deleted during this inventory.**
Shared estimate/order URLs show a shared interface — they do not prove a shared database table; CoreBridge's internal storage model is unverified.

## 1. Module inventory

| CoreBridge module | Sub-areas observed | CCS counterpart | Status |
|---|---|---|---|
| Sales | Home dashboard, Queues, CRM (Contacts, Events, Add Contact), Customers, Quick Price, Estimates, Orders, Products (Quick Products) | `SalesHome`, `SalesPipeline`, `EstimatorQueues`, `EstimatorCustomers`, `QuickPrice`, `Estimator`, `EstimateDetail`, `EstimatorProducts` | Partial — needs queue/product-status alignment |
| Design | Design Review, Design Estimate, Design WIP, Awaiting Approval, Upcoming, All Active; per-product design editor | `Design` stage page, workflow tasks | Gap — no per-product design queue/proof workflow |
| Production | WIP, Vended, Quality Control, Installation, Delivery, Shipping, Awaiting Pickup, Upcoming, All Active; per-product production editor; work-order print | `Production`, `Fabrication`, `InstallationDeliver`, `ProductionSchedule`, `WorkOrderTraveler` | Partial — product-level status/queue model missing |
| Accounting | Home (alerts feed), Manage Accounts (income/COGS GL accounts), Reconciliation (batched cash close), Accounting Export (manual file, desktop sync, QuickBooks Online, lump sync), Payments/Refunds | `Financials`, `Invoices`, `Payment` entity, `JobCosting` | Partial — reconciliation, GL mapping, export absent |
| Reports | Company/Financial, Customers/Receivables, Sales, Production, Franchise | `ReportingDashboard`, `FeatureReports`, `CompletedReports`, `FleetAnalytics` | Partial — report definitions, not parity |
| Management | Users, Parts, Modifiers, Goals, Customers (portal/statements/tracking/import/CRM/notifications), Vendors (communication/statements/tracking/import), Global Settings (system/pricing/ordering/domain/accounting/status/production/services), Locations + Tax Agencies, Machines | `AdminSettings`, `QuoteSettings`, `EstimatorSettings`, module settings pages, `MasterInventory`, `FleetSettings` | Partial — catalog/machine/pricing admin gap |
| Preferences (per user) | My Account, Time Clock, Alerts (subscriptions), Messaging | `UserSettings`, `TimeClock`, `NotificationService` | Partial — alert subscription model gap |

## 2. Entity model mapping

| CoreBridge concept | CCS entity/structure | Notes |
|---|---|---|
| Order (estimate/order/invoiceshare one record + status) | `AllInOneEstimate` → `WorkOrder` → `Invoice` (linked, separate) | CCS's separation is stronger; keep it — expose as one workspace in UI |
| Product (OrderProduct) | `BuilderProduct` / AIO `line_items` section | Needs product-level operational status |
| Part | `BuilderPart`, `PartTemplate`, inventory parts | Frozen snapshots already better than CB |
| Part Group (shared catalog config) | *(none — `BuilderPartGroup` is estimate-internal grouping, different concept)* | Gap — name distinctly |
| Quick Product (reusable configured product) | `PartTemplate` / module presets | Closest match; category model exists |
| Customer / Account | `Customer`, `CustomerContact`, `CustomerLocation` | Covered; add primary/billing/site roles, master accounts, credit terms |
| Contact Event | `OpportunityActivity` + follow-ups | Covered; add typed event taxonomy + completion queue |
| Vendor / PO | `PurchaseOrder`, vendor fields on parts | Partial; no vendor portal / quote-request flow |
| Modifier (custom properties + variable rates + formula) | `MarkupCategory`, module modifiers | Gap — formula engine, custom-property UI, variable rates |
| Machine (type, profiles, speeds, costs) | `VinylMachine`, per-module machine fields | Gap — unified machine registry w/ cost-per-hour + margins |
| Payment / Refund | `Payment` entity | Covered |
| Tax Agency | `MarkupCategory`-adjacent tax group on estimate | Gap — agency registry w/ GL export |
| Reconciliation batch | *(none)* | Gap — daily cash close grouping |
| Responsibility/Prioritization | `WorkOrder.assigned_*`, priority | Partial — no substatus→responsibility associations |
| Substatus ("quick tag") | custom statuses (`quoteDefaults.status_transitions`) | Partial — needs per-product, not per-estimate |

## 3. Lifecycle / status mapping

CoreBridge separates **order status** (ESTIMATE→WIP→BUILT→COMPLETED→CLOSED / CANCELLED / VOIDED) from **product status** (dozens of WIP/BUILT/COMPLETED substatuses) and **customer-facing status labels** (separate display text per status — e.g. "WIP: Awaiting Proof Approval" → customer sees "Requires Proof Approval").

| CoreBridge | CCS equivalent | Recommendation |
|---|---|---|
| ESTIMATE (+ Design Needed / Sales Review / Awaiting Customer Approval / Revision / Approved / Cancelled) | `AllInOneEstimate` quote statuses + custom statuses (#493) | Covered; add customer-facing label map |
| WIP : {Order Review, Site Survey, Awaiting Customer Action, Awaiting Proof Approval, Permitting, Proof Approved, In Production, Install/Removal Only, Quality Control, Design Review, Service/Repair} | `WorkOrder.current_stage` (8 stages) + task descriptions | Gap — needs product-level status, not just order stage |
| BUILT : {Awaiting Customer Pickup, Awaiting Installation, Awaiting Shipping, Awaiting Delivery} | *(none — "built/ready" not modeled)* | Gap — add `built_status`/`fulfillment_state` |
| COMPLETED : {Picked Up, Installed, Shipped, Delivered, On Account, Past Due} | `WorkOrder` completed flag + `Invoice.status` | Gap — fulfillment method + AR state conflated |
| CLOSED : {Paid In Full, Closed} | `Invoice.status: paid` | Covered at invoice level; mirror on order |
| VOIDED / Cancelled | estimate cancelled / work-order deleted flag | Covered |
| Substatus quick tags (persistent, custom) | none at product level | Gap — quick-tag model on products |

**Key rule observed:** an order can be COMPLETED with a balance due and no Closed date — Completed ≠ paid. Preserve that separation in CCS.

## 4. Queue model

Every module's home = counters + filtered queues sharing a common filter bar:

- Filters: machine, part category, parts, designer, date presets (Past Due / Due Today/Tomorrow/Week/Next 7 / Rush Jobs / hard due dates only), substatus, responsibility, assigned-to, salesperson, entered-by, search, page size.
- Columns: `#` (order # + product position e.g. "INV-14022 3/3"), Product, Company, Product Name, Status/Substatus, due date.
- Queue settings: per-user pinned filters (browser-local), per-session persistence, proof lookup on queues, queue prioritization via Responsibility (department/person/group + color) and numeric priority 1–99, substatus→responsibility associations, auto-refresh timer.

**CCS gap:** queues exist per-stage but are order-level, filtered by task-description strings via localStorage. Need product-level queue rows + shared filter component + server-persisted saved views (improve on CB's browser-local pins).

## 5. Sales/estimate detail structure

- Header: status, EST-/INV- number, payment terms ("Balance Due Upon Receipt"), PO#, salesperson, entered-by, sales center (location), order description, estimate-created/follow-up dates.
- Waterfall: Subtotal → Discount → Shipping → Postage → New Subtotal → Tax% → Total; + Total Paid / Balance Due on orders.
- Tabs: Products, Order Contact, Address Info, Notes, Order History, Overrides, Payments.
- Order Details drawer: per-product price/cost/margin + "overridden during order entry" flags; order-level margin.
- Order History: actor-colored (staff black / customer green / vendor blue), downloadable, records status transitions, conversion events ("Estimate Converted to Order - via product status (APPROVED)"), edits, emails, payments.
- Actions: Edit, Clone, Print/Email Invoice, Packing Slip, Invoice View Settings, Void, Enter Payment.
- Product rows expand to parts with layout info (roll length used, roll waste sqft, # cuts), machine steps (machine + detail choice + use time), modifiers w/ answers, part text, part notes, vendor cost/markup on vended parts, per-part proof upload.

**CCS gap:** Order History equivalent partially exists (activity log) — need per-event actor-type coloring + downloadable history + "overridden" badges. Conversion-by-product-status (order converts when all products approved) is a rule worth mirroring.

## 6. Quick Price / Quick Product / Walk-in

- **Quick Price**: 3-step wizard (Create Products → Finalize → Convert) producing a convertible draft order — i.e., fast multi-product estimate entry, not a calculator. Product rows: name, qty, Is Vended, category, parts, quick-product insert, per-product + order-level discounts, hard due date toggle.
- **Quick Products**: 82 reusable configured products (category tree incl. SERVICE : Installation / Survey-Permitting etc.) with prebuilt parts; part editor = clone of product part structure.
- **On-the-spot checkout** (Walk-Ins setting): from Quick Price step 3 — instant pay-and-leave sale bound to a default Walk-in customer, bypasses workflow, optional purchaser-name capture.

**CCS gap:** no walk-in/counter-sale path. Add `is_walk_in`/counter-checkout flow producing a paid order with no workflow stages.

## 7. Design & production product detail

Per-product record (DesignProductEdit / ProductionProductEdit):
- Product name, order status, entered-by, salesperson, assigned-to, order-created, **design due date, product due date** (separate), designer, product status + substatus.
- Audience-routed product notes (Sales / Design / Production / Customer / Vendor channels).
- Product proof description + per-part proof upload + file criteria.
- Job Time Tracking: start/stop timer + summary (design vs production vs combined, per user/department).
- Parts: parent size, weight, finish, color, part qty, total needed, dimensions, layout info, machine steps, modifiers, part text, part notes.
- Work-order print: 5 templates (Original, Streamlined Landscape, Landscape Spanish, v2, Invoice-styled).
- Status override: optional required-reason list (cancel-estimate reasons, custom reasons).

**Due-date rules observed:** per-part design/product lead times (minimum + standard + additional days); product due = max of part lead times; order due = max of products; "Recalculate Product Due Date upon Proof Approval" option respects hard due dates and only pushes the order date forward if needed.

**CCS gap:** design_due/product_due split, proof-approval recalculation, per-product time tracking (has TimeClock but not product-scoped), audience-routed notes, required-reason overrides.

## 8. Parts/catalog/pricing admin

- Part config tabs: General (pricing units incl. SqFt/LinFt/Each/Hourly/Pixels/etc., pricing template, setup fees), Pricing Tiers (cost-plus margin chart by qty breaks × customer tiers, market-based retail+discount chart, global tier link, interpolation), Due Dates (design/product lead days), Details (description, image, colors, labor levels w/ rates like "Easy Weeding 125 SqFt/hr", notes), Categories (multi-assign), Machines (assoc. w/ per-machine overrides), Modifiers (assoc. + order), Options (part type, income/COGS GL account, mfg part #, taxable, separate-on-invoice as sub-product, double-sided rules, minimums, parent sizes, vendor association, size-based discounts).
- Part Groups = shared config inheritance for catalog parts (NOT estimate part groups).
- Pricing Templates (17): named qty-break×tier margin charts by unit category.
- Global Variables: quantity/height/width/depth/stitch-count defaults for formulas.
- Modifiers: custom properties (typed inputs, "can use in pricing"), variable rates (label+retail+cost+per-unit), pricing-tier tab, layout-designed preview, formula engine w/ reserved vars (PartBaseCost, Part Retail, Width, etc.), flags: include setup fee, min charge, affects waste, inventoried-part type.
- Machines: type (roll-fed/sheet-fed/other), cost/hour, profiles w/ speed settings, disposable cost per unit, setup cost/time, labor %, weighted multiplier, margin charts, overrides (disposable, income account, price calc, second-side).
- Global Pricing Tiers: named shared pricing rule sets (Standard Tier, Painting, Retail Parts for Modifiers).
- Order fees: shipping/postage/discount with taxable flag + income-account mapping.
- Importing: parts, part-group parts, vendor-association imports (w/ history); "Import Part" system part defaults for e-commerce/API clones; customer + addresses + contacts imports.
- Customer pricing precedence: customer tier → part-specific tier/fixed → machine override.

**CCS gap:** this is the largest single gap cluster — no tier chart matrix, no market-based mode, no formula engine, no labor levels, no machine cost model, no GL account mapping on parts, no part groups (shared config), no variable-rate modifiers, no size-based discounts, no catalog import pipeline. CCS `MarkupCategory` covers customer-tier markup only.

## 9. Customers / CRM / portal

- Customer fields: company/contact, industry type, origination (hierarchical e.g. "Networking Group : BNI - Carl - Tier 1"), customer type, status (Lead/Prospect/Active/Inactive), auto-inactive after N months (disable-able), master account, PO-required flag, credit terms/limit, tax-exempt reason+ID+expiration, warning flags, in-store credit, pricing tier.
- Contacts: primary/billing/site roles, email groups, active/deactivated/DO-NOT-MAIL/Hot-Prospect/Referral statuses.
- CRM events: typed taxonomy (Call: AR/Collections/Estimate Follow Up/Prospecting/Proof..., E-Mail: Estimate/Follow Up..., Visit: Installation/Sales/Site Survey..., Consultation, ReDo Work), event queue w/ Mark Complete, per-salesperson filter; event creator + custom events in settings.
- Customer portal settings: enable reorders, deposit requirement display on estimates/invoices, external proofs, terms display, custom text, proof disclaimer, proof/estimate/order approval terms.
- Customer notifications: templated emails for estimate ready, new order, action needed, proof ready, built, completed, payment-due-5-day, monthly statement, estimate/proof follow-ups #1/#2 (X-day delay, non-repeating, status-gated), credit memo, multi-invoice, login info; placeholders for order/customer/company/user/location fields; from-location or from-salesperson toggle, billing-contact CC, PDF attach.
- Vendor notifications: PO created, quote request, line-item feedback-sent, file uploaded; PO template w/ arrive-by date + vendor-portal link.
- Tracking: industry/origination/customer-type/master-account/tax-exempt-reason list managers.
- Customer Analytics tab: avg order, closed/completed totals + counts, by all-time/year, discounts given.
- Messaging: internal broadcast (Everyone/Design/Production/Sales/Managers/Individual).
- Alerts: per-user subscriptions (Client Change Request, Client Uploaded Files, Customer Notes, Portal Payment, Estimate Converted, Payment Received, Proof Approved, Sales Notes) w/ criteria + dashboard delivery.

**CCS gap:** hierarchical origination, master accounts, in-store credit, tax-exempt registry, typed CRM event queue, two-stage estimate/proof follow-up automation w/ status gating, vendor notification set, in-app messaging, per-user alert subscriptions (watch rules #349 partially covers).

## 10. Accounting

- Income accounts (17, GL-coded: 4000 Sales … 4999 Services, 000000 Imported Sales) + COGS accounts (10); per-part + per-modifier + per-fee assignment; parent-account support.
- Reconciliation: grouped batch close — group#, location, date, cash adjustments, total collected, created-by (566 historical batches).
- Payments: receive payment, refund, search, per-customer balance; "Payment added from Customer Portal" as distinct event.
- Accounting Home = alerts feed (payments, conversions).
- Export: manual file, desktop-app sync, QuickBooks Online, lump data sync.
- Statements: customizable text; per-customer + batch generation (all customers w/ completed balance).

**CCS gap:** GL code fields, reconciliation batches, accounting export, statements, in-store credit, customer-facing payment portal flag on Payment.method.

## 11. Reports catalog (full)

- **Company/Financial:** Sales Tax Liability, Sales Commission (by income acct/salesperson, completed/closed/vended filters), Business Summary, Invoice Summary, Built Summary, Void Summary, Customer Earnings, Employee Time Clock, Employee Contact List.
- **Receivables:** AR Aging (summary/detail/by-customer/by-salesperson), Customer Payments, In-Store Credit, Credit Terms/Limits/Usage, Tax Exemption Status, Customer Balance, batch Statements, Customers by Created Date, by Master Account, Dormant Customers, Phone/Address List.
- **Sales:** by Customer (+contacts), Billing Locale, Salesperson (+averages created/completed basis, by month, by month/year crosstab), Entered By, Income Account, Product Category, Industry Type, Customer Origination, Order Origination, Master Account, Volume/Frequency, by Month (in-house/vended/postage/shipping/discount split), Part Category, Parts/Modifiers/Fees (summary/detail/drilldown), Discounts Given, Overrides by Salesperson.
- **Production:** WIP by Product Status / Order Status / Salesperson / Responsibility+Prioritization / by Built Date; Addresses by Disposition; Built; Part Amount Needed by Created/Due Date (w/ dims, vendor); Part Amount Used; On-Time Orders by Built Date (avg days in WIP); Vendor Part List; Part Details export; PO Listing by Order; Quick Product Summary.
- **Estimates:** Current, Activity/Conversion, Conversions by Salesperson, by Customer/Salesperson/EnteredBy/Industry/Origination/CustomerType.
- **Franchise:** Royalty report (skip — N/A).
- Pattern: Summary/Detail/Drilldown/Export variants; explicit date basis (created vs completed vs built); explicit void-inclusion rules.

**CCS gap:** reconcile every report definition — biggest wins: AR aging, WIP-by-status, Part Amount Needed (purchasing), On-Time-by-Built-Date (days-in-WIP), Estimate Conversion by Salesperson, Sales-by-Month split, Overrides audit.

## 12. System/settings

- Hours of Operation: sales-center hours (open/close) vs production hours (start-time/day) — two clocks for deadline vs follow-up math.
- Domain: custom domains for system + portal (separate URLs), permanent portal URL.
- Email: authorized sending domains, default outgoing address (location email / noreply@), per-user personalized send-as.
- Services/integrations: merchant providers (Fiserv, Nexio — one active), Zapier key, Sign Pack, B2 Portal (email→auto-estimate), PlanProphet CRM. **Presence ≠ connected** — all observed NOT CONNECTED.
- Localization/security/payment-type settings exist (tab presence only).
- Sales Home: company-wide funnel (new customers, estimates created/cancelled/converted, orders placed/built/completed/closed with pre/post-completion void splits, collected, refunds); goals by location/salesperson/income category; calendar; alerts/messages. `/bi.aspx` Sales Monitor = same funnel as tiles.

## 13. Recommended CCS build order (familiarity-first)

1. **Product-level operational model**: product status + substatus + fulfillment state + design/product due dates on `BuilderProduct`/`WorkOrder.products` — the single biggest familiarity gap.
2. **Shared queue component** w/ CB-style filters (machine, category, designer, responsibility, due-date presets, substatus) + server-saved views (better than CB's browser-local pins).
3. **Job workspace**: one screen = estimate/order header + product table + waterfall + history + payment — CB familiarity without its single-record coupling.
4. **Proof workflow**: per-product proof upload, Awaiting→Approved statuses, portal approval, due-date recalc honoring hard dates.
5. **Built/fulfillment states**: awaiting pickup/install/ship/deliver → completed-by-method → closed-paid; keep unpaid-completed possible.
6. **Pricing engine parity**: tier matrix, market-based, global tiers, labor levels, machine costs, formula modifiers — staged; start with margin-chart import.
7. **Customer/CRM depth**: contact roles, hierarchical origination, master accounts, typed event queue, auto-inactive.
8. **Communication automation**: two-stage estimate/proof follow-ups w/ status gating + from-salesperson + CC-billing + per-user alert subscriptions.
9. **Accounting**: GL accounts on parts/fees, reconciliation batches, export, statements, walk-in counter checkout.
10. **Reports**: top-10 operationally load-bearing reports first (AR aging, WIP-by-status, parts-needed, on-time, conversion, sales-by-month, overrides).

## 14. Explicit non-goals / preserve-CCS-betterness

- Do NOT collapse estimate+order+invoice into one record — CCS's linked entities give better auditability; surface them as one workspace instead.
- Do NOT copy browser-local queue pins — server-side saved views.
- Do NOT copy single-level flat status enums — keep CCS's richer stage model; add product-level layer.
- Do NOT clone CB's UI chrome — copy the information model and operational semantics, keep CCS's modern UI.
- Franchise/royalty features: skip.
- CB's iframe-heavy, tooltip-driven editing UX: do not replicate; use inline editors (already CCS pattern).
