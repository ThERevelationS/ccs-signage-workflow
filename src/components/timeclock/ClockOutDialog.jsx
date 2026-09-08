import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Trash2, Clock, Coffee, Briefcase, Home, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const WorkOrder = base44.entities.WorkOrder;

const INHOUSE_TASKS = [
  "Shop Cleaning",
  "Equipment Maintenance",
  "Inventory Management",
  "Training",
  "Administrative Work",
  "Safety Meeting",
  "Tool Organization",
  "Material Prep",
  "Vehicle Maintenance",
  "Other"
];

export default function ClockOutDialog({ isOpen, onClose, timeEntry, onClockOut }) {
  const [lunchMinutes, setLunchMinutes] = useState("");
  const [jobAllocations, setJobAllocations] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [totalAllocatedHours, setTotalAllocatedHours] = useState(0);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");

  // Calculate total working hours
  const clockInTime = timeEntry ? new Date(timeEntry.clock_in) : new Date();
  const clockOutTime = new Date();
  const totalMinutesWorked = Math.floor((clockOutTime - clockInTime) / (1000 * 60));
  const lunchMins = lunchMinutes === "" ? 0 : parseInt(lunchMinutes) || 0;
  const workableMinutes = totalMinutesWorked - lunchMins;
  const workableHours = Math.max(0, workableMinutes / 60);
  
  const lunchEntered = lunchMinutes !== "" && lunchMinutes !== null;
  const jobsEntered = jobAllocations.length > 0 && jobAllocations.every(j => (j.minutes || 0) > 0);

  // Calculate total allocated minutes
  const totalAllocatedMinutes = jobAllocations.reduce((sum, job) => sum + (parseInt(job.minutes) || 0), 0);
  // workableMinutes already has lunch subtracted, so don't subtract again
  const remainingMinutes = workableMinutes - totalAllocatedMinutes;

  useEffect(() => {
    const totalMins = jobAllocations.reduce((sum, job) => sum + (parseInt(job.minutes) || 0), 0);
    setTotalAllocatedHours(totalMins / 60);
  }, [jobAllocations]);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchWorkOrders();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const searchWorkOrders = async () => {
    setIsSearching(true);
    try {
      const allWorkOrders = await loadAllEntityRows({
        entity: WorkOrder,
        query: { completed: false, deleted: { $ne: true } },
        sort: "created_date",
        label: "Clock Out Work Orders",
      });
      const search = searchTerm.toLowerCase();
      const filtered = allWorkOrders.filter(wo => {
        const searchable = [wo.title, wo.client_name, wo.description].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(search);
      });
      setSearchResults(filtered.slice(0, 20));
    } catch (err) {
      console.error("Search error:", err);
    }
    setIsSearching(false);
  };

  const addJobAllocation = (workOrder) => {
    if (jobAllocations.find(j => j.work_order_id === workOrder.id)) {
      return; // Already added
    }
    setJobAllocations([...jobAllocations, {
      work_order_id: workOrder.id,
      work_order_title: workOrder.title,
      client_name: workOrder.client_name,
      hours: 0,
      minutes: 0,
      is_inhouse: false,
      inhouse_task: ""
    }]);
    setSearchTerm("");
    setShowSearch(false);
  };

  const addInhouseAllocation = () => {
    setJobAllocations([...jobAllocations, {
      work_order_id: `inhouse_${Date.now()}`,
      work_order_title: "In House Projects",
      client_name: "Internal",
      hours: 0,
      minutes: 0,
      is_inhouse: true,
      inhouse_task: ""
    }]);
  };

  const updateAllocation = (index, field, value) => {
    const updated = [...jobAllocations];
    updated[index][field] = value;
    setJobAllocations(updated);
  };

  const removeAllocation = (index) => {
    setJobAllocations(jobAllocations.filter((_, i) => i !== index));
  };

  const handleClockOut = () => {
    setError("");

    // Validate lunch is entered
    if (lunchMinutes === "" || lunchMinutes === null) {
      setError("Please enter your lunch break time");
      return;
    }

    // Validate lunch
    if (lunchMins < 0) {
      setError("Lunch break cannot be negative");
      return;
    }

    // Validate allocations
    if (jobAllocations.length === 0) {
      setError("Please add at least one job allocation");
      return;
    }

    // Validate total minutes match (allow 5 min tolerance)
    // workableMinutes already has lunch subtracted
    const diff = Math.abs(totalAllocatedMinutes - workableMinutes);
    if (diff > 5) {
      setError(`All time must be allocated. You have ${formatDuration(remainingMinutes)} remaining.`);
      return;
    }

    // Validate in-house tasks have a task selected
    for (const job of jobAllocations) {
      if (job.is_inhouse && !job.inhouse_task) {
        setError("Please select a task for all In House Projects");
        return;
      }
      if (!job.minutes || job.minutes <= 0) {
        setError("All job allocations must have minutes greater than 0");
        return;
      }
    }

    onClockOut({
      lunchMinutes: lunchMins,
      jobAllocations,
      totalHours: workableHours,
      clockOutTime: clockOutTime.toISOString(),
      notes: notes.trim()
    });
  };

  const formatTime = (date) => format(date, "h:mm a");
  const formatDuration = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };



  return (
    <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent className="clay-card border-none max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-600" />
            Clock Out
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Time Summary */}
          <div className="clay-card p-4 bg-blue-50">
            <h3 className="font-semibold mb-3">Time Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">Clock In</p>
                <p className="text-lg font-bold text-green-600">{formatTime(clockInTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Clock Out</p>
                <p className="text-lg font-bold text-red-600">{formatTime(clockOutTime)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Total Time</p>
                <p className="text-lg font-bold text-blue-600">{formatDuration(totalMinutesWorked)}</p>
              </div>
            </div>
          </div>

          {/* Lunch Break */}
          <div className={`clay-card p-4 ${!lunchEntered ? 'border-2 border-red-400' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <Coffee className="w-4 h-4 text-amber-600" />
              <Label className={`font-semibold ${!lunchEntered ? 'text-red-600' : ''}`}>
                Lunch Break (minutes) <span className="text-red-500">*</span>
              </Label>
            </div>
            <Input
              type="number"
              min="0"
              max="120"
              value={lunchMinutes}
              onChange={(e) => setLunchMinutes(e.target.value)}
              placeholder="Enter minutes..."
              className={`w-32 ${!lunchEntered ? 'border-red-400 text-red-600 placeholder:text-red-400' : ''}`}
            />
            <p className="text-xs text-gray-500 mt-2">
              Workable hours after lunch: <span className="font-bold text-blue-600">{lunchEntered ? workableHours.toFixed(2) : '--'} hrs</span>
            </p>
          </div>

          {/* Job Allocations */}
          <div className={`clay-card p-4 ${!jobsEntered ? 'border-2 border-red-400' : ''}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-600" />
                <Label className={`font-semibold ${!jobsEntered ? 'text-red-600' : ''}`}>
                  Job Time Allocations <span className="text-red-500">*</span>
                </Label>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addInhouseAllocation}
                  className="h-8 gap-1"
                >
                  <Home className="w-3 h-3" />
                  In House
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowSearch(true)}
                  className="h-8 gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Job
                </Button>
              </div>
            </div>

            {/* Search Panel */}
            {showSearch && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search by client or project name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                {searchTerm.length >= 2 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {isSearching ? (
                      <p className="text-sm text-gray-500 text-center py-2">Searching...</p>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-2">No results found</p>
                    ) : (
                      searchResults.map(wo => (
                        <div
                          key={wo.id}
                          onClick={() => addJobAllocation(wo)}
                          className="p-2 bg-white rounded cursor-pointer hover:bg-blue-50 border"
                        >
                          <p className="font-medium text-sm">{wo.client_name}</p>
                          <p className="text-xs text-gray-500">{wo.title}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {setShowSearch(false); setSearchTerm("");}}
                  className="mt-2"
                >
                  Cancel
                </Button>
              </div>
            )}

            {/* Allocations List */}
            <div className="space-y-3">
              {jobAllocations.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No jobs added. Click "Add Job" to allocate time.
                </p>
              ) : (
                jobAllocations.map((job, index) => (
                  <div key={index} className="p-3 bg-white rounded-lg border">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {job.is_inhouse ? (
                            <span className="flex items-center gap-1">
                              <Home className="w-3 h-3 text-amber-600" />
                              In House Projects
                            </span>
                          ) : (
                            job.client_name
                          )}
                        </p>
                        {!job.is_inhouse && (
                          <p className="text-xs text-gray-500">{job.work_order_title}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAllocation(index)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>

                    {job.is_inhouse && (
                      <div className="mt-2">
                        <Select
                          value={job.inhouse_task}
                          onValueChange={(val) => updateAllocation(index, "inhouse_task", val)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select task..." />
                          </SelectTrigger>
                          <SelectContent>
                            {INHOUSE_TASKS.map(task => (
                              <SelectItem key={task} value={task}>{task}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Label className={`text-xs ${!job.minutes || job.minutes <= 0 ? 'text-red-600' : ''}`}>Time:</Label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          value={job.minutes ? Math.floor(job.minutes / 60) : ""}
                          onChange={(e) => {
                            const hrs = parseInt(e.target.value) || 0;
                            const currentMins = job.minutes ? job.minutes % 60 : 0;
                            let totalMins = hrs * 60 + currentMins;
                            const otherAllocations = jobAllocations.reduce((sum, j, i) => i !== index ? sum + (parseInt(j.minutes) || 0) : sum, 0);
                            // workableMinutes already has lunch subtracted
                            const maxAllowed = Math.max(0, workableMinutes - otherAllocations);
                            if (totalMins > maxAllowed) totalMins = maxAllowed;
                            const updated = [...jobAllocations];
                            updated[index] = { ...updated[index], minutes: totalMins, hours: totalMins / 60 };
                            setJobAllocations(updated);
                          }}
                          placeholder="0"
                          className={`w-16 h-8 text-center ${!job.minutes || job.minutes <= 0 ? 'border-red-400 text-red-600' : ''}`}
                        />
                        <span className="text-xs text-gray-500">hrs</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="59"
                          step="5"
                          value={job.minutes ? job.minutes % 60 : ""}
                          onChange={(e) => {
                            const mins = Math.min(59, parseInt(e.target.value) || 0);
                            const currentHrs = job.minutes ? Math.floor(job.minutes / 60) : 0;
                            let totalMins = currentHrs * 60 + mins;
                            const otherAllocations = jobAllocations.reduce((sum, j, i) => i !== index ? sum + (parseInt(j.minutes) || 0) : sum, 0);
                            // workableMinutes already has lunch subtracted
                            const maxAllowed = Math.max(0, workableMinutes - otherAllocations);
                            if (totalMins > maxAllowed) totalMins = maxAllowed;
                            const updated = [...jobAllocations];
                            updated[index] = { ...updated[index], minutes: totalMins, hours: totalMins / 60 };
                            setJobAllocations(updated);
                          }}
                          placeholder="0"
                          className={`w-16 h-8 text-center ${!job.minutes || job.minutes <= 0 ? 'border-red-400 text-red-600' : ''}`}
                        />
                        <span className="text-xs text-gray-500">min</span>
                      </div>
                      <span className="text-xs text-gray-400 ml-2">({((job.minutes || 0) / 60).toFixed(2)} hrs total)</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Allocation Summary */}
            {jobAllocations.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span>Workable Time (after lunch):</span>
                  <span className="font-bold">{formatDuration(workableMinutes)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Total Allocated:</span>
                  <span className={`font-bold ${Math.abs(remainingMinutes) <= 5 ? 'text-green-600' : 'text-orange-600'}`}>
                    {formatDuration(totalAllocatedMinutes)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Remaining:</span>
                  <span className={`font-bold ${remainingMinutes < 0 ? 'text-red-600' : remainingMinutes > 5 ? 'text-orange-600' : 'text-green-600'}`}>
                    {formatDuration(Math.abs(remainingMinutes))}{remainingMinutes < 0 ? ' over' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes for Admin */}
          <div className="clay-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-blue-600" />
              <Label className="font-semibold">Notes for Admin (Optional)</Label>
            </div>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about your work day that you'd like admin to see..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleClockOut} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
              <Clock className="w-4 h-4 mr-2" />
              Clock Out
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}