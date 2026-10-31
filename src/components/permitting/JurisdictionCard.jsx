import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, RefreshCw, Edit, Clock, CheckCircle, ShieldAlert, ChevronRight, Phone } from "lucide-react";
import { format } from "date-fns";
import { assessJurisdictionTrust } from "./jurisdictionTrust";

const DOC_TYPE_LABELS = {
  sign_ordinance: "Sign rules",
  permit_application: "Permit form",
  zoning_code: "Zoning rules",
  fee_schedule: "Fees",
  checklist: "Checklist",
  other: "Other"
};

const DOC_TYPE_COLORS = {
  sign_ordinance: "bg-purple-100 text-purple-700",
  permit_application: "bg-blue-100 text-blue-700",
  zoning_code: "bg-green-100 text-green-700",
  fee_schedule: "bg-yellow-100 text-yellow-700",
  checklist: "bg-orange-100 text-orange-700",
  other: "bg-gray-100 text-gray-700"
};

export default function JurisdictionCard({ jurisdiction, onEdit, onRefresh, onSelect, isRefreshing, duplicateCount = 1 }) {
  const docCount = jurisdiction.documents?.length || 0;
  const lastUpdatedDate = jurisdiction.last_updated ? new Date(jurisdiction.last_updated) : null;
  const lastUpdatedLabel = lastUpdatedDate && !Number.isNaN(lastUpdatedDate.getTime())
    ? format(lastUpdatedDate, "MM/dd/yy")
    : null;
  const hasRequirements = jurisdiction.permit_requirements?.requires_permit !== undefined;
  const trust = useMemo(() => assessJurisdictionTrust(jurisdiction, duplicateCount), [jurisdiction, duplicateCount]);

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onSelect(jurisdiction)}
    >
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="min-w-0 break-words font-semibold text-gray-900 text-sm">{jurisdiction.name}</h3>
              <Badge variant="outline" className="text-xs">{jurisdiction.state}</Badge>
              <Badge className="text-xs bg-gray-100 text-gray-600 capitalize">{jurisdiction.type}</Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${trust.className}`} title={trust.description}>
                <ShieldAlert className="w-3 h-3" /> {trust.label}
              </span>
              {(() => { const days = jurisdiction.verified_at ? Math.floor((Date.now() - new Date(jurisdiction.verified_at).getTime()) / 86400000) : null; return days != null && days > 90 ? <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800" title={"Checked " + days + " days ago"}>checked {days}d ago</span> : null; })()}
              {trust.issues.length > 0 && (
                <span className="text-[10px] text-gray-500">{trust.issues.length} thing{trust.issues.length === 1 ? '' : 's'} to check</span>
              )}
            </div>
            {jurisdiction.type !== "county" && jurisdiction.parent_county?.name && (
              <div className="mt-1 text-[11px] text-gray-500">In {jurisdiction.parent_county.name} County</div>
            )}
            {(jurisdiction.contact_info?.phone || (jurisdiction.offices || []).find((o) => o.contact_phone)?.contact_phone) && (
              <a
                href={`tel:${(jurisdiction.contact_info?.phone || (jurisdiction.offices || []).find((o) => o.contact_phone)?.contact_phone || "").replace(/[^+\d]/g, "")}`}
                className="mt-1 flex items-center gap-1 text-xs font-semibold text-green-700 hover:underline"
                onClick={e => e.stopPropagation()}
              >
                <Phone className="w-3 h-3" />
                {jurisdiction.contact_info?.phone || (jurisdiction.offices || []).find((o) => o.contact_phone)?.contact_phone}
              </a>
            )}
            {jurisdiction.permitting_url && (
              <a
                href={jurisdiction.permitting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                Permit page
              </a>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto sm:flex-shrink-0 sm:gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 flex-1 gap-1.5 px-3 sm:flex-none sm:px-2.5"
              onClick={(e) => { e.stopPropagation(); onRefresh(jurisdiction); }}
              disabled={isRefreshing}
              title="Ask AI to re-check"
              aria-label={`Refresh ${jurisdiction.name}`}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
              <span className="sm:hidden">{isRefreshing ? "Refreshing" : "Refresh"}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 flex-1 gap-1.5 px-3 sm:flex-none sm:px-2.5"
              onClick={(e) => { e.stopPropagation(); onEdit(jurisdiction); }}
              title="Edit"
              aria-label={`Edit ${jurisdiction.name}`}
            >
              <Edit className="w-4 h-4 text-gray-500" />
              <span className="sm:hidden">Edit</span>
            </Button>
          </div>
        </div>

        {jurisdiction.ai_summary && (
          <p className="text-xs text-gray-600 mt-2 line-clamp-2">{jurisdiction.ai_summary}</p>
        )}

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <FileText className="w-3 h-3" />
            {docCount} doc{docCount !== 1 ? 's' : ''}
          </span>
          {hasRequirements && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle className="w-3 h-3" />
              Rules saved
            </span>
          )}
          {lastUpdatedLabel && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {lastUpdatedLabel}
            </span>
          )}
        </div>

        {docCount > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {[...new Set(jurisdiction.documents.map(d => d.doc_type))].slice(0, 4).map(type => (
              <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${DOC_TYPE_COLORS[type] || DOC_TYPE_COLORS.other}`}>
                {DOC_TYPE_LABELS[type] || type}
              </span>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11 w-full justify-between gap-2 text-xs sm:w-auto sm:justify-center"
          onClick={(e) => { e.stopPropagation(); onSelect(jurisdiction); }}
          aria-label={`Open details for ${jurisdiction.name}`}
        >
          Open details
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}