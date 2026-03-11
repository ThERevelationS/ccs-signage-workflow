const researchOne = async (jurisdiction) => {
  const request = await base44.functions.invoke('proxyResearch', {
    action: 'create',
    payload: {
      jurisdiction_name: jurisdiction.name,
      state: jurisdiction.state || "",
      city: jurisdiction.name,
      county: jurisdiction.parent_county?.name || "",
      ccs_jurisdiction_id: jurisdiction.id,
      status: 'pending',
      requested_by: 'batch_update'
    }
  });

  const maxWait = 180000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const record = await base44.functions.invoke('proxyResearch', {
      action: 'poll',
      payload: { id: request.id }
    });
    const data = record.data || record;
    if (data.status === 'completed') return true;
    if (data.status === 'failed') throw new Error(`Research failed for ${jurisdiction.name}: ${data.error}`);
  }
  throw new Error(`Timed out waiting for ${jurisdiction.name}`);
};