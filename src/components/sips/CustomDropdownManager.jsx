import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowUp, ArrowDown, Trash2, Plus, Save } from "lucide-react";

const GlobalSettings = base44.entities.GlobalSettings;

export default function CustomDropdownManager({ isOpen, onClose, dropdownKey }) {
  const [options, setOptions] = useState([]);
  const [newOption, setNewOption] = useState("");
  const [editingIndex, setEditingIndex] = useState(null);

  useEffect(() => {
    if (isOpen && dropdownKey) {
      loadOptions();
    }
  }, [isOpen, dropdownKey]);

  const loadOptions = async () => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: `dropdown_${dropdownKey}` });
      if (settings.length > 0) {
        setOptions(settings[0].setting_value?.items || []);
      } else {
        setOptions([]);
      }
    } catch (error) {
      console.error("Error loading dropdown options:", error);
    }
  };

  const saveOptions = async (newOptions) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: `dropdown_${dropdownKey}` });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: { items: newOptions } });
      } else {
        await GlobalSettings.create({ 
          setting_key: `dropdown_${dropdownKey}`, 
          setting_value: { items: newOptions } 
        });
      }
      setOptions(newOptions);
    } catch (error) {
      console.error("Error saving dropdown options:", error);
    }
  };

  const addOption = () => {
    if (!newOption.trim()) return;
    const updated = [...options, newOption.trim()];
    saveOptions(updated);
    setNewOption("");
  };

  const updateOption = (index, value) => {
    const updated = options.map((opt, i) => i === index ? value : opt);
    saveOptions(updated);
    setEditingIndex(null);
  };

  const deleteOption = (index) => {
    const updated = options.filter((_, i) => i !== index);
    saveOptions(updated);
  };

  const moveOption = (index, direction) => {
    const updated = [...options];
    if (direction === 'up' && index > 0) {
      [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
    } else if (direction === 'down' && index < updated.length - 1) {
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    }
    saveOptions(updated);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
      <div className="clay-card w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b">
          <h3 className="font-bold text-lg">Edit Dropdown Options</h3>
          <p className="text-xs text-gray-500 mt-1">Key: {dropdownKey || "New dropdown"}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex gap-2">
            <Input
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              placeholder="Add option..."
              onKeyDown={(e) => e.key === 'Enter' && addOption()}
            />
            <Button onClick={addOption} size="sm">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border">
                <div className="flex flex-col">
                  <button onClick={() => moveOption(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button onClick={() => moveOption(index, 'down')} disabled={index === options.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>

                {editingIndex === index ? (
                  <Input
                    value={option}
                    onChange={(e) => {
                      const updated = [...options];
                      updated[index] = e.target.value;
                      setOptions(updated);
                    }}
                    onBlur={() => updateOption(index, options[index])}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateOption(index, options[index]);
                      if (e.key === 'Escape') setEditingIndex(null);
                    }}
                    autoFocus
                    className="flex-1 h-7"
                  />
                ) : (
                  <span className="flex-1" onClick={() => setEditingIndex(index)}>{option}</span>
                )}

                <button onClick={() => deleteOption(index)} className="p-1">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <Button onClick={onClose}>
            <Save className="w-4 h-4 mr-2" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}