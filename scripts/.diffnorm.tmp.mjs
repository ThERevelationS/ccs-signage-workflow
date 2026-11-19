import {readFileSync} from 'node:fs';
const a=readFileSync('.remote-dialog.tmp.jsx','utf8').replace(/\r\n/g,'\n');
const b=readFileSync('src/components/permitting/LocalityPickerDialog.jsx','utf8').replace(/\r\n/g,'\n');
const al=a.split('\n'),bl=b.split('\n');
// report matching hunk regions only
let i=0,j=0,out=[];
// simple LCS-free diff: find lines in a not in expected order — cheap approach: use git-style markers
// instead: print lines from local not present near same index in remote
const aset=new Set(al.map((l,k)=>k+':'+l));
for(let k=0;k<bl.length;k++){
  const key=k+':'+bl[k];
  if(!aset.has(key))out.push('LOCAL+'+(k+1)+': '+bl[k]);
}
console.log(out.slice(0,60).join('\n'));
console.log('...total differing local lines:',out.length,'local lines:',bl.length,'remote lines:',al.length);
