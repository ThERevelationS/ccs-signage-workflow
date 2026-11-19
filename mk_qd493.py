import json
qd = [
 {"old_text": '"doc_number_padding", "module_number_prefixes",',
  "new_text": '"doc_number_padding", "module_number_prefixes", "display_timezone", "custom_statuses", "status_transitions",'},
 {"old_text": '  display_timezone: "",',
  "new_text": '  display_timezone: "",\n  custom_statuses: "",\n  status_transitions: "",'}]
open('qd.json','w').write(json.dumps(qd))
print('wrote')
