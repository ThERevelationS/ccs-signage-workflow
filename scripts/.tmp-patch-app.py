p="src/App.jsx"
s=open(p).read()
a="const QuickPrice = lazyPage(() => import('./pages/QuickPrice'));"
assert a in s, "anchor1 missing"
s=s.replace(a, a+"\nconst WalkIn = lazyPage(() => import('./pages/WalkIn'));\nconst OpsReports = lazyPage(() => import('./pages/OpsReports'));",1)
b="  QuickPrice,\n"
i=s.index(b)
s=s[:i+len(b)]+"  WalkIn,\n  OpsReports,\n"+s[i+len(b):]
open(p,"w").write(s)
print("PATCHED_APP")
