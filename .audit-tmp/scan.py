import json,re,os
d='base44/entities'
for fn in sorted(os.listdir(d)):
    if not fn.endswith('.jsonc'): continue
    t=open(os.path.join(d,fn),encoding='utf-8').read()
    t=re.sub(r'/\*[\s\S]*?\*/','',t); t=re.sub(r'(?m)//.*$','',t)
    try: j=json.loads(t)
    except: print('PARSE-FAIL',fn); continue
    rls=j.get('rls') or {}
    name=j.get('name') or fn[:-6]
    row={}
    for op in ['read','create','update','delete']:
        c=rls.get(op); s=json.dumps(c)
        if c is None: row[op]='ABSENT'
        elif s=='{}': row[op]='OPEN'
        elif 'backend_only' in s or 'service_only' in s: row[op]='B_ONLY'
        elif 'admin' in s: row[op]='ADMIN'
        else: row[op]=s[:70]
    nopic=[k for k,v in row.items() if v in ('OPEN','ABSENT')]
    if nopic: print(name, json.dumps(row))
