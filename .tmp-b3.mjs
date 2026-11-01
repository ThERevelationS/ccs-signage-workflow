import fs from "node:fs";
const must = (s, old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 90))); process.exit(1); }
  return s.replace(old, nu);
};

// 1) AttentionFeed: render the estimate_requests (assigned-to-me) feed section.
let f = "src/components/workflow/AttentionFeed.jsx";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `    {
      key: "staleQuotes",`,
  `    {
      key: "estimate_requests",
      label: "assigned to me",
      count: (feed.estimate_requests || []).length,
      icon: ClipboardList,
      tone: "text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      items: (feed.estimate_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: \`\${r.request_number || "Request"}\${r.opportunity_title ? \` · \${r.opportunity_title}\` : ""}\`,
        secondary: \`\${r.overdue ? \`OVERDUE \${r.due_date} · \` : ""}\${r.status}\${r.assigned_estimator ? \` · \${r.assigned_estimator}\` : ""}\`,
        href: r.opportunity_id ? \`/Opportunities?open=\${r.opportunity_id}\` : "/Opportunities",
      })),
    },
    {
      key: "staleQuotes",`
);
s = must(s,
  `{[...["portal","invoices","pos","cos","follow","sent","requests","unassigned","stock","jobs","permits","fees","recalc"], ...COMPUTED_SECTION_KEYS].map((key) => {`,
  `{[...["portal","invoices","pos","cos","follow","sent","requests","estimate_requests","unassigned","stock","jobs","permits","fees","recalc"], ...COMPUTED_SECTION_KEYS].map((key) => {`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// 2) EstimateRevision.jsonc: add "revert" to revision_type enum.
f = "base44/entities/EstimateRevision.jsonc";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  `        "manual_revision",
        "status_transition",
        "cancel",
        "conversion"`,
  `        "manual_revision",
        "status_transition",
        "cancel",
        "conversion",
        "revert"`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);

// 3) estimateRevisionService: write the real "revert" type + update the comment.
f = "src/components/estimator/estimateRevisionService.js";
s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
s = must(s,
  ` * new completed lifecycle revision (manual_revision type; the schema enum
 * is closed so the reason/notes carry the revert identity), preserving the`,
  ` * new completed lifecycle revision (revert type; reason/notes also carry
 * the target identity), preserving the`
);
s = must(s,
  `    revisionType: "manual_revision",`,
  `    revisionType: "revert",`
);
fs.writeFileSync(f, s);
console.log("PATCHED", f);
