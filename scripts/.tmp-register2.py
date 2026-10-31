p="src/App.jsx"
s=open(p).read()
name="Imports"
lazy="const %s = lazyPage(() => import('./pages/%s'));" % (name,name)
if lazy not in s:
    a="const QuickPrice = lazyPage(() => import('./pages/QuickPrice'));"
    assert a in s
    s=s.replace(a, a+"\n"+lazy, 1)
if "  %s,\n" % name not in s:
    b="  QuickPrice,\n"
    i=s.index(b)
    s=s[:i+len(b)]+"  %s,\n" % name + s[i+len(b):]
open(p,"w").write(s)

p2="src/components/estimator/navConfig.js"
s=open(p2).read()
if '"/Imports"' not in s:
    a='      { label: "Ops Reports", to: "/OpsReports" },'
    assert a in s
    s=s.replace(a, a+'\n      { label: "Imports", to: "/Imports" },',1)
open(p2,"w").write(s)

p3="base44/functions/staffEntityWrite/entry.ts"
s=open(p3).read()
if "Inventory: new Set" not in s:
    a="  CustomItemsProject: new Set(['create', 'update', 'updateMany', 'delete']),"
    assert a in s
    s=s.replace(a, a+"\n  Inventory: new Set(['create', 'updateMany']),",1)
open(p3,"w").write(s)
print("REGISTERED2")
