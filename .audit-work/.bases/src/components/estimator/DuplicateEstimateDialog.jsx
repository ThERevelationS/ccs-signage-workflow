import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hash, FilePlus2 } from "lucide-react";

// Lets the user choose how a duplicated estimate is numbered before the copy is made.
export default function DuplicateEstimateDialog({ open, onOpenChange, estimateNumber = "", onChoose, busy = false }) {
  const number = String(estimateNumber || "").trim();
  const options = [
    {
      key: "new",
      icon: FilePlus2,
      title: "Clone as new estimate number",
      detail: "The copy starts with a blank estimate number for you to assign.",
    },
    {
      key: "same",
      icon: Hash,
      title: number ? `Clone into same number (${number})` : "Clone into same number",
      detail: number ? "The copy keeps this estimate's number so both file together." : "This estimate has no number yet.",
      disabled: !number,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate estimate</DialogTitle>
          <DialogDescription>The copy is created as a new draft. Choose how it should be numbered.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {options.map(({ key, icon: Icon, title, detail, disabled }) => (
            <button
              key={key}
              type="button"
              disabled={busy || disabled}
              onClick={() => onChoose(key)}
              className="w-full min-h-[48px] text-left border border-gray-200 rounded-md px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-[13px] font-semibold text-gray-900">{title}</span>
                <span className="block text-[12px] text-gray-500">{detail}</span>
              </span>
            </button>
          ))}
        </div>
        {busy && <p className="text-[12px] text-gray-500" aria-live="polite">Creating the copy…</p>}
      </DialogContent>
    </Dialog>
  );
}