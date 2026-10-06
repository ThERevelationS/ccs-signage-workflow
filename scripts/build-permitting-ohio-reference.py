"""Offline Ohio classification; no entity writes or authority claims."""
import collections,json,pathlib,runpy
SOURCE=pathlib.Path('docs/official-evidence/oh-ky-geography-2026')
OUTPUT=pathlib.Path('docs/official-evidence/ohio-reference-2026')
DEFINITIONS={'functional_status':'https://www.census.gov/library/reference/code-lists/functional-status-codes.html','legal_status':'https://www.census.gov/library/reference/code-lists/legal-status-codes.html'}
def classify(records):
 rows=[r for r in records if r['state']=='OH'];counties={r['GEOID']:r for r in rows if r['geography_kind']=='county'}
 candidates=[];review=[];hierarchy=[]
 for r in rows:
  kind=r['geography_kind'];status=r['FUNCSTAT'];lsad=r['LSADC']
  record={'reference_key':kind+':'+r['GEOID'],'geoid':r['GEOID'],'name':r['NAME'],'base_name':r['BASENAME'],'geography_kind':kind,'funcstat':status,'lsadc':lsad,'source_file':r['source_file'],'authority_verified':False}
  if kind in ['county','county_subdivision']:
   county_id=r['STATE']+r['COUNTY'];assert county_id in counties,'Unknown county reference'
   record.update(county_geoid=county_id,county_name=counties[county_id]['NAME'],county_membership_status='source_explicit')
  else:
   record.update(county_geoid=None,county_name=None,county_membership_status='official_relationship_pending')
  if kind=='county' and status=='A':record['queue_type']='county';candidates.append(record)
  elif kind=='incorporated_place' and status=='A' and lsad in ['25','47']:
   record['queue_type']='city' if lsad=='25' else 'village';candidates.append(record)
  elif kind=='county_subdivision' and status=='A' and lsad=='44':record['queue_type']='township';candidates.append(record)
  elif kind=='county_subdivision' and status=='F':
   record['reason']='Census hierarchy entity; not a separate government';hierarchy.append(record)
  else:
   record['reason']='Explicit status/authority relationship review required';review.append(record)
 assert len(candidates)+len(review)+len(hierarchy)==len(rows),'Unaccounted Ohio rows'
 assert len({r['reference_key'] for r in candidates+review+hierarchy})==len(rows),'Duplicate source identity'
 return {'source_vintage':'2026-01-01','definitions':DEFINITIONS,'authority_verified':False,'inventory_complete_for_permitting':False,'notes':['Candidates are geographic research targets, not confirmed sign-permitting offices.','Active government status does not establish zoning or sign jurisdiction.','Place county membership remains pending; never infer from centroid or name.','Consolidated, inactive and nonfunctioning entities retained for review.','No production records created or changed.'],'candidates':candidates,'status_review':review,'hierarchy_reference':hierarchy}
if __name__=='__main__':
 runpy.run_path('scripts/capture-permitting-geography.py')['verify']()
 result=classify(json.loads((SOURCE/'inventory.json').read_text())['records']);OUTPUT.mkdir(exist_ok=True)
 (OUTPUT/'reference.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'Ohio_candidates_by_type':dict(collections.Counter(r['queue_type'] for r in result['candidates'])),'status_review':len(result['status_review']),'hierarchy_reference':len(result['hierarchy_reference']),'place_county_relationship_pending':sum(r['county_membership_status']=='official_relationship_pending' for r in result['candidates'])},indent=2))
