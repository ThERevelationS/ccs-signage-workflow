import json, re, glob

def brace_match(s, i):
    # i points at '{'
    depth = 0
    instr = False
    esc = False
    for k in range(i, len(s)):
        c = s[k]
        if instr:
            if esc:
                esc = False
            elif c == '\\':
                esc = True
            elif c == '"':
                instr = False
            continue
        if c == '"':
            instr = True
        elif c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return k + 1
    return -1

inventory = {}
for fn in sorted(glob.glob('.audit-work/foundation-o013-authz/ents_*.json')):
    d = json.load(open(fn))
    for f in d['files']:
        if 'error' in f:
            continue
        name = f['path'].split('/')[-1].replace('.jsonc', '')
        t = f['content']
        i = t.find('"rls"')
        if i < 0:
            inventory[name] = {'rls': None}
            continue
        j = t.find('{', i)
        k = brace_match(t, j)
        block = t[j:k]
        actions = {}
        for a in ['create', 'read', 'update', 'delete']:
            m = re.search(r'"%s"\s*:' % a, block)
            if not m:
                actions[a] = None
                continue
            aj = block.find('{', m.end())
            if aj < 0:
                actions[a] = 'RAW:' + block[m.start():m.start() + 80]
                continue
            ak = brace_match(block, aj)
            sub = block[aj:ak]
            roles = re.findall(r'"role"\s*:\s*"([^"]+)"', sub)
            actions[a] = sorted(set(roles)) if roles else ('RAW:' + sub[:200])
        inventory[name] = actions
        inventory[name]['_raw_rls'] = block

json.dump(inventory, open('.audit-work/foundation-o013-authz/rls_inventory.json', 'w'), indent=1)

backend_only = []
other = []
for name, a in inventory.items():
    if '_raw_rls' not in a:
        other.append((name, 'NO RLS'))
        continue
    ok = True
    for act in ['create', 'read', 'update', 'delete']:
        v = a.get(act)
        if not (isinstance(v, list) and v and all('backend_only' in r for r in v)):
            ok = False
            break
    if ok:
        backend_only.append(name)
    else:
        other.append((name, {x: a.get(x) for x in ['create', 'read', 'update', 'delete']}))

print('TOTAL', len(inventory))
print('BACKEND-ONLY', len(backend_only))
print('NON-BACKEND-ONLY', len(other))
json.dump({'backend_only': backend_only,
           'non_backend_only': {n: v for n, v in other}},
          open('.audit-work/foundation-o013-authz/rls_classes.json', 'w'), indent=1)
for n in backend_only:
    print('  BO:', n)
