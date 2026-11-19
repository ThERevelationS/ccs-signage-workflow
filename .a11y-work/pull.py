import sys, json, os, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
raw = sys.stdin.buffer.read().decode('utf-8')
d = json.loads(raw[raw.find('{'):])
for f in d['files']:
    p = '.a11y-work/' + f['path']
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as fh:
        fh.write(f['content'])
    print(f['path'], len(f['content']))
