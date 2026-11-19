const fs=require('fs');
const creds=JSON.parse(fs.readFileSync('.permit-creds.json','utf8'));
const FN='https://clay-flow-signage-suite-387da97c.base44.app/api/apps/68dfcc5e57bbbc35387da97c/functions';
let TK;
const call=(fn,body)=>fetch(FN+'/'+fn,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,session_token:TK})}).then(r=>r.json());
const rules=[
  {entered_name:'mt sterling',state:'OH',jurisdiction_name:'Mount Sterling',jurisdiction_type:'village'},
  {entered_name:'mt washington',state:'KY',jurisdiction_name:'Mount Washington',jurisdiction_type:'city'},
  {entered_name:'mt orab',state:'OH',jurisdiction_name:'Mount Orab',jurisdiction_type:'village'},
  {entered_name:'allen city',state:'KY',jurisdiction_name:'Allen',jurisdiction_type:'city'},
  {entered_name:'cave city',state:'KY',jurisdiction_name:'Cave City',jurisdiction_type:'city'},
  {entered_name:'whitley city',state:'KY',jurisdiction_name:'Whitley City',jurisdiction_type:'city'},
  {entered_name:'west chester township',state:'OH',jurisdiction_name:'West Chester Township',jurisdiction_type:'township'},
];
(async()=>{
  const t=await call('verifyLogin',{username:creds.user,password:creds.pass});TK=t.session_token||t.token;
  for(const x of rules){
    const rule={rule_type:'postal_name_map',entered_name:x.entered_name,address_key:'',state:x.state,county:'',jurisdiction_name:x.jurisdiction_name.toLowerCase(),jurisdiction_type:x.jurisdiction_type,geoid:'',source:'manual_geocode_gapfill',evidence:`Gazetteer-verified gap fill — "${x.entered_name}" resolves to "${x.jurisdiction_name}" (auto-minter missed the variant).`,created_from_address:'',active:true};
    const j=await call('staffEntityWrite',{entity:'PermitResolutionRule',op:'create',data:rule});
    console.log(j?.success?'MINTED':'FAIL',x.entered_name,'→',x.jurisdiction_name,JSON.stringify(j).slice(0,80));
    await new Promise(r=>setTimeout(r,400));
  }
})();
