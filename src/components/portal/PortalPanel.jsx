import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Copy, Link2, Loader2, Mail, MessageSquare, Send } from "lucide-react";

export const invokePortal = async (sessionToken, body) => {
  const r = await base44.functions.invoke("customerPortalAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

export const MESSAGE_KIND_LABELS = {
  estimate_approved: "Quote approved",
  estimate_revision_requested: "Revision requested",
  payment_notice: "Payment notice",
  job_revision_requested: "Job change requested",
};

export default function PortalPanel({ sessionToken, customerId }) {
  const [thread, setThread] = useState(null);
  const [links, setLinks] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [emailed, setEmailed] = useState("");
  const replyKeyRef = useRef(crypto.randomUUID());
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await invokePortal(sessionToken, { action: "list_thread", customer_id: customerId });
      setThread(data.messages || []);
      setLinks(data.links || []);
    } catch (err) {
      setError(err?.message || "Portal data could not load.");
      setThread([]);
    }
  }, [sessionToken, customerId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [thread?.length]);

  const run = async (label, body, after) => {
    if (busy) return;
    setBusy(label);
    setError("");
    try {
      const data = await invokePortal(sessionToken, body);
      await load();
      await after?.(data);
    } catch (err) {
      setError(err?.message || "Portal action failed.");
    } finally {
      setBusy("");
    }
  };

  const customerLink = links.find((l) => l.kind === "customer" && l.usable && !l.revoked);
  const rawToken = (t) => (/^[a-f0-9]{16,128}$/i.test(String(t || "")) ? String(t) : "");
  const urlFor = (t) => (rawToken(t) ? `${window.location.origin}/customerportal?token=${encodeURIComponent(rawToken(t))}` : "");
  const portalUrl = customerLink ? urlFor(customerLink.token) : "";
  const copy = async (url, key) => { try { await navigator.clipboard.writeText(url); setCopied(key); } catch { /* clipboard unavailable */ } };
  const unread = (thread || []).filter((m) => m.author_side === "customer" && !m.read_by_staff).length;

  if (thread === null) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800">
          <MessageSquare className="h-3.5 w-3.5" />Customer portal{unread > 0 ? ` · ${unread} new` : ""}
        </h3>
        {!customerLink ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => run("link", { action: "create_link", kind: "customer", customer_id: customerId, creation_request_key: crypto.randomUUID() }, async (d) => {
            const link = d?.link;
            const url = link ? urlFor(link.token) || urlFor(d.token) : "";
            if (url) await copy(url, "new");
          })}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-2.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy === "link" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Create portal link
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            {portalUrl && (
              <button type="button" onClick={() => copy(portalUrl, "link")}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100">
                <Copy className="h-3 w-3" />{copied === "link" ? "Copied" : "Copy link"}
              </button>
            )}
            <button type="button" disabled={Boolean(busy)} onClick={() => run("email", { action: "email_link", customer_id: customerId, portal_base: window.location.origin }, (d) => { if (d?.sent_to) setEmailed(d.sent_to); })}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-blue-300 bg-white px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
              {busy === "email" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}Email link
            </button>
            <button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Revoke this customer's portal link? They will lose access immediately.")) run("revoke", { action: "revoke_link", link_id: customerLink.id }); }}
              className="inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-2.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              Revoke
            </button>
          </div>
        )}
      </div>
      {customerLink && (
        <p className="mt-1 text-[11px] text-blue-800/70">
          {customerLink.open_count > 0 ? `Opened ${customerLink.open_count}×${customerLink.last_opened_at ? ` · last ${new Date(customerLink.last_opened_at).toLocaleDateString()}` : ""}` : "Not opened yet"} · expires {customerLink.expires_at ? new Date(customerLink.expires_at).toLocaleDateString() : "never"}
          {emailed && <span className="ml-1 font-semibold text-emerald-700">· link emailed to {emailed}</span>}
        </p>
      )}

      <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-md border border-blue-100 bg-white p-2.5">
        {thread.length === 0 && <p className="py-3 text-center text-xs text-gray-400">No portal activity yet.</p>}
        {thread.map((m) => (
          <div key={m.id} className={`flex ${m.author_side === "staff" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${m.author_side === "staff" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
              {MESSAGE_KIND_LABELS[m.kind] && (
                <p className={`text-[9px] font-bold uppercase tracking-wide ${m.author_side === "staff" ? "text-blue-200" : "text-amber-700"}`}>{MESSAGE_KIND_LABELS[m.kind]}</p>
              )}
              <p className={`text-[9px] font-semibold uppercase tracking-wide ${m.author_side === "staff" ? "text-blue-200" : "text-gray-500"}`}>
                {m.author_side === "staff" ? m.author_name || "Staff" : "Customer"}{m.related_label ? ` · re: ${m.related_label}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              {m.attachment_url && (
                <a href={m.attachment_url} target="_blank" rel="noreferrer" className={`mt-0.5 inline-block text-[10px] underline ${m.author_side === "staff" ? "text-blue-100" : "text-blue-600"}`}>
                  {m.attachment_name || "Attachment"}
                </a>
              )}
              <p className={`mt-0.5 text-[9px] ${m.author_side === "staff" ? "text-blue-200" : "text-gray-400"}`}>
                {m.created_date ? new Date(m.created_date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-2 flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { run("reply", { action: "reply_message", customer_id: customerId, body: draft.trim(), creation_request_key: replyKeyRef.current }, () => { replyKeyRef.current = crypto.randomUUID(); setDraft(""); }); } }}
          placeholder={customerLink ? "Reply to the customer…" : "Create a portal link to enable replies"}
          disabled={!customerLink}
          className="h-9 flex-1 rounded-md border border-gray-300 px-2.5 text-xs disabled:bg-gray-100" />
        <button type="button" disabled={!customerLink || Boolean(busy) || !draft.trim()}
          onClick={() => run("reply", { action: "reply_message", customer_id: customerId, body: draft.trim(), creation_request_key: replyKeyRef.current }, () => { replyKeyRef.current = crypto.randomUUID(); setDraft(""); })}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {busy === "reply" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="mt-1.5 text-[11px] font-medium text-red-600">{error}</div>}
    </div>
  );
}
