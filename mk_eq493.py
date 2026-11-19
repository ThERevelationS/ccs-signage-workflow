import json
edits = [
 {"old_text": 'import { isEstimateStatusTransitionAllowed } from "@/components/estimator/estimateStatusTransitions";',
  "new_text": 'import { isEstimateStatusTransitionAllowed, statusTransitionMap, allEstimateStatuses } from "@/components/estimator/estimateStatusTransitions";'},
 {"old_text": '  const [companyTz, setCompanyTz] = useState("");',
  "new_text": '  const [companyTz, setCompanyTz] = useState("");\n  const [statusMap, setStatusMap] = useState(null);\n  const [customStatuses, setCustomStatuses] = useState([]);'},
 {"old_text": '''    staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1)
      .then((rows) => setCompanyTz((Array.isArray(rows) ? rows[0]?.display_timezone : "") || ""))
      .catch(() => {});''',
  "new_text": '''    staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1)
      .then((rows) => {
        const d = (Array.isArray(rows) ? rows[0] : null) || {};
        setCompanyTz(d.display_timezone || "");
        let cs = [], tr = {};
        try { cs = JSON.parse(d.custom_statuses || "[]") || []; } catch {}
        try { tr = JSON.parse(d.status_transitions || "{}") || {}; } catch {}
        setCustomStatuses(Array.isArray(cs) ? cs : []);
        setStatusMap(statusTransitionMap(cs, tr));
      })
      .catch(() => {});'''},
 {"old_text": '      if (!isEstimateStatusTransitionAllowed(row?.status, bulkStatus)) {',
  "new_text": '      if (!isEstimateStatusTransitionAllowed(row?.status, bulkStatus, statusMap)) {'},
 {"old_text": '{["draft", "calculated", "sent", "approved", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}',
  "new_text": '{allEstimateStatuses(customStatuses).map((s) => <option key={s} value={s}>{s}</option>)}'}]
open('eq.json','w').write(json.dumps(edits))
print('wrote')
