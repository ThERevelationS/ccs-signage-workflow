import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, RefreshCw, Edit, MapPin, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const DOC_TYPE_LABELS = {
  sign_ordinance: "Sign Ordinance",
  permit_application: "Permit Application",
  zoning_code: "Zoning Code",
  fee_schedule: "Fee Schedule",
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

export default function JurisdictionCard({ jurisdiction, onEdit, onRefresh, onSelect, isRefreshing }) {
  const docCount = jurisdiction.documents?.length || 0;
  const hasRequirements = jurisdiction.permit_requirements?.requires_permit !== undefined;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
      onClick={() => onSelect(jurisdiction)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm">{jurisdiction.name}</h3>
              <Badge variant="outline" className="text-xs">{jurisdiction.state}</Badge>
              <Badge className="text-xs bg-gray-100 text-gray-600 capitalize">{jurisdiction.type}</Badge>
            </div>
            {jurisdiction.permitting_url && (
              <a
                href={jurisdiction.permitting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
                Permitting Page
              </a>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onRefresh(jurisdiction); }}
              disabled={isRefreshing}
              title="AI Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-500' : 'text-gray-400'}`} />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onEdit(jurisdiction); }}
              title="Edit"
            >
              <Edit className="w-3.5 h-3.5 text-gray-400" />
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
              Requirements extracted
            </span>
          )}
          {jurisdiction.last_updated && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              {format(new Date(jurisdiction.last_updated), "MM/dd/yy")}
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
      </div>
    </div>
  );
}