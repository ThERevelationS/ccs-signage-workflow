import json
old = '                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">'
new = '''                        <label title="Attach a DXF/SVG cut file - extracts width x height into length/width" className="inline-flex items-center gap-1 h-[27px] px-2 rounded border border-sky-300 bg-sky-50 text-[9px] font-bold text-sky-700 hover:bg-sky-100 cursor-pointer">{item.file_url ? "Re-attach" : "Attach"}<input type="file" accept=".dxf,.svg,.dwg,.txt" className="hidden" onChange={(e) => attachFileToItem(index, e.target.files?.[0])} /></label>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">'''
print(json.dumps([{"old_text": old, "new_text": new}]))
