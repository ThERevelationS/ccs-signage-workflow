"""Inventory recorded Hamilton County retrieval failures; no network or entity writes."""
import argparse,datetime,json,pathlib,urllib.parse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--observed-on',default=datetime.date.today().isoformat(),type=lambda v:datetime.date.fromisoformat(v).isoformat())
args=parser.parse_args();groups={}
def walk(value,receipt):
 if isinstance(value,dict):
  url=value.get('official_url') or value.get('candidate_url') or value.get('url')
  status=str(value.get('status',''))
  if isinstance(url,str):
   parsed=urllib.parse.urlsplit(url)
   county=parsed.hostname in ['www.hamiltoncountyohio.gov','hamiltoncountyohio.gov','www.hamilton-co.org','hamilton-co.org'] or (parsed.hostname=='cms2.revize.com' and parsed.path.startswith('/revize/hamiltoncountyoh/'))
   if county and ('gap' in status or value.get('error')):
    group=groups.setdefault(url,{'url':url,'kind':'document' if parsed.path.lower().endswith(('.pdf','.doc','.docx','.xls','.xlsx')) else 'page','attempts':[]})
    group['attempts'].append({'receipt':str(receipt),'status':status,'error':value.get('error'),'observed_at':value.get('observed_at'),'candidate_only':bool(value.get('candidate_url') and not value.get('official_url'))})
  for child in value.values():walk(child,receipt)
 elif isinstance(value,list):
  for child in value:walk(child,receipt)
for path in sorted(pathlib.Path('docs/official-evidence').glob('ohio-*/**/*.json')):
 if 'pages' not in path.name:walk(json.loads(path.read_text()),path)
rows=[groups[url] for url in sorted(groups)]
report={'observed_on':args.observed_on,'scope':'Recorded Hamilton County retrieval gaps in retained Ohio research receipts; not an exhaustive county source inventory','unique_exact_urls':len(rows),'recorded_attempts':sum(len(r['attempts']) for r in rows),'document_urls':sum(r['kind']=='document' for r in rows),'items':rows,'limitations':['Exact URLs remain distinct; aliases and proposed repairs are not verified equivalents.','Receipt presence does not establish current HTTP failure; no requests were repeated.','Failures may subsequently have been recovered elsewhere; no resolved/unresolved authority is inferred.','A county source reference does not establish locality coverage or office responsibility.'],'live_records_changed':0}
assert len({r['url'] for r in rows})==len(rows)
assert all(r['attempts'] for r in rows)
base=pathlib.Path('docs/permitting-county-retrieval-gaps-'+args.observed_on)
base.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
lines=['# Hamilton County recorded retrieval gaps','',report['scope'],'',f"{report['unique_exact_urls']} exact URLs; {report['recorded_attempts']} recorded attempts; {report['document_urls']} document URLs.",'','| Kind | Source URL | Recorded attempts |','| --- | --- | --- |']
lines += [f"| {r['kind']} | {r['url']} | {len(r['attempts'])} |" for r in rows]
lines += ['','## Limits','']+['- '+v for v in report['limitations']]+['','Next: prioritize accessible Ohio originals; retry these sources when there is a new official URL or access path. Preserve county coverage review separately.','']
base.with_suffix('.md').write_text('\n'.join(lines))
print(json.dumps({k:v for k,v in report.items() if k not in ['items','limitations']},indent=2))
