s = open('src/App.jsx').read()
if 'Customer360' not in s:
    old1 = "const CommsFollowups = lazyPage(() => import('./pages/CommsFollowups'));"
    s = s.replace(old1, old1 + "\nconst Customer360 = lazyPage(() => import('./pages/Customer360'));", 1)
    s = s.replace("  CommsFollowups,\n", "  CommsFollowups,\n  Customer360,\n", 1)
    open('src/App.jsx','w').write(s)
    print('patched')
else:
    print('already')
