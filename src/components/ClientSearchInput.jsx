import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { User, FoundationProject } from '@/entities/all';
import { Loader2, Clock } from 'lucide-react';

export default function ClientSearchInput({ value, onChange, onSelectProject, className, placeholder }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [recentClients, setRecentClients] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    User.me().then(u => {
      if (u && u.enable_ccs_database_lookup) setEnabled(true);
    }).catch(e => console.error(e));
  }, []);

  // Load recent unique clients from past projects
  useEffect(() => {
    FoundationProject.list('-created_date', 100)
      .then((projs) => {
        const seen = new Set();
        const unique = [];
        for (const p of projs) {
          const name = (p.client_name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          unique.push({
            client_name: name,
            project_name: p.project_name,
            estimate_number: p.estimate_number,
            hyperlink: p.hyperlink,
          });
          if (unique.length >= 8) break;
        }
        setRecentClients(unique);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (val) => {
    setQuery(val);
    onChange(val);
    
    if (!enabled) return;
    
    if (val.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('searchExternalClients', { search: val });
        if (res.data && res.data.results) {
          setResults(res.data.results);
          setIsOpen(res.data.results.length > 0);
        } else {
          setIsOpen(false);
        }
      } catch (e) {
        console.error("External search failed:", e);
        setIsOpen(false);
      }
      setLoading(false);
    }, 400); // 400ms debounce
  };

  const pickRecent = (r) => {
    setQuery(r.client_name);
    onChange(r.client_name);
    if (onSelectProject) onSelectProject(r);
    setShowRecent(false);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <Input
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setIsOpen(true);
          if (!query && recentClients.length > 0) setShowRecent(true);
        }}
        className={className}
        placeholder={enabled ? "Search CCS Database or type custom name..." : placeholder}
      />
      {enabled && loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          </div>
      )}
      {showRecent && !isOpen && recentClients.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wide bg-slate-50 border-b border-slate-100 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Recent Clients
          </div>
          {recentClients.map((r, i) => (
            <div
              key={i}
              className="p-2.5 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0"
              onClick={() => pickRecent(r)}
            >
              <div className="font-medium text-sm text-slate-900">{r.client_name}</div>
              {r.project_name && (
                <div className="text-xs text-slate-500 mt-0.5 truncate">{r.project_name}</div>
              )}
            </div>
          ))}
        </div>
      )}
      {isOpen && enabled && results.length > 0 && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map((r, i) => (
            <div
              key={i}
              className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0"
              onClick={() => {
                setQuery(r.client_name);
                onChange(r.client_name);
                if (onSelectProject) onSelectProject({
                  client_name: r.client_name,
                  project_name: r.project_name,
                  estimate_number: r.estimate_number,
                  hyperlink: r.hyperlink
                });
                setIsOpen(false);
              }}
            >
              <div className="font-medium text-sm text-slate-900">{r.client_name}</div>
              {(r.project_name || r.estimate_number) && (
                  <div className="text-xs text-slate-500 mt-0.5">
                      {r.project_name} {r.project_name && r.estimate_number ? ' | ' : ''} {r.estimate_number ? `Est: ${r.estimate_number}` : ''}
                  </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}