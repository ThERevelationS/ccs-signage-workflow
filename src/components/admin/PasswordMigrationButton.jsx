import React, { useState } from "react";
import { migrateCredentials } from "@/functions/migrateCredentials";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";

export default function PasswordMigrationButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!window.confirm("This will migrate all existing passwords to the new secure storage (bcrypt hashed) and clear the old plain password_hash field from AuthorizedEmail. Users will log in with their existing username/password. Continue?")) return;
    setRunning(true);
    setResult(null);
    setError("");
    try {
      const res = await migrateCredentials({});
      if (res?.data?.success) {
        setResult(res.data);
      } else {
        setError(res?.data?.error || "Migration failed");
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Migration failed");
    }
    setRunning(false);
  };

  return (
    <div className="clay-card p-4 border-2 border-amber-200" style={{ background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFFFF 100%)' }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-amber-100">
          <KeyRound className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h4 className="font-medium text-gray-800">Password Security Migration</h4>
          <p className="text-sm text-gray-600">One-time: hash existing passwords with bcrypt and remove them from the public user table.</p>
        </div>
      </div>

      <Button
        onClick={handleRun}
        disabled={running}
        className="clay-button border-none"
        style={{ background: 'linear-gradient(135deg, #FDE68A 0%, #FCD34D 100%)' }}
      >
        {running ? (
          <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Migrating...</>
        ) : (
          <><KeyRound className="w-4 h-4 mr-2" /> Run Password Migration</>
        )}
      </Button>

      {result && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-900">
            <p className="font-medium">Migration complete!</p>
            <p>Migrated: {result.migrated} · Skipped: {result.skipped} · Cleared old hashes: {result.cleared}</p>
            {result.errors?.length > 0 && (
              <p className="text-red-700 mt-1">{result.errors.length} errors — check console</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}
    </div>
  );
}