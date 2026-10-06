"""Manual exhaustive read of Ohio government public directory; no entity writes."""
import argparse,datetime,hashlib,json,pathlib,urllib.parse,urllib.request
URL='https://maps.ohio.gov/arcgis/rest/services/Hosted/BBS_Jurisdictions/FeatureServer/0'
ROOT=pathlib.Path('docs/official-evidence/ohio-building-directory-2026-10-06')
def validate_ids(data,expected):
 assert isinstance(data.get('objectIds'),list),'Missing ID inventory'
 ids=data['objectIds'];assert all(isinstance(x,int) and not isinstance(x,bool) for x in ids),'Invalid ID'
 assert len(ids)==len(set(ids))==expected,'ID count mismatch or duplicate IDs'
 return sorted(ids)
def collect(ids,read_batch,oid,page_size=200):
 assert page_size>0;rows=[]
 for start in range(0,len(ids),page_size):
  wanted=ids[start:start+page_size];data=read_batch(wanted)
  assert not data.get('error') and not data.get('exceededTransferLimit'),'Incomplete source batch'
  features=data.get('features');assert isinstance(features,list),'Invalid feature batch'
  attrs=[f['attributes'] for f in features]
  actual=[a.get(oid) for a in attrs];assert len(actual)==len(set(actual))==len(wanted) and set(actual)==set(wanted),'Batch identity mismatch'
  rows.extend(attrs)
 assert len(rows)==len(ids),'Incomplete capture'
 return sorted(rows,key=lambda r:r[oid])
def fetch(path='',params=None):
 url=URL+path+'?'+urllib.parse.urlencode({'f':'json',**(params or {})})
 with urllib.request.urlopen(url,timeout=20) as response:raw=response.read()
 data=json.loads(raw);assert not data.get('error'),str(data.get('error'))
 return url,raw,data
def verify():
 manifest=json.loads((ROOT/'manifest.json').read_text());files={}
 for item in manifest['files']:
  raw=(ROOT/item['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==item['sha256'];files[item['file']]=json.loads(raw)
 metadata=files['layer.json'];oid=metadata['objectIdField'];expected=files['count-before.json']['count']
 ids=validate_ids(files['ids-before.json'],expected);assert validate_ids(files['ids-after.json'],expected)==ids
 assert files['count-after.json']['count']==expected
 batches=iter(manifest['batch_files']);rows=collect(ids,lambda _:files[next(batches)],oid)
 assert rows==json.loads((ROOT/'records.json').read_text())['records']
 print(json.dumps({'verified':True,'directory_records':len(rows),'batches':len(manifest['batch_files']),'has_dedicated_electrical_fields':any('electric' in f['name'].lower() for f in metadata['fields'])},indent=2))
def capture():
 assert not ROOT.exists(),'Do not overwrite a dated source snapshot'
 files=[];blobs={}
 def keep(name,path='',params=None):
  url,raw,data=fetch(path,params);blobs[name]=raw;files.append({'file':name,'url':url,'sha256':hashlib.sha256(raw).hexdigest()});return data
 metadata=keep('layer.json');oid=metadata['objectIdField'];assert oid and metadata['name']=='Jurisdictions'
 count=keep('count-before.json','/query',{'where':'1=1','returnCountOnly':'true'})['count'];assert count>0
 ids=validate_ids(keep('ids-before.json','/query',{'where':'1=1','returnIdsOnly':'true'}),count);batch_files=[]
 def read_batch(wanted):
  name=f'batch-{len(batch_files)+1:04d}.json';batch_files.append(name)
  return keep(name,'/query',{'objectIds':','.join(map(str,wanted)),'outFields':'*','returnGeometry':'false'})
 rows=collect(ids,read_batch,oid)
 assert keep('count-after.json','/query',{'where':'1=1','returnCountOnly':'true'})['count']==count,'Directory membership changed'
 assert validate_ids(keep('ids-after.json','/query',{'where':'1=1','returnIdsOnly':'true'}),count)==ids,'Directory membership changed'
 ROOT.mkdir(parents=True)
 for name,raw in blobs.items():(ROOT/name).write_bytes(raw)
 (ROOT/'manifest.json').write_text(json.dumps({'source_url':URL,'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files,'batch_files':batch_files,'not_atomic_snapshot':True,'membership_verified_before_after':True},indent=2)+'\n')
 (ROOT/'records.json').write_text(json.dumps({'source_url':URL,'authority_verified':False,'inventory_complete_for_permitting':False,'geometry_captured':False,'notes':['Complete membership read of this directory layer, not complete statewide office coverage.','Rows are jurisdictions and service listings; do not count them as unique offices.','Before/after ID and count checks do not rule out in-place edits during reads.','Electrical issuance/inspection responsibility and sign applicability require separate official evidence.','Retain certification distinctions, exceptions and source edit timestamps.'],'records':rows},indent=2)+'\n')
 verify()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--capture',action='store_true');args=p.parse_args();capture() if args.capture else verify()
