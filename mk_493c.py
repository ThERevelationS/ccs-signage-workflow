import json
qd = [
 {"old_text": '"module_number_prefixes", "display_timezone",',
  "new_text": '"module_number_prefixes", "display_timezone", "custom_statuses", "status_transitions",'},
 {"old_text": '  display_timezone: "",',
  "new_text": '  display_timezone: "",\n  custom_statuses: "",\n  status_transitions: "",'}]
qs = [
 {"old_text": "IANA timezone for estimate/date displays (e.g. <code>America/New_York</code>, <code>America/Chicago</code>) — blank uses the viewer's local zone.</p>",
  "new_text": "IANA timezone for estimate/date displays (e.g. <code>America/New_York</code>, <code>America/Chicago</code>) — blank uses the viewer's local zone.</p>\n            <TextField label=\"Custom statuses (JSON)\" value={form.custom_statuses} onChange={(value) => patch({ custom_statuses: value })} textarea wide />\n            <TextField label=\"Status transitions (JSON)\" value={form.status_transitions} onChange={(value) => patch({ status_transitions: value })} textarea wide />\n            <p className=\"text-[10px] text-gray-400 -mt-1 sm:col-span-2\">Custom estimate statuses: a JSON list of slugs, e.g. <code>{'[\"on_hold\",\"awaiting_permit\"]'}</code>, plus a transitions map <code>{'{\"on_hold\":[\"sent\",\"cancelled\"]}'}</code>. Custom statuses get no outgoing moves until the map allows them.</p>"}]
open('qd.json','w').write(json.dumps(qd))
open('qs.json','w').write(json.dumps(qs))
print('wrote')
