import { CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Renders the "Completed Items" section at the bottom of ProductChecklistDialog.
 * Extracted to reduce file size.
 */
export default function ChecklistCompletedSection({ completedChecklist, dropdownConditions, users, isRegistered, updateChecklistItem, applyChecklistStatus, setShowOtherPopup, focusedNeedsInputId }) {
  if (Object.keys(completedChecklist).length === 0) return null;

  const totalCount = Object.values(completedChecklist).reduce((sum, g) =>
    sum + g.mainItems.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type)).length +
    Object.values(g.subTemplates).reduce((s, st) => s + st.filter(i => !i.parent_id && (i.type === 'checklist' || !i.type)).length, 0)
  , 0);

  return (
    <div className="mt-6 pt-4 border-t-4 border-green-300">
      <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5" />
        Completed Items ({totalCount})
      </h3>
      {Object.entries(completedChecklist)
        .filter(([, group]) => {
          const hasMain = group.mainItems.some(i => !i.parent_id && (i.type === 'checklist' || !i.type));
          const hasSub = Object.values(group.subTemplates).some(st => st.some(i => !i.parent_id && (i.type === 'checklist' || !i.type)));
          return hasMain || hasSub;
        })
        .map(([productName, group]) => (
          <div key={productName} className="border-2 border-green-200 rounded-lg p-3 bg-green-50/20 mb-3">
            <h3 className="font-bold text-green-800 flex items-center gap-2 mb-2">📦 {productName}</h3>
            {group.mainItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {group.mainItems.map(rawItem => {
                  if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                  const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                  const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
                  const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(d => ({ ...d, tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === d.id) }));
                  const displayItem = { ...item, tasks: itemTasks, details: itemDetails };
                  return (
                    <div data-sips-checklist-item-id={String(displayItem.id)} key={displayItem.id} className={`clay-card p-2 bg-green-100/70 ${focusedNeedsInputId === displayItem.id ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs px-2 py-0.5 rounded bg-green-200 text-green-700 shrink-0">Checklist</span>
                          <span className="font-medium text-sm flex-1 line-through text-gray-500 min-w-0">{displayItem.text}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                          <Select value={displayItem.approved_by || ""} onValueChange={val => updateChecklistItem(displayItem.id, { approved_by: val })} disabled={!isRegistered}>
                            <SelectTrigger className="h-8 text-xs w-full sm:w-32"><SelectValue placeholder="Answered..." /></SelectTrigger>
                            <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={displayItem.custom_dropdown_value || "select_value"} onValueChange={val => { if (val === "other") setShowOtherPopup({ itemId: displayItem.id }); else if (val !== "select_value") applyChecklistStatus(displayItem.id, val); }} disabled={!isRegistered}>
                            <SelectTrigger className="h-8 text-xs w-full sm:w-36"><SelectValue placeholder="Answer...">{displayItem.custom_dropdown_value || "Answer..."}</SelectValue></SelectTrigger>
                            <SelectContent>
                              {dropdownConditions.filter(dd => (displayItem.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}</SelectItem>)}
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
            {Object.entries(group.subTemplates).map(([stName, stItems]) => (
              <div key={stName} className="ml-0 sm:ml-4 mt-2 border-l-2 border-green-300 pl-2 sm:pl-3">
                <h4 className="text-sm font-semibold text-green-700 mb-2">🔗 {stName}</h4>
                <div className="space-y-2">
                  {stItems.map(rawItem => {
                    if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                    const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                    return (
                      <div data-sips-checklist-item-id={String(stItem.id)} key={stItem.id} className={`clay-card p-2 bg-green-100/70 ${focusedNeedsInputId === stItem.id ? 'ring-2 ring-red-400 ring-offset-2' : ''}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-200 text-green-700 shrink-0">Checklist</span>
                            <span className="text-sm flex-1 line-through text-gray-500 min-w-0">{stItem.text}</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                            <Select value={stItem.approved_by || ""} onValueChange={val => updateChecklistItem(stItem.id, { approved_by: val })} disabled={!isRegistered}>
                              <SelectTrigger className="h-8 text-xs w-full sm:w-32"><SelectValue placeholder="Answered..." /></SelectTrigger>
                              <SelectContent>{users.map(u => <SelectItem key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</SelectItem>)}</SelectContent>
                            </Select>
                            <Select value={stItem.custom_dropdown_value || "select_value"} onValueChange={val => { if (val === "other") setShowOtherPopup({ itemId: stItem.id }); else if (val !== "select_value") applyChecklistStatus(stItem.id, val); }} disabled={!isRegistered}>
                              <SelectTrigger className="h-8 text-xs w-full sm:w-36"><SelectValue placeholder="Answer...">{stItem.custom_dropdown_value || "Answer..."}</SelectValue></SelectTrigger>
                              <SelectContent>
                                {dropdownConditions.filter(dd => (stItem.dropdown_ids || []).includes(dd.id)).map(dd => <SelectItem key={dd.id} value={dd.name}>{dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}</SelectItem>)}
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