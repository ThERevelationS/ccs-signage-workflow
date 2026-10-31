import fs from "node:fs";
const f = "base44/functions/opportunityWorkspaceAction/entry.ts";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const must = (old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 70))); process.exit(1); }
  s = s.replace(old, nu);
};

// 1) WorkOrder search fields + has() gain sales_import_source_id (corebridge:<id> tagged)
must(
  `searchRead(WorkOrder, ["title", "client_name", "current_task_description"], "-updated_date", "WorkOrder", false)`,
  `searchRead(WorkOrder, ["title", "client_name", "current_task_description", "sales_import_source_id"], "-updated_date", "WorkOrder", false)`
);
must(
  `.filter((r: any) => !r?.deleted && has(r, ["title", "client_name", "current_task_description"]))`,
  `.filter((r: any) => !r?.deleted && has(r, ["title", "client_name", "current_task_description", "sales_import_source_id"]))`
);

// 2) Legacy-resolution block: insert between the Promise.all and the `has` helper
must(
  `      const has = (row: any, fields: string[]) => fields.some((f) => clean(row?.[f]).toLowerCase().includes(query));`,
  `      // Legacy-number resolution: migrated rows link back through
      // LegacyMigrationMap (source_id = the old CoreBridge number). A hit
      // resolves "the old CB invoice/order # typed into search" to the
      // migrated record even though its own fields never stored that number.
      const LEGACY_GROUP: Record<string, string> = {
        AllInOneEstimate: "estimates", WorkOrder: "work_orders", Invoice: "invoices",
        PurchaseOrder: "purchase_orders", ChangeOrder: "change_orders",
        Customer: "customers", Opportunity: "opportunities", Order: "orders",
      };
      const legacyRows: Record<string, Map<string, { row: any; legacy: string }>> = {};
      try {
        const MapEntity = (base44.asServiceRole.entities as any).LegacyMigrationMap;
        const entityFor: Record<string, any> = {
          AllInOneEstimate: Estimate, WorkOrder, Invoice, PurchaseOrder, ChangeOrder, Customer, Opportunity, Order,
        };
        const mapRows = await MapEntity.filter(regexOr(["source_id"], rawQuery), "-updated_date", 200).catch(() => []);
        const targets = new Map<string, { entity: string; sid: string }>();
        for (const m of mapRows || []) {
          const tEntity = clean(m?.target_entity);
          const tId = clean(m?.target_id);
          if (!tId || tId === "__error__" || !entityFor[tEntity] || !LEGACY_GROUP[tEntity]) continue;
          if (!targets.has(tId)) targets.set(tId, { entity: tEntity, sid: clean(m?.source_id) });
        }
        await Promise.all([...targets.entries()].slice(0, 25).map(async ([tId, meta]) => {
          const row = await entityFor[meta.entity].get(tId).catch(() => null);
          if (row?.id) (legacyRows[LEGACY_GROUP[meta.entity]] ||= new Map()).set(tId, { row, legacy: meta.sid });
        }));
      } catch { /* legacy resolution is best-effort — never fail the search */ }
      const mergeLegacy = (group: string, list: any[]) => {
        const out = [...list];
        const seen = new Set(out.map((r) => clean(r?.id)));
        for (const [tId, meta] of legacyRows[group] || []) {
          if (!seen.has(tId)) out.push({ ...meta.row, legacy_source_id: meta.legacy });
        }
        return out;
      };
      const has = (row: any, fields: string[]) => fields.some((f) => clean(row?.[f]).toLowerCase().includes(query));`
);

// 3) Merge legacy rows into each group before the 10-item slice
const groups = [
  ["opportunities", `opps.filter((r: any) => has(r, ["title", "customer_display_name", "salesperson"]))`],
  ["estimates", `estimates.filter((r: any) => !r?.deleted && has(r, ["project_name", "client_name", "estimate_number"]))`],
  ["invoices", `invoices.filter((r: any) => has(r, ["invoice_number", "customer_display_name"]))`],
  ["purchase_orders", `pos.filter((r: any) => has(r, ["po_number", "vendor_name"]))`],
  ["change_orders", `cos.filter((r: any) => has(r, ["change_order_number", "title", "customer_display_name"]))`],
];
for (const [g, old] of groups) must(old, `mergeLegacy("${g}", ${old})`);
must(
  `(Array.isArray(customers) ? customers : [])\n            .filter((r: any) => has(r, ["company_name", "contact_first_name", "contact_last_name", "contact_email", "email"]))`,
  `mergeLegacy("customers", (Array.isArray(customers) ? customers : [])\n            .filter((r: any) => has(r, ["company_name", "contact_first_name", "contact_last_name", "contact_email", "email"])))`
);
must(
  `(Array.isArray(wos) ? wos : [])\n            .filter((r: any) => !r?.deleted && has(r, ["title", "client_name", "current_task_description", "sales_import_source_id"]))`,
  `mergeLegacy("work_orders", (Array.isArray(wos) ? wos : [])\n            .filter((r: any) => !r?.deleted && has(r, ["title", "client_name", "current_task_description", "sales_import_source_id"])))`
);
must(
  `(Array.isArray(orders) ? orders : [])\n            .filter((r: any) => !r?.deleted && has(r, ["description", "vendor", "requestor_name", "request_type"]))`,
  `mergeLegacy("orders", (Array.isArray(orders) ? orders : [])\n            .filter((r: any) => !r?.deleted && has(r, ["description", "vendor", "requestor_name", "request_type"])))`
);

// 4) Surface legacy_source_id on every mapped result item
for (const marker of [
  `stage: clean(r?.stage) }))`,
  `estimate_number: clean(r?.estimate_number), status: clean(r?.status) }))`,
  `invoice_number: clean(r?.invoice_number), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status), total: num(r?.total) }))`,
  `po_number: clean(r?.po_number), vendor_name: clean(r?.vendor_name), status: clean(r?.status), total: num(r?.total) }))`,
  `change_order_number: clean(r?.change_order_number), title: clean(r?.title), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status) }))`,
  `customer_status: clean(r?.customer_status) }))`,
  `current_stage: clean(r?.current_stage), due_date: clean(r?.due_date) }))`,
  `status: clean(r?.status) })),`,
]) {
  const idx = s.indexOf(marker);
  if (idx < 0) { console.error("MISS map tail:", marker); process.exit(1); }
}
must(`stage: clean(r?.stage) }))`, `stage: clean(r?.stage), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`estimate_number: clean(r?.estimate_number), status: clean(r?.status) }))`, `estimate_number: clean(r?.estimate_number), status: clean(r?.status), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`po_number: clean(r?.po_number), vendor_name: clean(r?.vendor_name), status: clean(r?.status), total: num(r?.total) }))`, `po_number: clean(r?.po_number), vendor_name: clean(r?.vendor_name), status: clean(r?.status), total: num(r?.total), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`change_order_number: clean(r?.change_order_number), title: clean(r?.title), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status) }))`, `change_order_number: clean(r?.change_order_number), title: clean(r?.title), customer_display_name: clean(r?.customer_display_name), status: clean(r?.status), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`customer_status: clean(r?.customer_status) }))`, `customer_status: clean(r?.customer_status), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`current_stage: clean(r?.current_stage), due_date: clean(r?.due_date) }))`, `current_stage: clean(r?.current_stage), due_date: clean(r?.due_date), legacy_source_id: clean(r?.legacy_source_id) || undefined }))`);
must(`status: clean(r?.status) })),`, `status: clean(r?.status), legacy_source_id: clean(r?.legacy_source_id) || undefined })),`);

fs.writeFileSync(f, s);
console.log("PATCHED", f);
