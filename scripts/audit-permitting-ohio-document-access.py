"""Audit repository archive bytes and literal UI references; no network or entity writes."""
import hashlib,json,pathlib
root=pathlib.Path('docs/official-evidence')
manifest_entries=[]
def walk(value,manifest):
 if isinstance(value,dict):
  if value.get('sha256') and value.get('file'):
   candidate=pathlib.Path(value.get('retained_path') or str(manifest.parent/value['file']))
   if candidate.is_file():manifest_entries.append((value,candidate,manifest))
  for child in value.values():walk(child,manifest)
 elif isinstance(value,list):
  for child in value:walk(child,manifest)
for m in sorted(root.glob('ohio-*/**/manifest.json')):walk(json.loads(m.read_text()),m)
source_files=[p for p in pathlib.Path('src').rglob('*') if p.is_file() and p.suffix in ['.js','.jsx','.json','.ts','.tsx']]
source_text={str(p):p.read_text() for p in source_files}
files=[]
for p in sorted(pathlib.Path('public/permitting-evidence').rglob('*')):
 if not p.is_file():continue
 b=p.read_bytes();digest=hashlib.sha256(b).hexdigest();url='/'+str(p.relative_to('public'))
 matches=[]
 for entry,candidate,manifest in manifest_entries:
  if entry['sha256']!=digest:continue
  original=candidate.read_bytes()
  assert original==b,f'Original differs: {p}'
  assert hashlib.sha256(original).hexdigest()==entry['sha256'],f'Manifest mismatch: {candidate}'
  if entry.get('bytes') is not None:assert len(original)==entry['bytes']
  matches.append(dict(manifest=str(manifest),original=str(candidate)))
 references=[name for name,content in source_text.items() if url in content]
 files.append(dict(archive=url,bytes=len(b),sha256=digest,verified_originals=matches,literal_source_references=references))
missing=[f['archive'] for f in files if not f['verified_originals']]
unlinked=[f['archive'] for f in files if not f['literal_source_references']]
report=dict(scope='Existing public/permitting-evidence files with Ohio evidence manifests; not statewide completeness or live browser acceptance',observed_on='2026-10-08',dossier_count=len(json.loads(pathlib.Path('src/components/permitting/ohioMunicipalResearch.json').read_text())),archive_count=len(files),verified_original_count=sum(bool(f['verified_originals']) for f in files),missing_manifest_matches=missing,without_literal_ui_reference=unlinked,files=files,limitations=['Literal source references do not prove rendering, routing, HTTP availability or published access.','Dynamically generated links may not be detected.','App-storage catalog registration, authority approval and statewide collection remain separate pending work.'],live_records_changed=0)
assert not missing,'Unverified archive manifests: '+str(missing)
out=pathlib.Path('docs/permitting-ohio-document-access-audit-2026-10-08.json');out.write_text(json.dumps(report,indent=2)+'\n')
text='# Ohio retained-document access audit\n\n'+report['scope']+'\n\n'+f"Verified {len(files)} archives against retained original bytes and manifest hashes. Existing municipal dossiers: {report['dossier_count']}.\n\n"
text+='## Files without literal app-source references\n\n'+ ('\n'.join('- '+x for x in unlinked) or 'None.')+'\n\n## Limits\n\n'+'\n'.join('- '+x for x in report['limitations'])+'\n\nNext: connect the remaining retained township documents to exact-identity locality dossiers, beginning with Delhi. No records changed or publication performed.\n'
pathlib.Path('docs/permitting-ohio-document-access-audit-2026-10-08.md').write_text(text)
print(json.dumps({k:v for k,v in report.items() if k not in ['files','limitations']},indent=2))
