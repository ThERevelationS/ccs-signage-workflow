p="src/App.jsx"
s=open(p).read()
for name in ["WalkIn","OpsReports","CrmEvents"]:
    lazy="const %s = lazyPage(() => import('./pages/%s'));" % (name,name)
    if lazy not in s:
        a="const QuickPrice = lazyPage(() => import('./pages/QuickPrice'));"
        assert a in s, "anchor missing"
        s=s.replace(a, a+"\n"+lazy, 1)
    b="  QuickPrice,\n"
    if "  %s,\n" % name not in s:
        i=s.index(b)
        s=s[:i+len(b)]+"  %s,\n" % name + s[i+len(b):]
open(p,"w").write(s)

p2="src/components/estimator/navConfig.js"
s=open(p2).read()
if '"/WalkIn"' not in s:
    a='      { label: "Quick Price", to: "/QuickPrice" },'
    assert a in s
    s=s.replace(a, a+'\n      { label: "Walk-in Sale", to: "/WalkIn" },',1)
if '"/OpsReports"' not in s:
    a='      { label: "Job Workspace", to: "/JobWorkspace" },'
    assert a in s
    s=s.replace(a, a+'\n      { label: "Ops Reports", to: "/OpsReports" },',1)
if '"/CrmEvents"' not in s:
    a='      { label: "All Customers", to: "/EstimatorCustomers" },'
    assert a in s
    s=s.replace(a, a+'\n      { label: "CRM Events", to: "/CrmEvents" },',1)
open(p2,"w").write(s)
print("REGISTERED")
