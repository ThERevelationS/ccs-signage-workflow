const FN='https://base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const t=await fetch(FN+'/verifyLogin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'bheinlein',password:'Heinlein56!!'})}).then(r=>r.json());
if(!t?.token){console.log('no token');process.exit(1)}
const hdr={'Content-Type':'application/json'};
const q=async(body)=>{for(let i=0;i<6;i++){const j=await fetch(FN+'/staffDataRead',{method:'POST',headers:hdr,body:JSON.stringify({session_token:t.token,...body})}).then(r=>r.json()).catch(()=>({}));if(!j.error)return j;await sleep(4000+i*3000)}return {error:'retry_exhausted'}};
const l=await q({entity:'PermitLocality',query:{},limit:8,sort:'-created_date'});
const rows=l.items||l.data||l.results||[];
console.log('rows:',rows.length, l.error||'');
const withOffices=rows.find(r=>(r.offices||[]).length>0)||rows[0];
if(!withOffices){console.log(JSON.stringify(l).slice(0,400));process.exit(0)}
console.log('=== LIVE PermitLocality:',withOffices.name,'/',withOffices.state,'===');
const loc={name:withOffices.name,state:withOffices.state,jurisdiction_profile_id:withOffices.jurisdiction_profile_id,governing_body:withOffices.governing_body,contact_phone:withOffices.contact_phone,contact_email:withOffices.contact_email,contact_website:withOffices.contact_website,contact_address:withOffices.contact_address,offices_count:(withOffices.offices||[]).length,offices:withOffices.offices};
console.log(JSON.stringify(loc,null,1).slice(0,5000));
const p=await q({entity:'JurisdictionProfile',query:{},limit:6,sort:'-created_date'});
const prow=(p.items||p.data||[]).find(r=>r.office_research)||(p.items||[])[0];
if(prow){console.log('=== Profile.office_research:',prow.name,'===');console.log(JSON.stringify(prow.office_research,null,1).slice(0,2500))}
