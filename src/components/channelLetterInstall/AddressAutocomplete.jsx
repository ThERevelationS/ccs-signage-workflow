import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getSessionToken } from "@/components/auth/EmailGate";

export default function AddressAutocomplete({ value, onChange, placeholder, className, id }) {
  const [query, setQuery] = useState(value || "");
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const lastFetchedRef = useRef("");

  // Keep local query in sync if parent changes value externally
  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = async (q) => {
    if (!q || q.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    if (lastFetchedRef.current === q) return;
    lastFetchedRef.current = q;
    setLoading(true);
    let list = null;
    try {
      // Primary: real Google Places autocomplete (backend proxy).
      const res = await base44.functions.invoke("placesAutocomplete", {
        input: q,
        session_token: getSessionToken(),
      });
      list = res?.data?.suggestions || null;
    } catch (e) {
      list = null;
    }
    setSuggestions(list || []);
    setOpen(true);
    setHighlight(-1);
    setLoading(false);
  };

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 250);
  };

  const selectSuggestion = (s) => {
    const addr = s.full_address;
    setQuery(addr);
    onChange(addr);
    setSuggestions([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      <Input
        id={id}
        value={query}
        onChange={handleInput}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button type="button"
              key={i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-2 text-sm flex items-start gap-2 transition-colors ${
                highlight === i ? "bg-purple-50" : "hover:bg-slate-50"
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-purple-600 mt-0.5 flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-slate-800 truncate">{s.label || s.full_address}</span>
                {s.secondary && <span className="block text-xs text-slate-500 truncate">{s.secondary}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}