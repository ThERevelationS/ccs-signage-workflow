"""Build compact, source-verified geographic denominator; no production writes."""
import json,hashlib,pathlib,runpy,collections
root=pathlib.Path('docs/official-evidence/oh-ky-geography-2026')
runpy.run_path('scripts/capture-permitting-geography.py')['verify']()
inventory=json.loads((root/'inventory.json').read_text())
manifest=json.loads((root/'manifest.json').read_text())
counties={r['GEOID']:r for r in inventory['records'] if r['geography_kind']=='county'}
rows=[]
for r in inventory['records']:
 kind=r['geography_kind'];status=r['FUNCSTAT'];lsad=r['LSADC']
 typ='county' if kind=='county' else 'city' if kind=='incorporated_place' and lsad=='25' else 'village' if kind=='incorporated_place' and lsad=='47' else 'township' if r['state']=='OH' and kind=='county_subdivision' and lsad=='44' else None
 candidate=status=='A' and typ is not None
 category='candidate' if candidate else 'statistical_reference' if (r['state']=='KY' and kind=='county_subdivision' and status=='S') or (kind=='county_subdivision' and status=='F') else 'status_relationship_review'
 county=counties.get(r['STATE']+r.get('COUNTY','')) if kind=='county_subdivision' else None
 rows.append(dict(key=r['state']+':'+kind+':'+r['GEOID'],state=r['state'],name=r['BASENAME'],type=typ,category=category,county_name=county['BASENAME'] if county else None,source_file=r['source_file'],funcstat=status,lsadc=lsad))
result=dict(source_vintage=inventory['source_vintage'],source_rows=len(rows),sources=[dict(file=s['file'],sha256=s['sha256'],url=s['url']) for s in manifest['sources']],rows=rows,authority_verified=False)
out=pathlib.Path('src/components/permitting/officialGeographicInventory.json')
out.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(json.dumps(dict(source_rows=len(rows),categories=dict(collections.Counter(r['category'] for r in rows)),candidates_by_state=dict(collections.Counter(r['state'] for r in rows if r['category']=='candidate')))))
