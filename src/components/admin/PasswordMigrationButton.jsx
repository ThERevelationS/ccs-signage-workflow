import { useState } from "react";
import { migrateCredentials } from "@/functions/migrateCredentials";
import { Button } from "@/components/ui/button";
import { Loader2, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";

export default function PasswordMigrationButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!window.confirm("This will convert any legacy plaintext Time Clock passwords to bcrypt hashes in the current AuthorizedEmail credential field. It will not move or clear active login credentials. Continue?")) return;
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
          <h4 className="font-medium text-gray-800">Legacy Password Hash Upgrade</h4>
          <p className="text-sm text-gray-600">One-time safety tool: convert any legacy plaintext Time Clock passwords to bcrypt without moving or clearing the active login credential.</p>
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
          <><KeyRound className="w-4 h-4 mr-2" /> Hash Legacy Passwords</>
        )}
      </Button>

      {result && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-green-900">
            <p className="font-medium">Password hash upgrade complete!</p>
            <p>Converted to bcrypt: {result.migrated} · Already safe/empty: {result.skipped}</p>
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