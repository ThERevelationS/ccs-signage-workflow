import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Sparkles, Settings2, BookOpen, Pin, Clock, BellRing } from "lucide-react";
import { categoryByKey, needsAcknowledgement, stripHtml } from "./sopModel";

// Browse view: search + department tabs + SOP cards. SOPs arrive already
// visibility-filtered by manageSops (staff only get published rows).

function SopCard({ sop, settings, me, onOpen }) {
  const cat = categoryByKey(settings, sop.category);
  const needsAck = needsAcknowledgement(sop, me?.email);
  const stepCount = Array.isArray(sop.steps) ? sop.steps.length : 0;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(sop)}
      className="group text-left rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
    >
      <div className="h-32 bg-slate-100 relative">
        {sop.cover_image_url ? (
          <img src={sop.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${cat.color}22, ${cat.color}0d)` }}>
            <BookOpen className="h-10 w-10" style={{ color: cat.color }} />
          </div>
        )}
        {sop.pinned && (
          <span className="absolute top-2 left-2 rounded-full bg-white/90 p-1 shadow" title="Pinned">
            <Pin className="h-3.5 w-3.5 text-amber-500" />
          </span>
        )}
        {sop.status !== "published" && (
          <Badge className="absolute top-2 right-2 capitalize" variant={sop.status === "draft" ? "secondary" : "outline"}>
            {sop.status}
          </Badge>
        )}
        {needsAck && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-red-500 text-white text-[10px] font-semibold px-2 py-0.5">
            <BellRing className="h-3 w-3" /> Read me
          </span>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{cat.label}</span>
          {sop.estimated_minutes > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> ~{sop.estimated_minutes}m
            </span>
          )}
        </div>
        <h3 className="font-semibold text-slate-900 leading-snug line-clamp-2">{sop.title}</h3>
        {sop.summary && (
          <p className="text-xs text-slate-500 line-clamp-2">{sop.summary}</p>
        )}
        <p className="text-[11px] text-slate-400 pt-1">
          {stepCount} step{stepCount === 1 ? "" : "s"}
          {sop.updated_date ? ` · updated ${new Date(sop.updated_date).toLocaleDateString()}` : ""}
        </p>
      </div>
    </button>
  );
}

export default function SopBrowser({ sops, settings, me, activeCategory, onCategoryChange, onOpen, onNew, onAiBuild, onAdmin }) {
  const [query, setQuery] = useState("");
  const categories = settings?.categories?.length ? settings.categories : [];

  const counts = useMemo(() => {
    const map = {};
    for (const sop of sops) map[sop.category] = (map[sop.category] || 0) + 1;
    return map;
  }, [sops]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sops;
    if (activeCategory && activeCategory !== "all") {
      list = list.filter((s) => s.category === activeCategory);
    }
    if (q) {
      list = list.filter((s) =>
        [s.title, s.summary, ...(s.tags || []), ...(s.steps || []).map((st) => `${st.title} ${stripHtml(st.body)}`)]
          .filter(Boolean).join(" ").toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      (b.pinned === true) - (a.pinned === true) ||
      (a.sort_order || 0) - (b.sort_order || 0) ||
      a.title.localeCompare(b.title)
    );
  }, [sops, activeCategory, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SOPs…"
            className="pl-9"
          />
        </div>
        {me?.canEdit && (
          <>
            <Button type="button" variant="outline" onClick={onAiBuild} className="gap-1.5">
              <Sparkles className="h-4 w-4 text-purple-500" /> Build with AI
            </Button>
            <Button type="button" onClick={onNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> New SOP
            </Button>
          </>
        )}
        {me?.role === "admin" && (
          <Button type="button" variant="ghost" size="icon" onClick={onAdmin} title="SOP settings" aria-label="SOP settings">
            <Settings2 className="h-5 w-5" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onCategoryChange("all")}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            activeCategory === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All ({sops.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeCategory === cat.key ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            style={activeCategory === cat.key ? { backgroundColor: cat.color } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color, ...(activeCategory === cat.key ? { backgroundColor: "#fff" } : {}) }} />
            {cat.label} ({counts[cat.key] || 0})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-600">
            {sops.length === 0 ? "No SOPs yet" : "Nothing matches"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {sops.length === 0
              ? (me?.canEdit ? "Create the first procedure with New SOP or Build with AI." : "Procedures will appear here once they are published.")
              : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((sop) => (
            <SopCard key={sop.id} sop={sop} settings={settings} me={me} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}
