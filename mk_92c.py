import json
edits = [
 # attachFileToItem: upload + extract dims + set file_url/length/width
 {"old_text": '  const removeItem = (index) => {',
  "new_text": '''  // File attach + dimension extraction (#92): upload the part's vector file,
  // store its URL on the item, and prefill length/width from a DXF/SVG bbox.
  const attachFileToItem = async (index, file) => {
    if (!file) return;
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const url = up?.file_url || "";
      if (url) updateItem(index, "file_url", url);
      const dims = await extractLaserDims(file);
      if (dims && (dims.w > 0 || dims.h > 0)) {
        updateItem(index, "length", dims.w);
        updateItem(index, "width", dims.h);
        window.alert(`Attached file — extracted ${dims.w}" × ${dims.h}" into length/width.`);
      } else {
        window.alert("File attached (no readable dimensions — length/width left as entered).");
      }
    } catch (e) { window.alert(e?.message || "Attach failed."); }
  };

  const removeItem = (index) => {'''}]
open('la92.json','w').write(json.dumps(edits))
print('wrote')
