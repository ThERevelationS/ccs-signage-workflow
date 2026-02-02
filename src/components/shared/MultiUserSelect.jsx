import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, X } from "lucide-react";

export default function MultiUserSelect({ 
  users, 
  selectedUsers = [], 
  onSelectionChange, 
  excludeUser = null,
  placeholder = "Add assignees",
  compact = false
}) {
  const [open, setOpen] = useState(false);

  const filteredUsers = excludeUser 
    ? users.filter(u => (u.full_name || u.email) !== excludeUser)
    : users;

  const toggleUser = (userName) => {
    if (selectedUsers.includes(userName)) {
      onSelectionChange(selectedUsers.filter(u => u !== userName));
    } else {
      onSelectionChange([...selectedUsers, userName]);
    }
  };

  const removeUser = (userName) => {
    onSelectionChange(selectedUsers.filter(u => u !== userName));
  };

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1">
            <UserPlus className="w-3 h-3" />
            {selectedUsers.length > 0 && <span>+{selectedUsers.length}</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="text-xs font-medium mb-2">Additional Assignees</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredUsers.map(user => {
              const userName = user.full_name || user.email;
              const isSelected = selectedUsers.includes(userName);
              return (
                <div 
                  key={user.id} 
                  className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded cursor-pointer"
                  onClick={() => toggleUser(userName)}
                >
                  <Checkbox checked={isSelected} />
                  <span className="text-sm">{userName}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {selectedUsers.map(user => (
          <Badge key={user} variant="secondary" className="text-xs py-0.5 px-2 gap-1">
            {user.split(' ')[0]}
            <button onClick={() => removeUser(user)} className="ml-1">
              <X className="w-2.5 h-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full justify-start">
            <UserPlus className="w-3 h-3" />
            {placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="text-xs font-medium mb-2">Select Additional People</div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredUsers.map(user => {
              const userName = user.full_name || user.email;
              const isSelected = selectedUsers.includes(userName);
              return (
                <div 
                  key={user.id} 
                  className="flex items-center gap-2 p-1.5 hover:bg-gray-100 rounded cursor-pointer"
                  onClick={() => toggleUser(userName)}
                >
                  <Checkbox checked={isSelected} />
                  <span className="text-sm">{userName}</span>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}