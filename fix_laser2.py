src = open("src/pages/LaserEstimator.jsx", encoding="utf-8").read()
handler = '''  // File attach + dimension extraction (#92): upload the part's vector file,
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
        window.alert(`Attached file — extracted ${dims.w}" x ${dims.h}" into length/width.`);
      } else {
        window.alert("File attached (no readable dimensions - length/width left as entered).");
      }
    } catch (e) { window.alert(e?.message || "Attach failed."); }
  };

  const removeItem = (index) => {'''
src = src.replace("  const removeItem = (index) => {", handler, 1)
# Attach input next to the remove button on each item row.
old_btn = '<Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">'
new_btn = '''<label title="Attach a DXF/SVG cut file — extracts width x height into length/width" className="inline-flex items-center gap-1 h-[27px] px-2 rounded border border-sky-300 bg-sky-50 text-[9px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">{item.file_url ? "Re-attach" : "Attach"}<input type="file" accept=".dxf,.svg,.dwg,.txt" className="hidden" onChange={(e) => attachFileToItem(index, e.target.files?.[0])} /></label>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">'''
assert old_btn in src, "remove-btn anchor"
src = src.replace(old_btn, new_btn, 1)
open("src/pages/LaserEstimator.jsx", "w", encoding="utf-8", newline="\n").write(src)
print("inserted handler + attach input")
