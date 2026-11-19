import json
edits = [
 {"old_text": 'import { isEstimateStatusTransitionAllowed } from "@/components/estimator/estimateStatusTransitions";',
  "new_text": 'import { isEstimateStatusTransitionAllowed, statusTransitionMap } from "@/components/estimator/estimateStatusTransitions";'},
 {"old_text": '  const [watchNote, setWatchNote] = useState("");',
  "new_text": '''  const [watchNote, setWatchNote] = useState("");
  const [statusMap, setStatusMap] = useState(null);
  // Custom statuses (#493): QuoteDefaults custom_statuses + status_transitions
  // merge over the baked transition enum.
  useEffect(() => {
    staffEntities.QuoteDefaults.filter({ config_name: "default" }, undefined, 1)
      .then((rows) => {
        const d = (Array.isArray(rows) ? rows[0] : null) || {};
        let cs = [], tr = {};
        try { cs = JSON.parse(d.custom_statuses || "[]") || []; } catch {}
        try { tr = JSON.parse(d.status_transitions || "{}") || {}; } catch {}
        setStatusMap(statusTransitionMap(cs, tr));
      })
      .catch(() => {});
  }, []);'''},
 {"old_text": '      if (!isEstimateStatusTransitionAllowed(before.status, estimate.status)) {',
  "new_text": '      if (!isEstimateStatusTransitionAllowed(before.status, estimate.status, statusMap)) {'}]
open('ed.json','w').write(json.dumps(edits))
print('wrote')
