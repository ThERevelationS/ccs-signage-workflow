import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MapPin, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function CAGISSearchBar({ onLocationSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await base44.functions.invoke('cagisSearch', {
        searchTerm: searchTerm.trim()
      });
      
      if (response.data?.results) {
        setResults(response.data.results);
        if (response.data.results[0]?.found && onLocationSelect) {
          onLocationSelect({
            name: searchTerm,
            type: 'cagis',
            url: response.data.results[0]?.url
          });
        }
      }
    } catch (err) {
      setError("Failed to search CAGIS database");
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          type="text"
          placeholder="Search Ohio CAGIS (address, parcel #, owner name)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 text-sm"
        />
        <Button 
          type="submit" 
          disabled={loading || !searchTerm.trim()}
          className="bg-blue-600 hover:bg-blue-700 gap-2"
          size="sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          Search
        </Button>
      </form>

      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {results && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm">
          {results[0]?.found ? (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-900">{results[0]?.message}</p>
                {results[0]?.url && (
                  <a href={results[0].url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs mt-1">
                    View in CAGIS →
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className="text-blue-700">{results[0]?.message}</p>
          )}
        </div>
      )}
    </div>
  );
}