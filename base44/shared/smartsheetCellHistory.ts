// Shared token-wide budget: cell history costs more than a normal sheet read.
export async function reserveCellHistoryRequest(base44) {
  const entity = base44.asServiceRole.entities.GlobalSettings;
  const key = 'smartsheetCellHistoryRequestBudget';
  let rows = (await entity.filter({setting_key:key},{limit:2})).items;
  if (!rows.length) { await entity.create({setting_key:key,setting_value:{window:0,count:0}}); rows=(await entity.filter({setting_key:key},{limit:2})).items; }
  if (rows.length !== 1) throw new Error('Cell-history budget requires review. No timestamp was guessed.');
  for (let attempt=0;attempt<3;attempt++) {
    const current=attempt ? await entity.get(rows[0].id) : rows[0];
    const now=Date.now(), previous=current.setting_value || {};
    const sameWindow=now-Number(previous.window)<61000;
    const count=sameWindow?Number(previous.count)||0:0;
    if(count>=25) throw Object.assign(new Error('Cell-history request budget reached. Values are preserved for review; try again in a minute.'),{status:429});
    const result=await entity.updateMany({id:current.id,updated_date:current.updated_date},{$set:{setting_value:{window:sameWindow?previous.window:now,count:count+1}}});
    if(result?.updated===1)return;
  }
  throw new Error('Cell-history budget changed concurrently; no timestamp was guessed.');
}
export async function readRemoteFieldHistory(base44, get, sheet, row, column, page=1) {
  if (![sheet,row,column].every(v=>/^\d+$/.test(String(v)))) throw new Error('Invalid permanent field link.');
  await reserveCellHistoryRequest(base44);
  const result=await get(`/sheets/${sheet}/rows/${row}/columns/${column}/history?pageSize=25&page=${page}`);
  const body=result?.body || result;
  if(!Array.isArray(body?.data))throw new Error('Smartsheet cell history was not returned.');
  return body;
}