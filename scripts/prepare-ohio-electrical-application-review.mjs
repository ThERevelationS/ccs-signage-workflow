import{readFileSync,writeFileSync}from'node:fs';
const root='docs/official-evidence/ohio-electrical-application-review-2026-10-07/',packet=JSON.parse(readFileSync(root+'routing-review.json'));
const path='src/components/permitting/ohioMunicipalResearch.json',rows=JSON.parse(readFileSync(path));
const note='The electrical provider homepage routes Ohio work in its jurisdictions to ezTrak, while an older online form still shows Ohio/Kentucky and signs/billboard choices. The older form is not a confirmed current Ohio route. Provider page originals returned HTTP 406; township/address coverage, issuer and inspector remain unapproved.';
for(const id of ['6ac1aae70e3a16c893d4e506','6ac19f1c2fbbf3b8bb27397c']){
 const row=rows.find(r=>r.id===id);if(!row)throw Error('Canonical dossier missing');
 if(!row.notes.includes(note))row.notes.push(note);
 const ref={label:'Electrical plan-review reference — original retention gap; applicability pending',url:packet.observations[2].url};
 if(!row.references.some(r=>r.url===ref.url))row.references.push(ref);
}
writeFileSync(path,JSON.stringify(rows,null,2)+'\n');
console.log('Provider form/Ohio migration conflict recorded on two exact-locality research dossiers; no approved route.');
