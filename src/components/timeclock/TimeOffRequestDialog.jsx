import React, { useState } from "react";
import TimeQuickPick from "@/components/timeclock/TimeQuickPick";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { differenceInBusinessDays } from "date-fns";

function newRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-timeoff-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function operationStorageKey(existingRequest, currentUser) {
  return `ccs_timeclock_timeoff:${existingRequest?.id ? `edit:${existingRequest.id}` : `new:${String(currentUser?.email || "").toLowerCase()}`}`;
}

function storedOperation(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const requestId = String(parsed?.request_id || "");
    return requestId.length >= 8 && requestId.length <= 128 && parsed?.payload
      ? { request_id: requestId, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

function persistOperation(key, requestId, payload) {
  try { sessionStorage.setItem(key, JSON.stringify({ request_id: requestId, payload })); } catch {}
}

function clearOperation(key, expectedRequestId = "") {
  try {
    if (expectedRequestId) {
      const stored = storedOperation(key);
      if (!stored || stored.request_id !== expectedRequestId) return;
    }
    sessionStorage.removeItem(key);
  } catch {}
}

function shouldRetainOperation(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

const REQUEST_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick Leave" },
  { value: "personal", label: "Personal Day" },
  { value: "bereavement", label: "Bereavement" },
  { value: "jury_duty", label: "Jury Duty" },
  { value: "other", label: "Other" }
];

export default function TimeOffRequestDialog({ isOpen, onClose, currentUser, sessionToken = "", onSubmit, existingRequest }) {
  const [requestType, setRequestType] = useState(existingRequest?.request_type || "");
  const [startDate, setStartDate] = useState(existingRequest?.start_date || "");
  const [endDate, setEndDate] = useState(existingRequest?.end_date || "");
  const [hoursPerDay, setHoursPerDay] = useState(existingRequest ? Math.round(existingRequest.hours_requested / (differenceInBusinessDays(new Date(existingRequest.end_date), new Date(existingRequest.start_date)) + 1)) || 8 : 8);
  const [reason, setReason] = useState(existingRequest?.reason || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const stored = storedOperation(operationStorageKey(existingRequest, currentUser));
    const savedFields = stored?.payload || null;
    if (savedFields) {
      setRequestType(savedFields.request_type || "");
      setStartDate(savedFields.start_date || "");
      setEndDate(savedFields.end_date || "");
      setReason(savedFields.reason || "");
      const days = differenceInBusinessDays(new Date(savedFields.end_date), new Date(savedFields.start_date)) + 1;
      setHoursPerDay(days > 0 ? Math.round(Number(savedFields.hours_requested || 0) / days) : 8);
      return;
    }
    if (existingRequest) {
      setRequestType(existingRequest.request_type || "");
      setStartDate(existingRequest.start_date || "");
      setEndDate(existingRequest.end_date || "");
      setReason(existingRequest.reason || "");
      const days = differenceInBusinessDays(new Date(existingRequest.end_date), new Date(existingRequest.start_date)) + 1;
      setHoursPerDay(days > 0 ? Math.round(existingRequest.hours_requested / days) : 8);
    }
  }, [isOpen, existingRequest, currentUser]);

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

    if (!sessionToken || !currentUser?.email) {
      setError("Your signed Time Clock session is no longer available. Sign in again before submitting time off.");
      return;
    }

    const requestFields = {
      request_type: requestType,
      start_date: startDate,
      end_date: endDate,
      hours_requested: calculateHours(),
      reason: reason.trim(),
    };
    const payload = {
      action: existingRequest ? "time_off_request_update" : "time_off_request_create",
      target_email: currentUser.email,
      ...requestFields,
      ...(existingRequest ? {
        time_off_request_id: existingRequest.id,
        expected_updated_date: existingRequest.updated_date,
      } : {}),
    };
    const storageKey = operationStorageKey(existingRequest, currentUser);
    const stored = storedOperation(storageKey);
    if (stored && JSON.stringify(stored.payload) !== JSON.stringify(payload)) {
      setError("A previous time-off submission may already be saved. Retry the preserved request with its original details before changing it.");
      return;
    }
    const requestId = stored?.request_id || newRequestId();
    persistOperation(storageKey, requestId, payload);

    setIsSubmitting(true);
    try {
      const response = await base44.functions.invoke("timeClockAction", {
        ...payload,
        session_token: sessionToken,
        request_id: requestId,
      });
      const data = response?.data || response;
      if (!data?.success) {
        const actionError = new Error(data?.error || "The time-off request was not confirmed by the server.");
        actionError.retrySameRequest = data?.retry_same_request === true;
        actionError.confirmedServerResponse = true;
        throw actionError;
      }

      clearOperation(storageKey, requestId);
      if (onSubmit) await onSubmit();
      onClose();
    } catch (err) {
      console.error("Time off request save blocked:", err);
      if (!shouldRetainOperation(err)) clearOperation(storageKey, requestId);
      setError(err?.response?.data?.error || err?.message || "Failed to submit request safely. Reload your requests before trying again.");
    } finally {
      setIsSubmitting(false);
    }
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
              <TimeQuickPick
                mode="date"
                value={startDate}
                onChange={setStartDate}
                dayOffsets={[0, -1, -2, -3, -7, -14]}
                confirmLabel="Starts"
                inputId="pto-start"
              />
            </div>
            <div>
              <Label>End Date</Label>
              <TimeQuickPick
                mode="date"
                value={endDate}
                onChange={setEndDate}
                dayOffsets={[0, -1, -2, -3, -7, -14]}
                confirmLabel="Ends"
                inputId="pto-end"
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
              {isSubmitting ? "Saving..." : existingRequest ? "Update Request" : "Submit Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
