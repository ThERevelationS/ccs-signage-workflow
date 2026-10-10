// Format checks are admission checks, not a complete document parser or authority review.
export const PERMIT_DOCUMENT_VALIDATION_METHOD = 'document-container-signature-v1';
const fail = message => { throw Object.assign(Error(message), {status:415}); };
const types = {pdf:'application/pdf',doc:'application/msword',xls:'application/vnd.ms-excel',
 docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv',txt:'text/plain'};
const starts = (bytes, signature) => signature.every((v,i)=>bytes[i]===v);
function officePackageNames(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(!starts(bytes,[0x50,0x4b,3,4])) fail('Source is not an Office ZIP package.');
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){
  if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 }
 if(end<0) fail('Office ZIP directory is missing or truncated.');
 const entries=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0 || view.getUint16(end+8,true)!==entries ||
    entries===65535 || offset===0xffffffff || size===0xffffffff || offset+size!==end)
  fail('Unsupported or inconsistent Office ZIP directory; review required.');
 const names=new Set();let pos=offset;
 for(let n=0;n<entries;n++){
  if(pos+46>end || view.getUint32(pos,true)!==0x02014b50) fail('Office ZIP directory entry is invalid.');
  const length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true);
  const next=pos+46+length+extra+comment,local=view.getUint32(pos+42,true);
  if(next>end || local+30>offset || view.getUint32(local,true)!==0x04034b50 ||
     (view.getUint16(pos+8,true)&1) || ![0,8].includes(view.getUint16(pos+10,true)))
   fail('Unsupported or invalid Office ZIP entry; review required.');
  const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+length));
  const localLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
  const localName=new TextDecoder().decode(bytes.subarray(local+30,local+30+localLength));
  if(name!==localName || local+30+localLength+localExtra+view.getUint32(pos+20,true)>offset || names.has(name))
   fail('Office ZIP entry bounds or identity are inconsistent.');
  names.add(name);pos=next;
 }
 if(pos!==end) fail('Office ZIP directory size is inconsistent.');
 return names;
}
export function validatePermitDocumentBytes(bytes,{format,contentType=''}={}) {
 format=String(format||'').toLowerCase();
 if(!(bytes instanceof Uint8Array) || !bytes.length) fail('Downloaded document is empty.');
 if(!types[format]) fail('Unsupported permit document format; review required.');
 const mime=String(contentType).split(';')[0].trim().toLowerCase();
 const prefix=new TextDecoder().decode(bytes.subarray(0,2048)).replace(/^\uFEFF/,'').trimStart();
 if(/^(?:<!doctype\s+html\b|<html\b|<head\b|<body\b|<!--[\s\S]*?<html\b)/i.test(prefix) ||
    ['text/html','application/xhtml+xml'].includes(mime))
  fail('Source returned HTML instead of a downloadable file.');
 if(format==='pdf' && !starts(bytes,[0x25,0x50,0x44,0x46,0x2d])) fail('Source is not a valid PDF.');
 if(['doc','xls'].includes(format) &&
    (bytes.length<512 || !starts(bytes,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1])))
  fail('Source has no valid legacy Office container signature; review required.');
 if(['docx','xlsx'].includes(format)){
  const names=officePackageNames(bytes);
  const main=format==='docx'?'word/document.xml':'xl/workbook.xml';
  if(!names.has('[Content_Types].xml') || !names.has('_rels/.rels') || !names.has(main))
   fail('Office package does not match the requested document format.');
 }
 if(['csv','txt'].includes(format)){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('Text document encoding requires review.');}
  if(text.includes('\0')) fail('Text document contains binary data; review required.');
 }
 return {format,mime_type:types[format],validation_method:PERMIT_DOCUMENT_VALIDATION_METHOD};
}
