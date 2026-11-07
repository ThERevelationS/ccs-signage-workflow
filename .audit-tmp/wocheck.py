import json,re
for n in ['WorkOrder','InventoryCostHistory']:
    t=open('base44/entities/%s.jsonc'%n,encoding='utf-8').read()
    t=re.sub(r'/\*[\s\S]*?\*/','',t); t=re.sub(r'(?m)//.*$','',t)
    j=json.loads(t); print(n, json.dumps(j.get('rls'))[:600])
