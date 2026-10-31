import fs from "node:fs";
const f = "src/components/estimator/ConvertToWorkOrder.jsx";
let s = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const must = (old, nu) => {
  if (!s.includes(old)) { console.error("MISS:", JSON.stringify(old.slice(0, 80))); process.exit(1); }
  s = s.replace(old, nu);
};

must(
  `import { acceptedInternalEstimateCost } from "./customerPricing";`,
  `import { acceptedInternalEstimateCost, acceptedCustomerUnitPrice } from "./customerPricing";`
);
must(
  `import { base44 } from "@/api/base44Client";`,
  `import { base44 } from "@/api/base44Client";\nimport { useAuth } from "@/components/auth/EmailGate";`
);
must(
  `  const [busy, setBusy] = useState(false);`,
  `  const [busy, setBusy] = useState(false);\n  const { currentUser } = useAuth();`
);

must(
  `      const verifiedCustomerId = resolvedCustomer?.id || "";`,
  `      const verifiedCustomerId = resolvedCustomer?.id || "";

      // Credit gate — CoreBridge semantics: an explicit credit_hold blocks new
      // work for staff (admins may override); credit_limit warns when the
      // projected account exposure (open AR + this estimate) would exceed it.
      // Open AR loads through the invoicing gateway — when it cannot be read
      // the limit check says so inside the prompt instead of guessing.
      const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
      const customerName = resolvedCustomer?.company_name || "This customer";
      if (resolvedCustomer?.credit_hold === true) {
        if (!isAdmin) {
          window.alert(\`\${customerName} is on CREDIT HOLD — new work orders are blocked. An administrator can clear the hold on the customer record.\`);
          return;
        }
        if (!window.confirm(\`\${customerName} is on CREDIT HOLD. Override the hold and convert anyway?\`)) return;
      } else if (Number(resolvedCustomer?.credit_limit) > 0) {
        const limit = Number(resolvedCustomer.credit_limit);
        const estimateTotal = (estimate.line_items || []).reduce(
          (sum, l) => sum + acceptedCustomerUnitPrice(l) * Math.max(1, Number(l?.customer_quantity) || 1),
          0,
        );
        let openAr = null;
        if (sessionToken) {
          try {
            const r = await base44.functions.invoke("invoicingAction", {
              session_token: sessionToken,
              action: "list_invoices",
              limit: 500,
            });
            const data = r?.data || r;
            if (data?.success) {
              openAr = (data.invoices || []).reduce(
                (sum, inv) => (inv?.customer_id === resolvedCustomer.id && inv?.status !== "void" ? sum + (Number(inv?.balance_due) || 0) : sum),
                0,
              );
            }
          } catch { /* openAr stays null — the prompt reports it could not be verified */ }
        }
        const exposure = (openAr || 0) + estimateTotal;
        if (exposure > limit + 0.005) {
          const arNote = openAr == null ? "open AR could not be loaded" : \`open AR \$\${openAr.toFixed(2)}\`;
          const msg = \`\${customerName} would exceed its credit limit — \${arNote} + this estimate \$\${estimateTotal.toFixed(2)} = \$\${exposure.toFixed(2)} vs limit \$\${limit.toFixed(2)}.\`;
          if (!isAdmin) {
            window.alert(\`\${msg} New work orders are blocked over the limit — an administrator can override.\`);
            return;
          }
          if (!window.confirm(\`\${msg} Override and convert anyway?\`)) return;
        }
      }`
);

fs.writeFileSync(f, s);
console.log("PATCHED", f);
