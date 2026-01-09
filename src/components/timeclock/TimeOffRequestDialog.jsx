import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock } from "lucide-react";
import { differenceInBusinessDays } from "date-fns";

const TimeOffRequest = base44.entities.TimeOffRequest;

const REQUEST_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal Day" },
  { value: "bereavement", label: "Bereavement" },
  { value: "jury_duty", label: "Jury Duty" },
  { value: "other", label: "Other" }
];

export default function TimeOffRequestDialog({ isOpen, onClose, currentUser, onSubmit, existingRequest }) {
  const [requestType, setRequestType] = useState(existingRequest?.request_type || "");
  const [startDate, setStartDate] = useState(existingRequest?.start_date || "");
  const [endDate, setEndDate] = useState(existingRequest?.end_date || "");
  const [hoursPerDay, setHoursPerDay] = useState(existingRequest ? Math.round(existingRequest.hours_requested / (differenceInBusinessDays(new Date(existingRequest.end_date), new Date(existingRequest.start_date)) + 1)) || 8 : 8);
  const [reason, setReason] = useState(existingRequest?.reason || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (existingRequest) {
      setRequestType(existingRequest.request_type || "");
      setStartDate(existingRequest.start_date || "");
      setEndDate(existingRequest.end_date || "");
      setReason(existingRequest.reason || "");
      const days = differenceInBusinessDays(new Date(existingRequest.end_date), new Date(existingRequest.start_date)) + 1;
      setHoursPerDay(days > 0 ? Math.round(existingRequest.hours_requested / days) : 8);
    }
  }, [existingRequest]);

  const calculateHours = () => {
    if (!startDate || !endDate) return 0;
    const days = differenceInBusinessDays(new Date(endDate), new Date(startDate)) + 1;
    return Math.max(0, days * hoursPerDay);
  };

  const handleSubmit = async () => {
    setError("");

    if (!requestType) {
      setError("Please select a request type");
      return;
    }
    if (!startDate || !endDate) {
      setError("Please select start and end dates");
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError("End date must be after start date");
      return;
    }

    setIsSubmitting(true);
    try {
      if (existingRequest) {
        await TimeOffRequest.update(existingRequest.id, {
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          hours_requested: calculateHours(),
          reason
        });
      } else {
        await TimeOffRequest.create({
          user_email: currentUser?.email,
          user_name: currentUser?.full_name || currentUser?.email,
          request_type: requestType,
          start_date: startDate,
          end_date: endDate,
          hours_requested: calculateHours(),
          reason,
          status: "pending"
        });
      }
      
      if (onSubmit) onSubmit();
      onClose();
    } catch (err) {
      setError("Failed to submit request. Please try again.");
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            {existingRequest ? "Edit Time Off Request" : "Request Time Off"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Type of Time Off</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Hours Per Day</Label>
            <Input
              type="number"
              min="1"
              max="12"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(parseInt(e.target.value) || 8)}
              className="mt-1 w-24"
            />
          </div>

          {startDate && endDate && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm">
                Total Hours Requested: <span className="font-bold text-blue-600">{calculateHours()} hours</span>
              </p>
            </div>
          )}

          <div>
            <Label>Reason (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief description..."
              className="mt-1"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1">
              {isSubmitting ? "Submitting..." : "Submit Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}