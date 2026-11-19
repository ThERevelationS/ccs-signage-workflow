import base64
handler = '''  const attachFileToItem = async (index, file) => {
    if (!file) return;
    try {
      const up = await base44.integrations.Core.UploadFile({ file });
      const url = up?.file_url || "";
      if (url) updateItem(index, "file_url", url);
      const dims = await extractLaserDims(file);
      if (dims && (dims.w > 0 || dims.h > 0)) {
        updateItem(index, "length", dims.w);
        updateItem(index, "width", dims.h);
        window.alert("Attached file - extracted " + dims.w + '" x ' + dims.h + '" into length/width.');
      } else {
        window.alert("File attached (no readable dimensions - length/width left as entered).");
      }
    } catch (e) { window.alert(e?.message || "Attach failed."); }
  };

  const removeItem = (index) => {'''
script = '''src = open("src/pages/LaserEstimator.jsx", encoding="utf-8").read()
if "attachFileToItem" not in src:
    src = src.replace("  const removeItem = (index) => {", %r, 1)
old_btn = \'<Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">\'
new_btn = \'<label title="Attach a DXF/SVG cut file - extracts width x height into length/width" className="inline-flex items-center gap-1 h-[27px] px-2 rounded border border-sky-300 bg-sky-50 text-[9px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">{item.file_url ? "Re-attach" : "Attach"}<input type="file" accept=".dxf,.svg,.dwg,.txt" className="hidden" onChange={(e) => attachFileToItem(index, e.target.files?.[0])} /></label>\' + old_btn
if old_btn in src:
    src = src.replace(old_btn, new_btn, 1)
open("src/pages/LaserEstimator.jsx", "w", encoding="utf-8", newline="\n").write(src)
print("inserted:", "attachFileToItem" in src)
''' % handler
print(base64.b64encode(script.encode()).decode())
