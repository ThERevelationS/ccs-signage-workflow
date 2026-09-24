import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, MapPin, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function CAGISSearchBar({ onLocationSelect, cagisUrl }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await base44.functions.invoke('propertySearch', {
        searchTerm: searchTerm.trim()
      });
      
      if (response?.data?.propertyData) {
        setResults(response.data.propertyData);
        setExpanded(true);
        if (onLocationSelect) {
          onLocationSelect({
            name: searchTerm,
            type: 'property',
            data: response.data.propertyData
          });
        }
      } else if (response?.data?.error) {
        setError(response.data.error);
      } else {
        setError("Unable to retrieve property information. Property database may not be available for this jurisdiction.");
      }
    } catch (err) {
      setError("Property search unavailable. This feature may not be configured.");
      console.error("Property search error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSearch} className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="text"
          placeholder="Search property (address, parcel #, owner)..."
          aria-label="Search property by address, parcel number, or owner"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="min-h-11 flex-1 text-sm"
        />
        <Button 
          type="submit" 
          disabled={loading || !searchTerm.trim()}
          className="min-h-11 w-full gap-2 bg-blue-600 px-4 hover:bg-blue-700 sm:w-auto"
          size="sm"
          aria-label={loading ? "Searching property database" : "Search property database"}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          {loading ? "Searching..." : "Search"}
        </Button>
      </form>

      {error && (
        <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {results && (
        <div className="border border-blue-200 rounded overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex min-h-11 w-full items-center justify-between gap-2 bg-blue-50 p-3 text-left transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} property information`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 flex-shrink-0" />
              <span className="font-medium text-blue-900 text-sm">Property Information Found</span>
            </div>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {expanded && (
            <div className="p-3 space-y-3 text-xs max-h-80 overflow-y-auto">
              {cagisUrl ? (
                <a
                  href={cagisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open jurisdiction property database in a new tab"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded bg-blue-600 px-3 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
                >
                  View on Database →
                </a>
              ) : (
                <a
                  href={`https://cagis.hamilton-co.org/cagisonline/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open CAGIS in a new tab"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1 rounded bg-blue-600 px-3 py-2 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
                >
                  View on CAGIS →
                </a>
              )}

              {results.address && (
                <div>
                  <p className="font-semibold text-gray-700">Address</p>
                  <p className="text-gray-600">{results.address}</p>
                </div>
              )}
              
              {results.parcelInfo && (
                <div>
                  <p className="font-semibold text-gray-700">Parcel Information</p>
                  <p className="text-gray-600">{results.parcelInfo}</p>
                </div>
              )}
              
              {results.ownerInfo && (
                <div>
                  <p className="font-semibold text-gray-700">Owner</p>
                  <p className="text-gray-600">{results.ownerInfo}</p>
                </div>
              )}

              {results.zoningInfo && (
                <div>
                  <p className="font-semibold text-gray-700">Zoning</p>
                  <p className="text-gray-600">{results.zoningInfo}</p>
                </div>
              )}

              {results.permitHistory && (
                <div>
                  <p className="font-semibold text-gray-700">Permit History</p>
                  <p className="text-gray-600">{results.permitHistory}</p>
                </div>
              )}

              {results.assessmentData && (
                <div>
                  <p className="font-semibold text-gray-700">Assessment</p>
                  <p className="text-gray-600">{results.assessmentData}</p>
                </div>
              )}

              {results.additionalNotes && (
                <div>
                  <p className="font-semibold text-gray-700">Additional Information</p>
                  <p className="text-gray-600">{results.additionalNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}