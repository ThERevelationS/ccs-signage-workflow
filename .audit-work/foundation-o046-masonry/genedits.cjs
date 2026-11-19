// Generate sandbox-edit --edits-json payloads from (remote, candidate) file pairs.
// Hunks closer than 2*CTX are merged so context windows never overlap
// (sandbox edit applies edits sequentially; overlapping windows would break).
const fs = require('fs');
const CTX = 4;
const pairs = [
  ['remote-final/src/components/masterInventory/inventoryNormalization.js',
   'candidates/src/components/masterInventory/inventoryNormalization.js',
   'inventoryNormalization'],
  ['remote-final/src/components/estimator/foundation/wallCalculator.js',
   'candidates/src/components/estimator/foundation/wallCalculator.js',
   'wallCalculator'],
  ['remote-final/src/components/estimator/foundation/FoundationWallsPanel.jsx',
   'candidates/src/components/estimator/foundation/FoundationWallsPanel.jsx',
   'FoundationWallsPanel'],
  ['remote-final/src/components/estimator/builder/partSync.js',
   'candidates/src/components/estimator/builder/partSync.js',
   'partSync'],
  ['remote-final/src/components/masterInventory/foundationFieldSchema.js',
   'candidates-rebased/src/components/masterInventory/foundationFieldSchema.js',
   'foundationFieldSchema'],
  ['remote-final/src/pages/FoundationInventory.jsx',
   'candidates-rebased/src/pages/FoundationInventory.jsx',
   'FoundationInventory'],
];

function countOcc(hay, needle){ let i=0,c=0; while((i=hay.indexOf(needle,i))!==-1){c++;i+=needle.length;} return c; }

for (const [rf, cf, name] of pairs) {
  const a = fs.readFileSync(rf,'utf8').split('\n');
  const b = fs.readFileSync(cf,'utf8').split('\n');
  const n=a.length,m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
    dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const ops=[];let i=0,j=0;
  while(i<n&&j<m){
    if(a[i]===b[j]){i++;j++;}
    else if(dp[i+1][j]>=dp[i][j+1]){ops.push({t:'d',ai:i,aline:a[i]});i++;}
    else{ops.push({t:'i',ai:i,bline:b[j]});j++;}
  }
  while(i<n){ops.push({t:'d',ai:i,aline:a[i]});i++;}
  while(j<m){ops.push({t:'i',ai:i,bline:b[j]});j++;}
  // group ops into raw hunks
  const raw=[];let cur=null;
  for(const op of ops){
    if(cur&&op.ai<=cur.endA){
      if(op.t==='d'){cur.oldLines.push(op.aline);cur.endA++;}
      else cur.newLines.push(op.bline);
    } else {
      if(cur)raw.push(cur);
      cur={startA:op.ai,endA:op.ai,oldLines:[],newLines:[]};
      if(op.t==='d'){cur.oldLines.push(op.aline);cur.endA++;}
      else cur.newLines.push(op.bline);
    }
  }
  if(cur)raw.push(cur);
  // merge hunks whose context windows overlap: next.startA-CTX <= cur.endA+CTX
  const hunks=[];
  for(const h of raw){
    const prev=hunks[hunks.length-1];
    if(prev && h.startA-CTX <= prev.endA+CTX){
      // merge: keep intervening unchanged lines inside old/new
      const gap=a.slice(prev.endA,h.startA);
      prev.oldLines=prev.oldLines.concat(gap).concat(h.oldLines);
      prev.newLines=prev.newLines.concat(gap).concat(h.newLines);
      prev.endA=h.endA;
    } else {
      hunks.push({startA:h.startA,endA:h.endA,oldLines:h.oldLines.slice(),newLines:h.newLines.slice()});
    }
  }
  const fullOld=fs.readFileSync(rf,'utf8');
  const edits=[];
  for(const h of hunks){
    const s=Math.max(0,h.startA-CTX), e=Math.min(n,h.endA+CTX);
    const oldTxt=a.slice(s,e).join('\n');
    const newTxt=a.slice(s,h.startA).concat(h.newLines).concat(a.slice(h.endA,e)).join('\n');
    const occ=countOcc(fullOld,oldTxt);
    edits.push({old_text:oldTxt,new_text:newTxt,replace_all:false,_occ:occ,_a:[s+1,e]});
  }
  for(const ed of edits){ if(ed._occ>1){ ed.replace_all=true; ed._warn='NONUNIQUE->replace_all'; } }
  fs.writeFileSync('edits-'+name+'.json',JSON.stringify(edits.map(({_occ,_a,_warn,...rest})=>_warn?{...rest,_warn}:{...rest}),null,1));
  console.log(name,':',hunks.length,'merged edits,',edits.filter(e=>e._occ>1).length,'non-unique');
  for(const ed of edits) if(ed._occ>1) console.log('   NONUNIQUE remote lines',ed._a,'occ=',ed._occ);
}
