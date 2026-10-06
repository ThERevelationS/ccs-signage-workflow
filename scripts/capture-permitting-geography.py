"""Explicit public-source capture or offline verification; never writes Base44 entities."""
import argparse, collections, datetime, hashlib, json, pathlib, re, urllib.parse, urllib.request
from html.parser import HTMLParser
ROOT = pathlib.Path('docs/official-evidence/oh-ky-geography-2026')
BASE = 'https://tigerweb.geo.census.gov/tigerwebmain/'
FAMILIES = {'counties':'county','incplace':'incorporated_place','cousub':'county_subdivision','concity':'consolidated_city'}
STATES = {'oh':'39','ky':'21'}
class Table(HTMLParser):
 def __init__(self):
  super().__init__(); self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='tr': self.row=[]
  elif tag in ('td','th') and self.row is not None:self.cell=[]
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag in ('td','th') and self.cell is not None:
   self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
  elif tag=='tr' and self.row is not None:
   self.rows.append(self.row);self.row=None
class Links(HTMLParser):
 def __init__(self):super().__init__();self.urls=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if tag=='a' and d.get('href'):self.urls.append(d['href'])
def parse(raw,state,family):
 text=raw.decode('utf-8-sig');assert 'Data as of January 1, 2026' in text,'Unexpected source vintage'
 p=Table();p.feed(text);headers=None;records=[]
 for row in p.rows:
  if 'GEOID' in row and 'MTFCC' in row:
   assert headers is None,'Multiple geographic tables';headers=row;continue
  if headers is None or not row:continue
  if row==['No data available']:
   assert family=='concity','Unexpected empty geographic source'
   continue
  assert len(row)==len(headers),f'Unexpected column count: {row[:3]}'
  record=dict(zip(headers,row));assert record['STATE']==STATES[state],'Wrong state'
  assert re.fullmatch(r'\d+',record['GEOID']) and record['GEOID'].startswith(STATES[state]),'Invalid GEOID'
  assert record['NAME'] and record['BASENAME'],'Missing name'
  records.append(record)
 assert headers is not None,'No geographic table'
 assert records or family=='concity','Unexpected empty inventory'
 assert len({r['GEOID'] for r in records})==len(records),'Duplicate GEOIDs within source'
 return records
def fetch(url):
 assert urllib.parse.urlsplit(url).hostname=='tigerweb.geo.census.gov'
 with urllib.request.urlopen(url,timeout=20) as response:
  assert urllib.parse.urlsplit(response.url).hostname=='tigerweb.geo.census.gov'
  return response.read()
def verify():
 manifest=json.loads((ROOT/'manifest.json').read_text());allrows=[]
 assert len(manifest['sources'])==8
 for source in manifest['sources']:
  raw=(ROOT/source['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256'],'Source hash mismatch'
  rows=parse(raw,source['state'],source['family']);assert len(rows)==source['record_count']
  allrows += [{'state':source['state'].upper(),'geography_kind':FAMILIES[source['family']],'source_file':source['file'],**r} for r in rows]
 assert allrows==json.loads((ROOT/'inventory.json').read_text())['records'],'Normalized inventory differs from sources'
 print(json.dumps({'verified':True,'source_files':8,'records':len(allrows),'by_state_kind':dict(collections.Counter(r['state']+'/'+r['geography_kind'] for r in allrows))},indent=2))
def capture():
 assert not ROOT.exists(),'Snapshot already exists; verify it or choose a new dated snapshot instead of overwriting'
 # Download and validate everything before writing the snapshot.
 collected=[]
 for family in FAMILIES:
  index=BASE+f'TIGERweb_{family}_current.html';links=Links();links.feed(fetch(index).decode())
  for state in STATES:
   targets=[urllib.parse.urljoin(index,h) for h in links.urls if re.search(r'_'+state+r'\.html$',h)]
   assert len(targets)==1,f'Expected one {state}/{family} source'
   raw=fetch(targets[0]);rows=parse(raw,state,family)
   collected.append(({'state':state,'family':family,'index_url':index,'url':targets[0],'file':f'{state}-{family}.html','sha256':hashlib.sha256(raw).hexdigest(),'record_count':len(rows)},raw,rows))
 ROOT.mkdir(parents=True)
 records=[]
 for meta,raw,rows in collected:
  (ROOT/meta['file']).write_bytes(raw)
  records += [{'state':meta['state'].upper(),'geography_kind':FAMILIES[meta['family']],'source_file':meta['file'],**r} for r in rows]
 (ROOT/'manifest.json').write_text(json.dumps({'retrieved_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_vintage':'2026-01-01','sources':[m for m,_,_ in collected]},indent=2)+'\n')
 (ROOT/'inventory.json').write_text(json.dumps({'source_vintage':'2026-01-01','authority_verified':False,'inventory_complete_for_permitting':False,'notes':['Geographic reference only; not a permitting authority list.','Preserve different geography kinds even when names coincide.','Incorporated-place tables do not supply county membership.','County subdivisions include statistical and inactive entities; retain FUNCSTAT, LSADC and class codes for explicit reconciliation.','Consolidated-city and balance records require authority mapping; never sum these categories as distinct governments.'],'records':records},indent=2)+'\n')
 verify()
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--capture',action='store_true');a=p.parse_args()
 capture() if a.capture else verify()
