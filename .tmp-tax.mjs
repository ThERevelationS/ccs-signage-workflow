import fs from "node:fs";
const must = (s, old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 90))); process.exit(1); }
  return s.replace(old, nu);
};

const f = "src/components/reports/opsReportModel.js";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

// 1) Pure report function — after customerAnalyticsReport, before estimateFunnelReport.
s = must(s,
  `export function estimateFunnelReport({ estimates = [] } = {}) {`,
  `// Tax Liability — sales tax charged per month, split by tax rate. The date
// basis toggle mirrors Sales by Month: issue_date = tax billed that month
// (accrual); paid_date = tax on invoices reaching paid status that month
// (cash proxy — partially-paid invoices count only once fully paid). Voids
// and drafts are excluded; invoices with no tax are counted separately so
// the exclusion is honest. One invoice lands in exactly one (month, rate)
// bucket, so invoice counts are additive in the totals row.
export function taxLiabilityReport({ invoices = [], basis = "issue_date" } = {}) {
  const paidBasis = basis === "paid_date";
  const buckets = new Map();
  let voidInvoices = 0;
  let draftInvoices = 0;
  let undatedInvoices = 0;
  let untaxedInvoices = 0;
  for (const inv of invoices || []) {
    const status = norm(inv?.status);
    if (status === "void") { voidInvoices += 1; continue; }
    if (status === "draft") { draftInvoices += 1; continue; }
    const key = paidBasis ? monthKey(inv?.paid_date) : monthKey(inv?.issue_date);
    if (!key) { undatedInvoices += 1; continue; }
    const tax = num(inv?.tax_amount);
    if (!(tax > 0)) { untaxedInvoices += 1; continue; }
    const rate = num(inv?.tax_rate);
    const bk = key + "|" + rate;
    const b = buckets.get(bk) || { key, rate, invoices: 0, taxable: 0, tax: 0 };
    b.invoices += 1;
    b.taxable = money(b.taxable + num(inv?.subtotal) - num(inv?.discount_amount));
    b.tax = money(b.tax + tax);
    buckets.set(bk, b);
  }
  const sorted = [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key) || a.rate - b.rate);
  const rateLabel = (rate) => {
    if (!(rate > 0)) return "0%";
    const pct = (rate * 100).toFixed(3).replace(/0+$/, "").replace(/\\.$/, "");
    return pct + "%";
  };
  const exclusions = [
    voidInvoices ? \`\${voidInvoices} void\` : "",
    draftInvoices ? \`\${draftInvoices} draft\` : "",
    undatedInvoices ? \`\${undatedInvoices} undated\` : "",
    untaxedInvoices ? \`\${untaxedInvoices} untaxed\` : "",
  ].filter(Boolean).join(", ");
  const totalsLabel = [\`Total — \${sum(sorted, (b) => b.invoices)} taxed invoice(s)\`, exclusions && \`excl. \${exclusions}\`]
    .filter(Boolean).join(" — ");
  return {
    columns: [
      { key: "month", label: "Month" },
      { key: "rate", label: "Tax Rate", align: "right" },
      { key: "invoices", label: "Invoices", align: "right", format: "int" },
      { key: "taxable", label: "Taxable Base", align: "right", format: "money" },
      { key: "tax", label: "Tax Charged", align: "right", format: "money" },
    ],
    rows: sorted.map((b) => [
      monthLabel(b.key), rateLabel(b.rate), b.invoices, b.taxable, b.tax,
    ]),
    totals: [
      totalsLabel,
      "",
      sum(sorted, (b) => b.invoices),
      money(sum(sorted, (b) => b.taxable)),
      money(sum(sorted, (b) => b.tax)),
    ],
    rowLinks: sorted.map(() => null),
  };
}

export function estimateFunnelReport({ estimates = [] } = {}) {`
);

// 2) Registry entry — Receivables group, after ar_aging.
s = must(s,
  `    build: ({ invoices, now }) => arAgingReport(invoices, now),
  },
  {
    key: "parts_needed",`,
  `    build: ({ invoices, now }) => arAgingReport(invoices, now),
  },
  {
    key: "tax_liability",
    title: "Tax Liability",
    group: "Receivables",
    needs: ["invoices"],
    filters: ["monthRange", "dateBasis"],
    description: "Sales tax charged per month, split by tax rate.",
    notes: "Issue basis = tax billed that month (accrual); paid basis = tax on invoices reaching paid status that month (cash proxy — partial payments count only at full pay). Voids, drafts, and untaxed invoices excluded. Invoice list is limited to the 250 most recent by the invoicing action.",
    build: ({ invoices, dateBasis }) => taxLiabilityReport({ invoices, basis: dateBasis }),
  },
  {
    key: "parts_needed",`
);

fs.writeFileSync(f, s);
console.log("PATCHED", f);
