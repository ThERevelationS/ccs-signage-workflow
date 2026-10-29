import json

edits = [
    {
        "old_text": "        can_view_resources: user.can_view_resources,\n",
        "new_text": "        can_view_resources: user.can_view_resources,\n        can_approve_quotes: user.can_approve_quotes === true,\n",
    },
]
with open('remote_pull/vs_edits.json', 'w', encoding='utf-8') as f:
    json.dump(edits, f)
print('ok')
