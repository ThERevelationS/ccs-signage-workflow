import React from "react";
import {
  ArrowLeft,
  HelpCircle,
  Undo2,
  Redo2,
  LayoutTemplate,
  BookmarkPlus,
  Copy,
  Save,
} from "lucide-react";
import { Link } from "react-router-dom";
import { money } from "./foundationCalc";

const Btn = ({ icon: Icon, label, onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="h-[28px] px-2.5 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
  >
    <Icon className="w-3.5 h-3.5 text-gray-500" />
    {label}
  </button>
);

export default function FoundationToolbar({
  title,
  subtitle,
  backTo,
  total,
  saving,
  dirty,
  autoSave,
  onToggleAutoSave,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onSaveAndExit,
  onSaveAsCopy,
  onSaveAsTemplate,
  onTemplates,
  onHelp,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm p-3 mb-3">
      <div className="flex items-center gap-3 mb-2">
        <Link
          to={backTo}
          className="h-[28px] px-2.5 flex items-center gap-1 rounded-sm border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
        <div>
          <h1 className="text-[17px] font-bold text-gray-900 leading-tight">{title}</h1>
          <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-bold text-gray-900 mr-1">Total: {money(total)}</span>
        <Btn icon={HelpCircle} label="Help" onClick={onHelp} />
        <Btn icon={Undo2} label="Undo" onClick={onUndo} disabled={!canUndo} />
        <Btn icon={Redo2} label="Redo" onClick={onRedo} disabled={!canRedo} />
        <Btn icon={LayoutTemplate} label="Templates" onClick={onTemplates} />
        <Btn icon={BookmarkPlus} label="Save as Template" onClick={onSaveAsTemplate} />
        <Btn icon={Copy} label="Save As Copy" onClick={onSaveAsCopy} />
        <button
          type="button"
          onClick={onSaveAndExit}
          disabled={saving}
          className="h-[28px] px-3 flex items-center gap-1.5 rounded-sm bg-lime-300 border border-lime-400 text-[12px] font-bold text-gray-800 hover:bg-lime-200 disabled:opacity-60"
        >
          <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save & Exit"}
        </button>

        <button
          type="button"
          onClick={onToggleAutoSave}
          className={`ml-1 w-[38px] h-[20px] rounded-full transition-colors relative ${
            autoSave ? "bg-gray-800" : "bg-gray-300"
          }`}
          title="Auto-save"
        >
          <span
            className={`absolute top-[2px] w-[16px] h-[16px] bg-white rounded-full transition-all ${
              autoSave ? "left-[20px]" : "left-[2px]"
            }`}
          />
        </button>
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          Auto-save
        </span>
        <span className="text-[11px] text-gray-400">
          {saving ? "Saving…" : dirty ? "Not yet saved" : "All changes saved"}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !dirty}
          className="h-[28px] px-3 rounded-sm border border-gray-300 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}