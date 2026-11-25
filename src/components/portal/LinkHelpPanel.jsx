import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Ban, Mail, Phone, Send, Loader2, CheckCircle2 } from "lucide-react";

// Shown when a customer's portal link cannot open. Explains the problem in
// plain words, gives the shop's phone/email, and lets them ask for a new link
// (the request is emailed to the shop — never to the caller).
export default function LinkHelpPanel({ phone = "", email = "", brokenToken = "" }) {
  const [showForm, setShowForm] = useState(false);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const sendRequest = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await base44.functions.invoke("customerPortalAction", {
        action: "request_new_link",
        contact,
        token: brokenToken,
        page_url: window.location.href.slice(0, 300),
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Request failed.");
      setSent(true);
      setShowForm(false);
    } catch {
      setError("We couldn't send that just now. Please call or email us and we'll send a new link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <Ban className="mx-auto mb-3 h-9 w-9 text-slate-400" />
      <p className="text-lg font-semibold text-slate-900">This link is incomplete or has expired</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Portal links stop working after a while, and they break if they get cut off when copied.
        Nothing is wrong with your account — we'll gladly send you a fresh one.
      </p>

      {(phone || email) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {phone && (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Phone className="h-4 w-4 text-slate-500" />
              {phone}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Mail className="h-4 w-4 text-slate-500" />
              {email}
            </a>
          )}
        </div>
      )}

      {sent ? (
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Request sent — we'll email you a new link.
        </p>
      ) : showForm ? (
        <div className="mx-auto mt-5 max-w-sm text-left">
          <label className="text-xs font-medium text-slate-600" htmlFor="portal-link-request-contact">
            Your name, email or phone (so we can reach you)
          </label>
          <input
            id="portal-link-request-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            maxLength={200}
            placeholder="e.g. Jane at Acme — jane@acme.com"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
          {error && <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={sendRequest}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send request
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(""); }}
              className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Send className="h-4 w-4" />
          Email us for a new link
        </button>
      )}
    </div>
  );
}