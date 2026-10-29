import json

edits = []

edits.append({
    "old_text": 'import { Link } from "react-router-dom";\nimport { Settings, ArrowRight } from "lucide-react";',
    "new_text": '''import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Settings, ArrowRight, ShieldCheck, Save, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { getSessionToken, getSessionUser } from "@/components/auth/EmailGate";
import { listAuthorizedUsersAdmin, updateAuthorizedUserAdmin } from "@/components/admin/authorizedUserAdminPersistence";''',
})

edits.append({
    "old_text": '''          ))}
        </div>
      </div>
    </div>
  );
}''',
    "new_text": '''          ))}
        </div>

        <QuoteApprovalCard />
      </div>
    </div>
  );
}''',
})

card = '''
const QUOTE_APPROVAL_THRESHOLD_KEY = "quote_approval_threshold";
const DEFAULT_QUOTE_APPROVAL_THRESHOLD = 5000;

function thresholdValue(record) {
  const raw = record?.setting_value;
  const parsed = Number(raw?.threshold ?? raw?.value ?? raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_QUOTE_APPROVAL_THRESHOLD;
}

function QuoteApprovalCard() {
  const canManage = getSessionUser()?.role === "admin";
  const [loading, setLoading] = useState(true);
  const [settingRecord, setSettingRecord] = useState(null);
  const [threshold, setThreshold] = useState(String(DEFAULT_QUOTE_APPROVAL_THRESHOLD));
  const [users, setUsers] = useState([]);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [togglingUserId, setTogglingUserId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const record = await loadSingleGlobalSetting({
        entity: staffEntities.GlobalSettings,
        settingKey: QUOTE_APPROVAL_THRESHOLD_KEY,
        label: "Quote approval threshold",
      });
      setSettingRecord(record);
      setThreshold(String(thresholdValue(record)));
      if (canManage) {
        const rows = await listAuthorizedUsersAdmin({ sessionToken: getSessionToken() });
        setUsers(Array.isArray(rows) ? rows : []);
      } else {
        setUsers([]);
      }
    } catch (err) {
      setError(err?.message || "Quote approval settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveThreshold = async () => {
    const next = Number(threshold);
    if (!Number.isFinite(next) || next < 0) {
      setError("Enter a valid non-negative dollar threshold.");
      return;
    }
    setSavingThreshold(true);
    setMessage("");
    setError("");
    try {
      const response = await base44.functions.invoke("manageQuoteApprovalSettings", {
        session_token: getSessionToken(),
        action: "save_threshold",
        threshold: next,
        expected_id: settingRecord?.id || "",
        expected_updated_date: settingRecord?.updated_date || "",
      });
      const data = response?.data || response;
      if (data?.error) throw new Error(data.error);
      if (!data?.success) throw new Error("Quote approval threshold could not be verified after saving.");
      setSettingRecord(data.record || null);
      setThreshold(String(data.threshold ?? next));
      setMessage("Quote approval threshold saved.");
    } catch (err) {
      setError(err?.response?.data?.error || err?.data?.error || err?.message || "Quote approval threshold could not be saved.");
    } finally {
      setSavingThreshold(false);
    }
  };

  const toggleApprover = async (user, next) => {
    if (togglingUserId || !user?.id) return;
    setTogglingUserId(user.id);
    setMessage("");
    setError("");
    try {
      const saved = await updateAuthorizedUserAdmin({
        record: user,
        nextFields: { can_approve_quotes: next },
        sessionToken: getSessionToken(),
      });
      const confirmed = saved?.can_approve_quotes === true;
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, can_approve_quotes: confirmed } : row)));
    } catch (err) {
      setError(err?.message || "Quote approver access could not be changed.");
    } finally {
      setTogglingUserId("");
    }
  };

  return (
    <div className="bg-white px-4 py-4 border-t-4 border-lime-300">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-red-500" />
        <div className="text-xs font-bold tracking-wide text-gray-600">QUOTE APPROVAL</div>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        Quotes above this total need a recorded manager approval before they can be marked sent. Approvers may approve quotes, including their own.
      </p>

      {message && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800">{message}</div>}
      {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</div>}

      {loading ? (
        <div className="mt-3 text-[11px] text-gray-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading quote approval settings…</div>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2">
            <label className="text-[10px] font-bold tracking-wide text-gray-500">
              APPROVAL THRESHOLD ($)
              <input
                type="number"
                min="0"
                step="0.01"
                value={threshold}
                disabled={!canManage || savingThreshold}
                onChange={(event) => setThreshold(event.target.value)}
                className="mt-1 h-[32px] w-40 rounded border border-gray-300 px-2 text-[11px] font-normal text-gray-800 disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={saveThreshold}
              disabled={!canManage || savingThreshold}
              title={canManage ? "Save the quote approval threshold" : "Only an administrator can change the quote approval threshold."}
              className="h-[32px] px-3 rounded border border-lime-400 bg-lime-200 text-[11px] font-bold text-gray-900 hover:bg-lime-300 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {savingThreshold ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {savingThreshold ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-4">
            <div className="text-[10px] font-bold tracking-wide text-gray-500 mb-1.5">QUOTE APPROVERS</div>
            {!canManage && (
              <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                Only an administrator can view and change which users may approve quotes.
              </div>
            )}
            {canManage && users.length === 0 && (
              <div className="text-[10px] text-gray-400">No authorized users found.</div>
            )}
            {canManage && users.length > 0 && (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-gray-700">
                    <span className="min-w-0">
                      <span className="font-semibold text-gray-800">{user.full_name || user.email}</span>
                      {user.full_name && <span className="ml-2 text-gray-400">{user.email}</span>}
                      {user.role === "admin" && <span className="ml-2 text-[9px] font-bold tracking-wide text-gray-400">ADMIN</span>}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {togglingUserId === user.id && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                      <input
                        type="checkbox"
                        checked={user.can_approve_quotes === true}
                        disabled={togglingUserId === user.id}
                        onChange={(event) => toggleApprover(user, event.target.checked)}
                        className="w-3.5 h-3.5 accent-red-600"
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
'''

edits.append({
    "old_text": '''      </div>
    </div>
  );
}
''',
    "new_text": '''      </div>
    </div>
  );
}
''' + card,
})

with open('remote_pull/es_edits.json', 'w', encoding='utf-8') as f:
    json.dump(edits, f)
print('ok', len(edits))
