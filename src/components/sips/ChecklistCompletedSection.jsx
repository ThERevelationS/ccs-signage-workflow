import { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Renders the "Completed Items" section at the bottom of ProductChecklistDialog.
 * Extracted to reduce file size.
 */
export default function ChecklistCompletedSection({ completedChecklist, dropdownOptionsByChecklistItemId, users, isRegistered, updateChecklistItem, applyChecklistStatus, setShowOtherPopup, focusedNeedsInputId }) {
  const { renderGroups, totalCount } = useMemo(() => {
    const groups = [];
    let count = 0;
    Object.entries(completedChecklist).forEach(([productName, group]) => {
      const mainItems = group.mainItems.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type));
      const subTemplates = Object.entries(group.subTemplates).map(([stName, stItems]) => ({
        stName,
        items: stItems.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type)),
      })).filter(({ items }) => items.length > 0);
      const groupCount = mainItems.length + subTemplates.reduce((sum, entry) => sum + entry.items.length, 0);
      if (groupCount > 0) {
        groups.push({ productName, mainItems, subTemplates });
        count += groupCount;
      }
    });
    return { renderGroups: groups, totalCount: count };
  }, [completedChecklist]);

  if (renderGroups.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t-4 border-green-300">
      <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
        Completed Items ({totalCount})
      </h3>
      {renderGroups.map(({ productName, mainItems, subTemplates }) => (
          <div key={productName} className="border-2 border-green-200 rounded-lg p-3 bg-green-50/20 mb-3">
            <h3 className="font-bold text-green-800 flex items-center gap-2 mb-2 min-w-0">
              <span aria-hidden="true">📦</span>
              <span className="min-w-0 break-words">{productName}</span>
            </h3>
            {mainItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {mainItems.map(rawItem => {
                  const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                  return (
                    <div data-sips-checklist-item-id={String(item.id)} key={item.id} className={`clay-card p-2 bg-green-100/70 ${focusedNeedsInputId === item.id ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-700 shrink-0">Checklist</span>
                          <span className="font-medium text-sm flex-1 line-through text-gray-500 min-w-0 break-words">{item.text}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                          <Select value={item.approved_by || ""} onValueChange={val => updateChecklistItem(item.id, { approved_by: val })} disabled={!isRegistered}>
                            <SelectTrigger className="h-11 sm:h-8 text-xs w-full sm:w-32" aria-label={`Answered by for completed checklist item: ${item.text || "checklist item"}`}><SelectValue placeholder="Answered..." /></SelectTrigger>
                            <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={item.custom_dropdown_value || "select_value"} onValueChange={val => { if (val === "other") setShowOtherPopup({ itemId: item.id }); else if (val !== "select_value") applyChecklistStatus(item.id, val); }} disabled={!isRegistered}>
                            <SelectTrigger className="h-11 sm:h-8 text-xs w-full sm:w-36" aria-label={`Status for completed checklist item: ${item.text || "checklist item"}`}><SelectValue placeholder="Answer...">{item.custom_dropdown_value || "Answer..."}</SelectValue></SelectTrigger>
                            <SelectContent>
                              {(dropdownOptionsByChecklistItemId.get(item.id) || []).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}</SelectItem>)}
                              <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {subTemplates.map(({ stName, items: stItems }) => (
              <div key={stName} className="ml-0 sm:ml-4 mt-2 border-l-2 border-green-300 pl-2 sm:pl-3">
                <h4 className="text-sm font-semibold text-green-700 mb-2 min-w-0 break-words">
                  <span aria-hidden="true">🔗</span> {stName}
                </h4>
                <div className="space-y-2">
                  {stItems.map(rawItem => {
                    const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                    return (
                      <div data-sips-checklist-item-id={String(stItem.id)} key={stItem.id} className={`clay-card p-2 bg-green-100/70 ${focusedNeedsInputId === stItem.id ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-200 text-green-700 shrink-0">Checklist</span>
                            <span className="text-sm flex-1 line-through text-gray-500 min-w-0 break-words">{stItem.text}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                            <Select value={stItem.approved_by || ""} onValueChange={val => updateChecklistItem(stItem.id, { approved_by: val })} disabled={!isRegistered}>
                              <SelectTrigger className="h-11 sm:h-8 text-xs w-full sm:w-32" aria-label={`Answered by for completed checklist option: ${stItem.text || "checklist item"}`}><SelectValue placeholder="Answered..." /></SelectTrigger>
                              <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={stItem.custom_dropdown_value || "select_value"} onValueChange={val => { if (val === "other") setShowOtherPopup({ itemId: stItem.id }); else if (val !== "select_value") applyChecklistStatus(stItem.id, val); }} disabled={!isRegistered}>
                              <SelectTrigger className="h-11 sm:h-8 text-xs w-full sm:w-36" aria-label={`Status for completed checklist option: ${stItem.text || "checklist item"}`}><SelectValue placeholder="Answer...">{stItem.custom_dropdown_value || "Answer..."}</SelectValue></SelectTrigger>
                              <SelectContent>
                                {(dropdownOptionsByChecklistItemId.get(stItem.id) || []).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}</SelectItem>)}
                                <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}