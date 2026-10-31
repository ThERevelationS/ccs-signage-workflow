import re, glob
hits = []
for f in glob.glob('src/**/*.jsx', recursive=True) + glob.glob('src/**/*.js', recursive=True):
    s = open(f, encoding='utf8').read()
    n = s.count('EstimatorCustomers?customer=')
    if n:
        s = s.replace('EstimatorCustomers?customer=', 'Customer360?id=')
        open(f, 'w', encoding='utf8').write(s)
        hits.append((f, n))
for f, n in hits: print(f, n)
print('TOTAL', sum(n for _, n in hits))
