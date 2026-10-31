import re, pathlib
for f in ["src/components/queues/ProductQueue.jsx",
          "src/components/workflow/WorkOrderDetailsDialog.jsx",
          "src/pages/Invoices.jsx",
          "src/pages/PurchaseOrders.jsx"]:
    p = pathlib.Path(f)
    lines = p.read_text().split("\n")
    out = []
    bad = None
    for i, ln in enumerate(lines):
        if 'components/ui/ccs-date-field' in ln and bad is None:
            prev = out[-1] if out else ""
            if prev.strip() == "import {":
                bad = ln
                continue
        out.append(ln)
    if bad:
        # insert after the next line that ends the multi-line import: `} from "..."`
        for i, ln in enumerate(out):
            if re.match(r'^}\s*from\s+["\'].+["\'];?\s*$', ln):
                out.insert(i + 1, bad)
                break
        p.write_text("\n".join(out))
        print("FIXED", f, "->", bad.strip()[:60])
    else:
        print("no-op", f)
