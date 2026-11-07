import json,re,os
targets={'SignageFact':'__signagefact_backend_only__','SignageFactIndex':'__signagefactindex_backend_only__','PermitResolutionRule':'__permitresolutionrule_backend_only__','ProofShareLink':'__proofsharelink_backend_only__'}
for name,role in targets.items():
    p='base44/entities/%s.jsonc'%name
    t=open(p,encoding='utf-8').read()
    if '"rls"' in t:
        print(name,'ALREADY HAS rls — skipped'); continue
    i=t.rfind('}')
    head=t[:i].rstrip()
    if not head.endswith(('}',']')):
        print(name,'UNEXPECTED TAIL — skipped'); continue
    rls='\n  ,\n  "rls": {\n    "create": { "user_condition": { "role": "%s" } },\n    "read": { "user_condition": { "role": "%s" } },\n    "update": { "user_condition": { "role": "%s" } },\n    "delete": { "user_condition": { "role": "%s" } }\n  }\n}\n'%(role,role,role,role)
    open(p,'w',encoding='utf-8').write(head+rls)
    print(name,'PATCHED')
