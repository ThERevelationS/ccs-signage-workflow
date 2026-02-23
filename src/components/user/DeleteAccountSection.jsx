import React, { useState } from "react";
import { Trash2, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DeleteAccountSection({ userData }) {
  const [step, setStep] = useState(0); // 0=idle, 1=confirm, 2=type-confirm
  const [confirmText, setConfirmText] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const expectedText = "DELETE";

  const handleFinalConfirm = () => {
    if (confirmText.trim().toUpperCase() !== expectedText) return;
    setSubmitted(true);
    setStep(0);
    setConfirmText("");
  };

  if (submitted) {
    return (
      <div className="mt-6 clay-card p-6 border border-red-100">
        <div className="flex items-center gap-2 text-green-700">
          <AlertCircle className="w-5 h-5" />
          <p className="text-sm font-medium">Account deletion request submitted. An admin will process it shortly.</p>
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
        Permanently remove your account and all associated data. This action cannot be undone.
      </p>

      {step === 0 && (
        <Button
          variant="outline"
          className="border-red-300 text-red-600 hover:bg-red-50"
          onClick={() => setStep(1)}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Request Account Deletion
        </Button>
      )}

      {step === 1 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-red-700 text-sm">Are you sure?</p>
              <p className="text-xs text-red-600 mt-1">
                This will submit a deletion request for <strong>{userData?.email}</strong>. 
                An admin will permanently remove your account and all your data.
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
              disabled={confirmText.trim().toUpperCase() !== expectedText}
              onClick={handleFinalConfirm}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Submit Deletion Request
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