import json, io, sys, os
for j in os.listdir('.'):
    if not j.endswith('.json') or j in ('extract.py',): continue
    base = j[:-5]
    if base == 'builderService': continue
    try:
        d = json.load(io.open(j, encoding='utf-8'))
        files = d.get('files') or []
        c = files[0].get('content','') if files else ''
        if not c:
            print('EMPTY', j); continue
        io.open(base, 'w', encoding='utf-8', newline='').write(c)
        print('OK', base, len(c))
    except Exception as e:
        print('BAD', j, str(e)[:80])
