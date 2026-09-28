import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CustomAssigneeDialog from "@/components/sales/CustomAssigneeDialog";
import { eligibleTaskAssignees, resolveSmartsheetTaskAssignee } from "@/components/admin/smartsheetTaskAssigneeModel";

export default function TaskAssigneeSelect({ value = "", users = [], disabled = false, onChange, className = "h-11", context = "this opportunity" }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customBaseline, setCustomBaseline] = useState("");
  const eligible = eligibleTaskAssignees(users);
  const names = [...new Set(eligible.map((user) => user.full_name))];
  const resolvedValue = value ? resolveSmartsheetTaskAssignee(value, users) : { state: "blank", name: "" };
  const selectedName = resolvedValue.name || value;
  const options = selectedName && !names.includes(selectedName) ? [selectedName, ...names] : names;
  const choose = (next) => {
    if (disabled) return;
    if (next === "custom") { setCustomBaseline(value); setCustomOpen(true); }
    else onChange(next === "none" ? "" : options[Number(next.slice(5))]);
  };
  return <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
    <Select value={selectedName ? `name:${options.indexOf(selectedName)}` : "none"} onValueChange={choose} disabled={disabled}>
      <SelectTrigger className={className} aria-label={`Task assigned to for ${context}`}><SelectValue>{selectedName || "Unassigned"}</SelectValue></SelectTrigger>
      <SelectContent>
        <SelectItem value="none" className="min-h-11">Unassigned</SelectItem>
        {options.map((name, index) => <SelectItem key={name} value={`name:${index}`} className="min-h-11">{name}{!names.includes(name) ? " (custom / legacy)" : ""}</SelectItem>)}
        <SelectItem value="custom" className="min-h-11">Type a custom name…</SelectItem>
      </SelectContent>
    </Select>
    {customOpen && <CustomAssigneeDialog disabled={disabled} onClose={() => setCustomOpen(false)} onConfirm={async (name) => {
      if (disabled) throw new Error("This opportunity is no longer editable.");
      if (value !== customBaseline) throw new Error("The assignment changed while this popup was open. Cancel and review the current name before trying again.");
      const match = resolveSmartsheetTaskAssignee(name, users);
      if (match.state === "ambiguous") throw new Error("Several users match this name. Select a full name from the list.");
      await onChange(match.name || name);
    }} />}
  </div>;
}