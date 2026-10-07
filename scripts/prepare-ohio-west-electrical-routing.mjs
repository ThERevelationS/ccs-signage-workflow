import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='docs/official-evidence/ohio-west-offices-2026-10-07/electrical-routing/';
const manifest=JSON.parse(readFileSync(root+'manifest.json'));
const source=manifest.sources.find(s=>s.file==='ibi-eztrak-new-user.pdf');
const bytes=readFileSync(source.retained_path);
if(source.status!=='archived'||bytes.length!==source.bytes||createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('IBI guide archive identity mismatch');
copyFileSync(source.retained_path,'public/permitting-evidence/ohio-west/'+source.file);
const research={observed_on:'2026-10-07',provider:'The Inspection Bureau, Inc.',source:'https://www.inspectionbureau.com/',
guide_source:source.official_url,guide_archive:'/permitting-evidence/ohio-west/'+source.file,sha256:source.sha256,bytes:source.bytes,
portal:'https://eztrak.cagis.org/',schedule_source:'https://www.inspectionbureau.com/wp-content/uploads/2026/09/Inspection-Areas-2026-1.xls',
schedule_status:'retrieval_gap',schedule_http_outcome:'406',coverage_approved:false,permit_issuer_approved:false,inspection_role_approved:false,
note:'The provider publishes Ohio electrical permit/plan-review routing through CAGIS ezTrak. Its retained guide distinguishes electrical permit and plan-review records. This is provider routing research; Cheviot and Cleves coverage, permit issuance and inspection roles are not established. The inspection-area XLS original returned HTTP 406 and has not been inspected.'};
const path='src/components/permitting/ohioMunicipalResearch.json',rows=JSON.parse(readFileSync(path));
for(const row of rows)if(['Cheviot','Cleves'].includes(row.name))row.electrical_research=research;
writeFileSync(path,JSON.stringify(rows,null,2)+'\n');
writeFileSync(root+'routing-review-packet.json',JSON.stringify({research,municipalities:['Cheviot','Cleves'],staff_approved:false,
raw_page_gaps:manifest.sources.filter(s=>s.status!=='archived').map(s=>({url:s.official_url,error:s.error})),
compiled_electric_code_currentness_approved:false,locality_roles_changed:false},null,2)+'\n');
console.log('IBI original guide verified and retained; XLS and municipal-role gaps preserved.');
