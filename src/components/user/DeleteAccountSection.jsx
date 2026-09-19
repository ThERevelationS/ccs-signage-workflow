import React, { useEffect, useState } from "react";
import { Trash2, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadOwnAccountDeletionRequest,
  submitOwnAccountDeletionRequest,
} from "@/components/user/accountDeletionRequestPersistence";

export default function DeleteAccountSection({ userData, sessionToken }) {
  const [step, setStep] = useState(0); // 0=idle, 1=confirm, 2=type-confirm
  const [confirmText, setConfirmText] = useState("");
  const [deletionRequest, setDeletionRequest] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const expectedText = "DELETE";

  useEffect(() => {
    let cancelled = false;

    if (!sessionToken) {
      setDeletionRequest(null);
      setIsLoadingStatus(false);
      return undefined;
    }

    setIsLoadingStatus(true);
    setSubmitError("");
    loadOwnAccountDeletionRequest({ sessionToken })
      .then((request) => {
        if (!cancelled) setDeletionRequest(request);
      })
      .catch((error) => {
        if (!cancelled) setSubmitError(error?.message || "Could not load deletion request status.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStatus(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const handleFinalConfirm = async () => {
    if (confirmText.trim().toUpperCase() !== expectedText || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const request = await submitOwnAccountDeletionRequest({ sessionToken });
      setDeletionRequest(request);
      setStep(0);
      setConfirmText("");
    } catch (error) {
      setSubmitError(error?.message || "Could not submit the deletion request safely.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (deletionRequest?.status === "pending") {
    return (
      <div className="mt-6 clay-card p-6 border border-red-100">
        <div className="flex items-center gap-2 text-green-700">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">
            Account deletion request submitted. An admin must review it before any account action occurs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 clay-card p-6 border border-red-100">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-red-700">
        <Trash2 className="w-5 h-5" />
        Delete Account
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Request an administrative review to remove your sign-shop account. Submitting this request does not delete your account or company records.
      </p>

      {deletionRequest && deletionRequest.status !== "pending" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          A previous deletion request is marked <strong>{deletionRequest.status}</strong>. Contact an administrator before submitting another request.
        </div>
      )}

      {submitError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {step === 0 && (
        <Button
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={() => setStep(1)}
          disabled={isLoadingStatus || !sessionToken || Boolean(deletionRequest)}
        >
          {isLoadingStatus ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
          {isLoadingStatus ? "Checking Request Status..." : "Request Account Deletion"}
        </Button>
      )}

      {step === 1 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-700 text-sm">Are you sure?</p>
              <p className="text-xs text-red-600 mt-1">
                This will submit a deletion review request for <strong>{userData?.email}</strong>.
                No account or company data is deleted by this submission.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => setStep(2)}
            >
              Yes, continue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStep(0)}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
          <p className="text-sm text-red-700 font-medium">
            Type <strong>DELETE</strong> to confirm:
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE"
            className="border-red-300 focus:ring-red-400"
            autoCapitalize="characters"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={confirmText.trim().toUpperCase() !== expectedText || isSubmitting || !sessionToken}
              onClick={handleFinalConfirm}
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
              {isSubmitting ? "Submitting..." : "Submit Deletion Request"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setStep(0); setConfirmText(""); }}>
              <X className="w-4 h-4 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}