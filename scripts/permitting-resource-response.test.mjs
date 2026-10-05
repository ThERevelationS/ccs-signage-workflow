import test from 'node:test';import assert from 'node:assert/strict';
import {readPermittingResourceResponse,hasClassifiedPdfResource} from '../base44/shared/permittingResourceResponse.mjs';
import {scanOfficialPermittingPages} from '../base44/shared/permittingDiscoveryScan.mjs';
import {isDownloadableResearchDocument} from '../base44/shared/jurisdictionPermittingLinkDiscovery.mjs';
const response=(body,type='application/pdf')=>new Response(body,{headers:{'content-type':type}});
test('extensionless PDF probe checks MIME and signature without retaining a full archive',async()=>{
 const r=await readPermittingResourceResponse(response('%PDF-1.7 bytes'));assert.equal(r.resource_kind,'pdf');assert.equal(r.html,undefined);
});
test('split PDF signature is accepted and remaining body is cancelled',async()=>{
 let cancelled=false;const chunks=['%P','DF-','must not be read'];const stream=new ReadableStream({pull(c){if(chunks.length)c.enqueue(new TextEncoder().encode(chunks.shift()));else c.close();},cancel(){cancelled=true;}});
 const r=await readPermittingResourceResponse(response(stream));assert.equal(r.resource_kind,'pdf');assert(cancelled);
});
test('MIME-only, truncated, octet-stream, and HTTP failure cannot create a PDF hint',async()=>{
 for(const r of [response('<html>portal</html>'),response('%PD'),response('%PDF-1.7','application/octet-stream'),new Response('%PDF-', {status:404,headers:{'content-type':'application/pdf'}})])await assert.rejects(readPermittingResourceResponse(r));
});
test('HTML stays HTML and byte limits prevent unbounded static reads',async()=>{
 assert.equal((await readPermittingResourceResponse(response('<html>Forms</html>','text/html'))).html,'<html>Forms</html>');
 await assert.rejects(readPermittingResourceResponse(response('0123456789','text/html'),{htmlMaxBytes:5}),/byte limit/);
});
test('a linked extensionless PDF becomes a bound downloadable resource',async()=>{
 const seed='https://city.gov/forms';const r=await scanOfficialPermittingPages({seedUrl:seed,fetchPage:async url=>({...await readPermittingResourceResponse(url===seed?response('<a href="/assets/sign-form">Sign Application</a>','text/html'):response('%PDF-1.7')),finalUrl:url})});
 const pdf=r.documents.find(d=>d.url.endsWith('sign-form'));assert(hasClassifiedPdfResource(pdf));assert(isDownloadableResearchDocument(pdf));
 assert.equal(r.pages[1].status,'classified_pdf');assert.equal(r.traversal_complete,true);assert.equal(r.authority_established,false);
});
test('classification is URL-bound; stale or unknown hints are not download candidates',()=>{
 const url='https://city.gov/assets/form';for(const hint of [{kind:'pdf',method:'other',source_url:url},{kind:'pdf',method:'http-mime-signature-v1',source_url:url+'old'}])assert.equal(isDownloadableResearchDocument({url,resource_classification:hint}),false);
});
test('off-host PDF redirect cannot populate a routing hint',async()=>{
 const r=await scanOfficialPermittingPages({seedUrl:'https://city.gov/forms',fetchPage:async()=>({resource_kind:'pdf',classification_method:'http-mime-signature-v1',finalUrl:'https://other.gov/form'})});assert.equal(r.success,false);assert.equal(r.documents.length,0);
});
