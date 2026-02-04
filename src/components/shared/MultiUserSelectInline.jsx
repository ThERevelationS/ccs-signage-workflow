import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, X, Check, Users } from "lucide-react";

export default function MultiUserSelectInline({ 
  users = [], 
  selectedUsers = [], 
  onSelectionChange, 
  disabled = false,
  placeholder = "Assign...",
  className = ""
}) {
  const [open, setOpen] = useState(false);

  // Normalize selectedUsers to always be an array
  const normalizedSelected = Array.isArray(selectedUsers) ? selectedUsers : (selectedUsers ? [selectedUsers] : []);

  const toggleUser = (userName) => {
    if (normalizedSelected.includes(userName)) {
      onSelectionChange(normalizedSelected.filter(u => u !== userName));
    } else {
      onSelectionChange([...normalizedSelected, userName]);
    }
  };

  const displayText = normalizedSelected.length === 0 
    ? placeholder
    : normalizedSelected.length === 1
      ? normalizedSelected[0].split(' ')[0]
      : `${normalizedSelected.length} users`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button 
          className={`h-5 text-xs px-1 flex items-center gap-1 border rounded hover:bg-gray-50 min-w-[80px] max-w-[120px] ${className}`}
        >
          {normalizedSelected.length > 1 && <Users className="w-3 h-3 text-purple-500 flex-shrink-0" />}
          <span className="truncate flex-1 text-left">{displayText}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="text-xs font-medium mb-2">Assign to Users</div>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {users.map(user => {
            const userName = user.full_name || user.email;
            const isSelected = normalizedSelected.includes(userName);
            return (
              <div 
                key={user.id || user.email} 
                className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded cursor-pointer"
                onClick={() => toggleUser(userName)}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="text-sm">{userName}</span>
              </div>
            );
          })}
        </div>
        {normalizedSelected.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="text-xs text-gray-500 mb-1">Selected ({normalizedSelected.length}):</div>
            <div className="flex flex-wrap gap-1">
              {normalizedSelected.map(user => (
                <Badge key={user} variant="secondary" className="text-xs py-0 px-1.5 gap-1">
                  {user.split(' ')[0]}
                  <button onClick={(e) => { e.stopPropagation(); toggleUser(user); }}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}