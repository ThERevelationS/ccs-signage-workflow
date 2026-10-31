/**
 * Permitting Intelligence — Operational Documentation
 *
 * Plain-language staff guide for the entire permitting intelligence system.
 * Accessible from Admin Settings → Permitting Docs, or directly at /PermittingDocs.
 */

import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import SourceTextEvidenceBrowser, { hasSavedPhysicalPageText } from "@/components/permitting/SourceTextEvidenceBrowser";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  BookOpen, ChevronDown, ChevronUp, ShieldCheck, FileSearch, RefreshCw,
  AlertTriangle, MapPin, Search, Sparkles, ClipboardCheck, BarChart3,
  Plus, Edit, Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { staffEntities } from "@/components/staff/staffEntities";

function DocSection({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader>
        <button type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-purple-600 flex-shrink-0" />
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 text-sm text-gray-700">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

const sourceFields = [
  "id", "jurisdiction_id", "title", "source_type", "official_url", "archived_file_url",
  "file_hash_sha256", "retrieval_timestamp", "content_status", "authority_classification",
  "verification_status", "text_extraction_state",
];

function SavedPhysicalTextAcceptance() {
  const [jurisdictions, setJurisdictions] = useState({ rows: [], loading: true, error: "" });
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [catalog, setCatalog] = useState({ rows: [], loading: false, error: "" });
  const [selectedId, setSelectedId] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    loadAllEntityRows({
      entity: staffEntities.JurisdictionProfile,
      sort: null,
      label: "Permitting text reader jurisdiction catalog",
    }).then(rows => {
      if (active) setJurisdictions({ rows, loading: false, error: "" });
    }).catch(() => {
      if (active) setJurisdictions({ rows: [], loading: false, error: "Canonical permitting jurisdictions could not be loaded." });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedId("");
    if (!jurisdictionId) {
      setCatalog({ rows: [], loading: false, error: "" });
      return () => { active = false; };
    }
    setCatalog({ rows: [], loading: true, error: "" });
    staffEntities.PermittingSourceDocument.filter({ jurisdiction_id: jurisdictionId }, {
      sort: "-retrieval_timestamp",
      limit: 200,
      fields: sourceFields,
    }).then(result => {
      if (!active) return;
      const rows = Array.isArray(result) ? result : result.items || [];
      setCatalog({ rows, loading: false, error: "" });
      setSelectedId(current => rows.some(row => row.id === current && hasSavedPhysicalPageText(row)) ? current : "");
    }).catch(() => {
      if (active) setCatalog({ rows: [], loading: false, error: "Saved source records for this jurisdiction could not be loaded." });
    });
    return () => { active = false; };
  }, [jurisdictionId, refresh]);

  const candidates = catalog.rows.filter(hasSavedPhysicalPageText);
  const selected = candidates.find(row => row.id === selectedId);
  const selectedJurisdiction = jurisdictions.rows.find(row => row.id === jurisdictionId);

  return (
    <Card className="border-blue-200">
      <CardHeader>
        <div>
          <CardTitle className="text-base">Inspect saved physical-page text</CardTitle>
          <p className="mt-1 text-sm text-gray-600">
            Read-only view using only permitting JurisdictionProfile and PermittingSourceDocument records. It does not load work orders or customer records.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {jurisdictions.loading && <p role="status">Loading canonical permitting jurisdictions…</p>}
        {jurisdictions.error && <p role="alert" className="text-sm text-red-700">{jurisdictions.error}</p>}
        {!jurisdictions.loading && !jurisdictions.error && (
          <>
            <label className="block text-sm font-medium" htmlFor="saved-locality-select">Choose the exact canonical jurisdiction</label>
            <select
              id="saved-locality-select"
              className="min-h-11 w-full rounded-md border bg-white px-3 text-sm"
              value={jurisdictionId}
              onChange={event => { setJurisdictionId(event.target.value); setSelectedId(""); }}
            >
              <option value="">Select canonical jurisdiction</option>
              {jurisdictions.rows.map(row => (
                <option key={row.id} value={row.id}>
                  {[row.name || "Unnamed jurisdiction", row.state].filter(Boolean).join(", ")} · {row.id}
                </option>
              ))}
            </select>
          </>
        )}
        {selectedJurisdiction && (
          <>
            <p className="text-xs text-gray-600">
              Selected jurisdiction ID: {selectedJurisdiction.id}. Source lookup is restricted to this exact canonical jurisdiction ID.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600">
                {catalog.loading ? "Loading source records…" : catalog.error || ("Showing " + catalog.rows.length + " source records; " + candidates.length + " have saved-page identity metadata.")}
              </p>
              <button
                type="button"
                className="min-h-11 rounded-md border bg-white px-3 text-sm hover:bg-gray-50"
                disabled={catalog.loading}
                onClick={() => setRefresh(value => value + 1)}
              >
                Refresh source records
              </button>
            </div>
            {catalog.error && <p role="alert" className="text-sm text-red-700">{catalog.error}</p>}
            {!catalog.loading && !catalog.error && (
              <>
                <label className="block text-sm font-medium" htmlFor="saved-source-select">Choose an exact saved source record</label>
                <select
                  id="saved-source-select"
                  className="min-h-11 w-full rounded-md border bg-white px-3 text-sm"
                  value={selectedId}
                  onChange={event => setSelectedId(event.target.value)}
                >
                  <option value="">Select source by title and record ID</option>
                  {candidates.map(row => (
                    <option key={row.id} value={row.id}>
                      {row.title || "Untitled"} · {row.id}
                    </option>
                  ))}
                </select>
              </>
            )}
            {selected && (
              <div className="space-y-2 rounded-md border bg-slate-50 p-3 text-xs [overflow-wrap:anywhere]">
                <p><strong>Exact source record:</strong> {selected.id}</p>
                <p><strong>Canonical jurisdiction ID:</strong> {selected.jurisdiction_id}</p>
                <p><strong>Saved archive SHA-256:</strong> {selected.file_hash_sha256}</p>
                <p><strong>Archived URL:</strong> {selected.archived_file_url}</p>
                <p><strong>Saved extraction state:</strong> {selected.text_extraction_state?.status || "Not recorded"}; {selected.text_extraction_state?.pages_extracted} page(s) extracted.</p>
                <SourceTextEvidenceBrowser source={selected} />
              </div>
            )}
            {!catalog.loading && !catalog.error && candidates.length === 0 && (
              <p className="text-sm text-gray-600">No source in this jurisdiction’s loaded catalog has complete saved-page identity metadata.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PermittingDocs() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-purple-50/30 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <SavedPhysicalTextAcceptance />
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-purple-600" />
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Permitting Intelligence — Staff Guide</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            How the permitting system works, in plain language. For sign shop staff, not developers.
          </p>
        </div>

        {/* How locality data becomes trusted */}
        <DocSection icon={ShieldCheck} title="How locality data becomes trusted" defaultOpen>
          <p>Permitting data goes through a trust pipeline before it can be used operationally:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Source classification</strong> — Every archived document (ordinance, form, fee schedule) is automatically classified as <em>current adopted</em>, <em>draft/proposed</em>, <em>historical</em>, or <em>superseded</em>.</li>
            <li><strong>Rule extraction</strong> — The system extracts structured rules (max height, setback, fee amount) from source documents. Each rule carries citations back to its source.</li>
            <li><strong>Staff review</strong> — Extracted rules start as <em>pending</em>. An admin reviews each rule and either approves or rejects it.</li>
            <li><strong>Approved = operational</strong> — Only <em>staff-approved</em> rules from <em>current adopted</em> sources are operational. Draft and historical sources can never become operational.</li>
          </ol>
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
            <p className="text-xs text-purple-800">
              <strong>Key rule:</strong> A rule is operational only when <em>both</em> conditions are met:
              (1) an admin approved it, and (2) its source is classified as current adopted code.
              Draft/proposed ordinances are never operational — they can only guide, never govern.
            </p>
          </div>
        </DocSection>

        {/* How source changes flow through review */}
        <DocSection icon={RefreshCw} title="How source changes flow through review">
          <p>When a jurisdiction updates their ordinance or fee schedule online, the system detects it and flags it — it never silently overwrites your approved data.</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Monitor detects change</strong> — The scanner checks each monitored source URL on a schedule (weekly, monthly, quarterly, or yearly depending on volatility). It compares a hash of the page content.</li>
            <li><strong>Flag for review</strong> — When content changes, the monitor sets <em>staff_review_required</em> on the source document and any rules that cite it.</li>
            <li><strong>Review suggestions generated</strong> — For permit lines that cite the changed source, the system generates a review suggestion (not an automatic rewrite).</li>
            <li><strong>Staff decides</strong> — An admin reviews the change, updates the rule if needed, and re-approves. The old rule is superseded (not deleted) so history is preserved.</li>
          </ol>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs text-amber-800">
              <strong>Never silent:</strong> The system never automatically rewrites approved rules or active permit lines.
              It only flags and suggests — a human always decides.
            </p>
          </div>
        </DocSection>

        {/* How staff verifies rewrite authority */}
        <DocSection icon={ShieldCheck} title="How staff verifies rewrite authority">
          <p>When a jurisdiction undergoes a comprehensive zoning rewrite (like Boone County 2026), the system has two gates before the new code can replace the old:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Adoption gate</strong> — An admin must verify that the rewrite was officially adopted (not just proposed or drafted).</li>
            <li><strong>Effective date gate</strong> — An admin must verify the effective date has passed. An adopted ordinance with no effective date is not yet authoritative.</li>
          </ol>
          <p>Both gates must pass. If either is unverified, the system retains the <em>currently adopted</em> code as authoritative and treats the rewrite as draft.</p>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-xs text-red-800">
              <strong>Fail-closed:</strong> If there's any doubt — missing adoption evidence, missing effective date, jurisdiction mismatch — the system keeps the old code.
              The new code only takes over when an admin explicitly verifies both gates.
            </p>
          </div>
        </DocSection>

        {/* How gaps are represented */}
        <DocSection icon={AlertTriangle} title="How gaps are represented">
          <p>Not every jurisdiction has complete data. The system distinguishes three kinds of gaps:</p>
          <div className="space-y-2">
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="font-medium text-gray-900">"Not yet researched"</p>
              <p className="text-xs text-gray-600">The jurisdiction is in the collection queue but no sources have been archived yet. The dashboard shows it as <em>not_started</em> or <em>source_discovery</em>.</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-3">
              <p className="font-medium text-gray-900">"Blocked"</p>
              <p className="text-xs text-gray-600">The jurisdiction has no findable online source, or the source is behind a paywall/login. The queue row is marked <em>blocked</em> with a note about what's missing.</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/30 p-3">
              <p className="font-medium text-gray-900">"Staff confirmation needed"</p>
              <p className="text-xs text-gray-600">The AI workflow designer couldn't determine a requirement from the available sources. It surfaces this as a gap rather than inventing an answer. Staff must confirm or research manually.</p>
            </div>
          </div>
        </DocSection>

        {/* How monitoring works */}
        <DocSection icon={Bell} title="How monitoring works">
          <p>The system monitors official source URLs for changes so you don't have to check manually.</p>
          <div className="space-y-2">
            <div>
              <p className="font-medium text-gray-900">Cadences</p>
              <ul className="ml-4 list-disc text-xs text-gray-600">
                <li><strong>Volatile</strong> (weekly) — Pages that change often (agendas, meeting minutes)</li>
                <li><strong>Moderate</strong> (monthly) — Ordinances and fee schedules (default)</li>
                <li><strong>Stable</strong> (quarterly) — Adopted codes that rarely change</li>
                <li><strong>Immutable</strong> (yearly) — Historical/archived documents</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-900">Cheap-first checks</p>
              <p className="text-xs text-gray-600">The scanner first checks HTTP headers (ETag, Last-Modified, Content-Length). Only if those indicate a change does it download and hash the full page. This keeps monitoring lightweight.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Alerts</p>
              <p className="text-xs text-gray-600">When a change is detected, the system creates an operational alert and flags affected rules for re-review. Broken sources (timeouts, 404s) are also flagged after repeated failures.</p>
            </div>
          </div>
        </DocSection>

        {/* How AI search chooses authority */}
        <DocSection icon={Search} title="How AI search chooses authority">
          <p>When you use AI-assisted permitting research, the system follows a strict hierarchy:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Approved rules first</strong> — Staff-approved rules from current-adopted sources are the primary authority. Cited as <em>verified</em>.</li>
            <li><strong>Pending rules as guidance</strong> — Extracted but not-yet-approved rules are used as guidance only. Cited as <em>needs_verification</em>. Never treated as operational.</li>
            <li><strong>Draft/historical never operational</strong> — Rules from draft/proposed or historical sources are never used as the basis for any answer. They're labeled as <em>draft_context</em> or <em>historical</em>.</li>
          </ol>
          <p>If the AI can't find an answer in approved rules, it says so — it never invents requirements, fees, or dimensions.</p>
        </DocSection>

        {/* How workflow generation works */}
        <DocSection icon={Sparkles} title="How workflow generation works">
          <p>The AI Permit Workflow Designer builds a step-by-step permit workflow from your project inputs:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Resolve jurisdiction</strong> — From the project address (or preselected from the locality panel). Strict identity — no cross-jurisdiction guessing.</li>
            <li><strong>Load rules by hierarchy</strong> — Approved rules first, then pending as guidance. Draft/historical are loaded but never used as the basis for steps.</li>
            <li><strong>Load source documents</strong> — Forms, fee schedules, and code docs for the jurisdiction.</li>
            <li><strong>Compose workflow</strong> — The AI generates steps with citations. Every step has a <em>basis</em> label: <em>approved_rule</em>, <em>pending_review</em>, or <em>staff_confirmation_needed</em>.</li>
            <li><strong>Review and create</strong> — You review the draft, then click "Create Permit Lines." Each line gets a deterministic dedup key so regenerating won't create duplicates.</li>
          </ol>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
            <p className="text-xs text-blue-800">
              <strong>Idempotency:</strong> If you generate the same workflow twice, the system skips lines that already exist
              (same jurisdiction + office + permit type). No duplicates, no data loss.
            </p>
          </div>
          <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
            <p className="text-xs text-purple-800">
              <strong>Review suggestions:</strong> When a source document changes after you've created permit lines,
              the system generates a review suggestion (not an automatic rewrite). You decide whether to update.
            </p>
          </div>
        </DocSection>

        {/* How staff overrides/corrects data */}
        <DocSection icon={Edit} title="How staff overrides and corrects data">
          <div className="space-y-2">
            <div>
              <p className="font-medium text-gray-900">Rules review</p>
              <p className="text-xs text-gray-600">In Admin Settings → Permitting Rules Review, you can approve, reject, or edit any extracted rule. Approved rules become operational; rejected rules are marked and excluded.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Authority verification</p>
              <p className="text-xs text-gray-600">In the Jurisdiction Detail Panel, admins can verify rewrite authority (adoption + effective date). Both gates must pass before a rewrite replaces current code.</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">Alert dismissal</p>
              <p className="text-xs text-gray-600">Operational alerts (source changes, missing documents) can be dismissed after review. Dismissed alerts are archived, not deleted.</p>
            </div>
          </div>
        </DocSection>

        {/* How to add a new jurisdiction */}
        <DocSection icon={Plus} title="How to add a new jurisdiction">
          <ol className="ml-4 list-decimal space-y-1">
            <li><strong>Queue</strong> — The jurisdiction is already in the Source Collection Queue (all KY and OH counties plus incorporated cities are pre-seeded). Find it on the Permitting Completeness Dashboard.</li>
            <li><strong>Research</strong> — Use AI-assisted research or manual archive to find and save the official source documents (sign ordinance, zoning code, fee schedule, permit forms).</li>
            <li><strong>Archive</strong> — Each source document is archived to the PermittingSourceDocument entity with its official URL, retrieval date, and authority classification.</li>
            <li><strong>Extract</strong> — The system extracts structured rules from the archived sources. Each rule gets citations back to its source.</li>
            <li><strong>Review</strong> — An admin reviews the extracted rules in Permitting Rules Review, approving the ones that are accurate and operational.</li>
            <li><strong>Monitor</strong> — Once verified, enable source monitoring so the system watches for future changes automatically.</li>
          </ol>
        </DocSection>

        {/* How statewide completeness is measured */}
        <DocSection icon={BarChart3} title="How statewide completeness is measured">
          <p>The Permitting Completeness Dashboard shows live metrics for all seeded jurisdictions:</p>
          <div className="space-y-2">
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs"><strong>Jurisdiction coverage</strong> — How many jurisdictions have a JurisdictionProfile vs. just a queue row.</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs"><strong>Source classification</strong> — Breakdown of source documents by authority classification (current_adopted, draft_proposed, historical, etc.).</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs"><strong>Rule approval</strong> — Total rules extracted vs. staff-approved vs. needs review. Only approved rules are operational.</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs"><strong>Monitor health</strong> — How many sources are actively monitored, how many need staff review, how many are failing.</p>
            </div>
            <div className="rounded-lg border border-gray-200 p-2">
              <p className="text-xs"><strong>Gaps and blocked</strong> — How many jurisdictions have documented gaps vs. are fully blocked (no findable source).</p>
            </div>
          </div>
          <p className="text-xs text-gray-500">Filter by state, jurisdiction type, or collection status to drill into specific areas.</p>
        </DocSection>

        {/* Footer */}
        <div className="pt-2 pb-8 text-center">
          <Badge variant="outline" className="gap-1">
            <ClipboardCheck className="h-3 w-3" />
            Permitting Intelligence — 7-phase roadmap complete
          </Badge>
        </div>
      </div>
    </div>
  );
}