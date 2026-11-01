import fs from "node:fs";
const must = (s, old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 90))); process.exit(1); }
  return s.replace(old, nu);
};

// ---------- 1) purchaseOrderAction: expose sent_date / received_date on header snapshots
let f = "base44/functions/purchaseOrderAction/entry.ts";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `    order_date: clean(row?.order_date),
    expected_date: clean(row?.expected_date),
    subtotal: num(row?.subtotal),`,
  `    order_date: clean(row?.order_date),
    expected_date: clean(row?.expected_date),
    sent_date: clean(row?.sent_date),
    received_date: clean(row?.received_date),
    subtotal: num(row?.subtotal),`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- 2) OpsReportView: expose all header snapshots alongside detailed open POs
f = "src/components/reports/OpsReportView.jsx";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `      const open = (data.purchase_orders || [])`,
  `      const headers = data.purchase_orders || [];
      const open = headers`
);
s = must(s,
  `        out.push(...chunk.filter(Boolean));
      }
      return out;`,
  `        out.push(...chunk.filter(Boolean));
      }
      // Header snapshots for every listed PO (vendor scorecard) + the
      // line-detailed open subset (parts-needed on-order quantities).
      return { headers, open: out };`
);
s = must(s,
  `    purchaseOrders: purchaseOrdersQuery.data || [],
  };

  const needed = [...needSet];`,
  `    purchaseOrders: purchaseOrdersQuery.data?.open || [],
    purchaseOrderHeaders: purchaseOrdersQuery.data?.headers || [],
  };

  const needed = [...needSet];`
);
s = must(s,
  `      purchaseOrders: dataByNeed.purchaseOrders,
      dateBasis: filters.dateBasis,`,
  `      purchaseOrders: dataByNeed.purchaseOrders,
      purchaseOrderHeaders: dataByNeed.purchaseOrderHeaders,
      dateBasis: filters.dateBasis,`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// ---------- 3) opsReportModel: vendorScorecardReport + registry entry
f = "src/components/reports/opsReportModel.js";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `// --- report registry -------------------------------------------------------------`,
  `// Vendor Scorecard — purchasing performance per vendor from PO header
// snapshots: order count, spend, open POs, and on-time delivery for received
// orders (received_date vs expected_date; updated_date as fallback). Draft
// and cancelled POs excluded; headers carry no line detail so fill rate is
// intentionally not scored.
export function vendorScorecardReport({ purchaseOrderHeaders = [] } = {}) {
  const vendors = new Map();
  let excluded = 0;
  for (const po of purchaseOrderHeaders || []) {
    const status = norm(po?.status);
    if (status === "draft" || status === "cancelled") { excluded += 1; continue; }
    const name = clean(po?.vendor_name) || "Unnamed vendor";
    const v = vendors.get(name) || { name, pos: 0, spend: 0, open: 0, rated: 0, onTime: 0, lateDaysTotal: 0, lateCount: 0 };
    v.pos += 1;
    v.spend = money(v.spend + num(po?.total));
    if (["sent", "partially_received"].includes(status)) v.open += 1;
    if (status === "received") {
      const expected = clean(po?.expected_date);
      const received = clean(po?.received_date) || clean(po?.updated_date).slice(0, 10);
      if (expected && received) {
        v.rated += 1;
        const days = Math.round((new Date(received + "T00:00:00") - new Date(expected + "T00:00:00")) / 86400000);
        if (days <= 0) v.onTime += 1; else { v.lateCount += 1; v.lateDaysTotal += days; }
      }
    }
    vendors.set(name, v);
  }
  const sorted = [...vendors.values()].sort((a, b) => b.spend - a.spend || a.name.localeCompare(b.name));
  const rowFor = (v) => [
    v.name,
    v.pos,
    v.spend,
    v.open,
    v.rated,
    v.rated ? v.onTime / v.rated : null,
    v.lateCount ? Math.round((v.lateDaysTotal / v.lateCount) * 10) / 10 : null,
  ];
  const total = sorted.reduce((t, v) => ({
    pos: t.pos + v.pos, spend: money(t.spend + v.spend), open: t.open + v.open,
    rated: t.rated + v.rated, onTime: t.onTime + v.onTime,
    lateDaysTotal: t.lateDaysTotal + v.lateDaysTotal, lateCount: t.lateCount + v.lateCount,
  }), { pos: 0, spend: 0, open: 0, rated: 0, onTime: 0, lateDaysTotal: 0, lateCount: 0 });
  return {
    columns: [
      { key: "vendor", label: "Vendor" },
      { key: "pos", label: "POs", align: "right", format: "int" },
      { key: "spend", label: "Spend", align: "right", format: "money" },
      { key: "open", label: "Open POs", align: "right", format: "int" },
      { key: "rated", label: "Rated", align: "right", format: "int" },
      { key: "ontime", label: "On-Time %", align: "right", format: "percent" },
      { key: "avg_late", label: "Avg Days Late", align: "right" },
    ],
    rows: sorted.map(rowFor),
    totals: [
      \`Total — \${sorted.length} vendor(s)\${excluded ? \` — excl. \${excluded} draft/cancelled\` : ""}\`,
      total.pos,
      total.spend,
      total.open,
      total.rated,
      total.rated ? total.onTime / total.rated : null,
      total.lateCount ? Math.round((total.lateDaysTotal / total.lateCount) * 10) / 10 : null,
    ],
    rowLinks: sorted.map(() => "/PurchaseOrders"),
  };
}

// --- report registry -------------------------------------------------------------`
);
s = must(s,
  `    build: ({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }) =>
      partsNeededReport({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }),
  },
];`,
  `    build: ({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }) =>
      partsNeededReport({ queueRows, builderParts, builderProducts, inventoryItems, purchaseOrders }),
  },
  {
    key: "vendor_scorecard",
    title: "Vendor Scorecard",
    group: "Purchasing",
    needs: ["purchaseOrders"],
    filters: [],
    description: "Per-vendor purchasing performance: spend, open orders, on-time delivery.",
    notes: "On-Time = received_date on or before expected_date (received orders only; updated_date fallback when received_date is blank). Draft and cancelled POs excluded. Line detail is not on header snapshots, so fill rate is not scored. PO list is limited to the 250 most recent by the purchasing action.",
    build: ({ purchaseOrderHeaders }) => vendorScorecardReport({ purchaseOrderHeaders }),
  },
];`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);
