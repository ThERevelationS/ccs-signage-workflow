import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { 
  Clock, 
  Play, 
  Square, 
  User,
  Loader2 
} from "lucide-react";
import { format } from "date-fns";
import ClockOutDialog from "@/components/timeclock/ClockOutDialog";

const TimeEntry = base44.entities.TimeEntry;

export default function QuickClockSection({ allUsers, currentTime }) {
  const [usernameInput, setUsernameInput] = useState("");
  const [activeEntry, setActiveEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showClockOut, setShowClockOut] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [error, setError] = useState("");

  const handleUsernameSubmit = () => {
    const trimmed = usernameInput.trim().toLowerCase();
    if (!trimmed) {
      setError("Please enter a username");
      return;
    }
    const user = allUsers.find(u => u.username?.toLowerCase() === trimmed);
    if (user) {
      setSelectedUser(user);
      setError("");
      checkActiveEntry(user.email);
    } else {
      setError("Username not found");
      setSelectedUser(null);
      setActiveEntry(null);
    }
  };

  const handleClear = () => {
    setUsernameInput("");
    setSelectedUser(null);
    setActiveEntry(null);
    setError("");
  };

  const checkActiveEntry = async (email) => {
    setIsLoading(true);
    try {
      const entries = await TimeEntry.filter({ user_email: email, status: "clocked_in" });
      setActiveEntry(entries.length > 0 ? entries[0] : null);
    } catch (err) {
      console.error("Error checking active entry:", err);
    }
    setIsLoading(false);
  };

  const handleClockIn = async () => {
    if (!selectedUser) return;
    setIsLoading(true);
    try {
      const entry = await TimeEntry.create({
        user_email: selectedUser.email,
        user_name: selectedUser.full_name || selectedUser.email,
        clock_in: new Date().toISOString(),
        status: "clocked_in"
      });
      setActiveEntry(entry);
    } catch (err) {
      console.error("Clock in error:", err);
    }
    setIsLoading(false);
  };

  const handleClockOut = async (data) => {
    try {
      await TimeEntry.update(activeEntry.id, {
        clock_out: data.clockOutTime,
        lunch_minutes: data.lunchMinutes,
        total_hours: data.totalHours,
        job_allocations: data.jobAllocations,
        notes: data.notes,
        status: "clocked_out"
      });
      setActiveEntry(null);
      setShowClockOut(false);
    } catch (err) {
      console.error("Clock out error:", err);
    }
  };

  // Calculate elapsed time
  const getElapsedTime = () => {
    if (!activeEntry) return null;
    const start = new Date(activeEntry.clock_in);
    const diff = currentTime - start;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="clay-card p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-600" />
          Quick Clock In/Out
        </h2>

        {/* User Selection */}
        <div className="mb-6">
          <Label className="text-sm font-medium mb-2 block">Select Your Username</Label>
          <Select value={selectedUsername} onValueChange={setSelectedUsername}>
            <SelectTrigger className="w-full max-w-md">
              <User className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Choose your username..." />
            </SelectTrigger>
            <SelectContent>
              {usersWithUsernames.map(user => (
                <SelectItem key={user.id} value={user.username}>
                  {user.username} - {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Clock Status */}
        {selectedUsername && (
          <div className="text-center">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-purple-600 mx-auto" />
            ) : activeEntry ? (
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-medium">Clocked In</span>
                </div>
                
                <p className="text-sm text-gray-500 mb-2">
                  Since {format(new Date(activeEntry.clock_in), "h:mm a")}
                </p>
                
                <div className="text-5xl font-mono font-bold text-purple-600 mb-6">
                  {getElapsedTime()}
                </div>
                
                <Button 
                  onClick={() => setShowClockOut(true)}
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-lg gap-2"
                >
                  <Square className="w-5 h-5" />
                  Clock Out
                </Button>
              </div>
            ) : (
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-600 rounded-full mb-4">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="font-medium">Not Clocked In</span>
                </div>
                
                <p className="text-gray-500 mb-6">Ready to start your day?</p>
                
                <Button 
                  onClick={handleClockIn}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg gap-2"
                >
                  <Play className="w-5 h-5" />
                  Clock In
                </Button>
              </div>
            )}
          </div>
        )}

        {!selectedUsername && (
          <p className="text-center text-gray-500">Select your username above to clock in or out</p>
        )}
      </div>

      {showClockOut && activeEntry && (
        <ClockOutDialog
          isOpen={showClockOut}
          onClose={() => setShowClockOut(false)}
          timeEntry={activeEntry}
          onClockOut={handleClockOut}
        />
      )}
    </>
  );
}