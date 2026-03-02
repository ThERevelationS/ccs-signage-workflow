import React from "react";
import { CheckCircle, AlertCircle, DollarSign, Clock, FileText, Phone, Mail, AlertTriangle } from "lucide-react";

export default function DocumentAnalysisPanel({ analysis, isLoading }) {
  if (isLoading) {
    return (
      <div className="p-3 bg-blue-50 rounded border border-blue-200">
        <p className="text-xs text-blue-600 flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
          Analyzing document...
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="space-y-3 text-xs">
      {/* Permits Required */}
      {analysis.permits_required !== null && (
        <div className="flex items-start gap-2 p-2 rounded bg-gray-50 border border-gray-200">
          {analysis.permits_required ? (
            <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-semibold text-gray-700">Permits {analysis.permits_required ? 'Required' : 'Not Required'}</p>
            {analysis.permit_types?.length > 0 && (
              <p className="text-gray-600 mt-1">{analysis.permit_types.join(", ")}</p>
            )}
          </div>
        </div>
      )}

      {/* Fees */}
      {(analysis.fees?.base_fee || analysis.fees?.total_estimate) && (
        <div className="p-3 rounded bg-green-50 border border-green-200">
          <p className="font-semibold text-green-700 flex items-center gap-1 mb-1">
            <DollarSign className="w-4 h-4" /> Fee Information
          </p>
          <div className="space-y-1 text-gray-700">
            {analysis.fees.base_fee && <p>Base Fee: <span className="font-semibold">{analysis.fees.base_fee}</span></p>}
            {analysis.fees.additional_fees && <p>Additional Fees: {analysis.fees.additional_fees}</p>}
            {analysis.fees.total_estimate && <p>Estimated Total: <span className="font-semibold">{analysis.fees.total_estimate}</span></p>}
          </div>
        </div>
      )}

      {/* Deadlines */}
      {(analysis.deadlines?.processing_time || analysis.deadlines?.approval_timeline) && (
        <div className="p-3 rounded bg-blue-50 border border-blue-200">
          <p className="font-semibold text-blue-700 flex items-center gap-1 mb-1">
            <Clock className="w-4 h-4" /> Timeline
          </p>
          <div className="space-y-1 text-gray-700">
            {analysis.deadlines.processing_time && <p>Processing: {analysis.deadlines.processing_time}</p>}
            {analysis.deadlines.approval_timeline && <p>Approval: {analysis.deadlines.approval_timeline}</p>}
          </div>
        </div>
      )}

      {/* Contact Info */}
      {(analysis.contact_info?.phone || analysis.contact_info?.email || analysis.contact_info?.website) && (
        <div className="p-3 rounded bg-purple-50 border border-purple-200">
          <p className="font-semibold text-purple-700 mb-1">Contact Information</p>
          <div className="space-y-1 text-gray-700">
            {analysis.contact_info.department && <p className="font-medium">{analysis.contact_info.department}</p>}
            {analysis.contact_info.phone && (
              <p className="flex items-center gap-1">
                <Phone className="w-3 h-3 text-purple-600" />
                <a href={`tel:${analysis.contact_info.phone}`} className="text-blue-600 hover:underline">
                  {analysis.contact_info.phone}
                </a>
              </p>
            )}
            {analysis.contact_info.email && (
              <p className="flex items-center gap-1">
                <Mail className="w-3 h-3 text-purple-600" />
                <a href={`mailto:${analysis.contact_info.email}`} className="text-blue-600 hover:underline">
                  {analysis.contact_info.email}
                </a>
              </p>
            )}
            {analysis.contact_info.website && (
              <p className="text-blue-600 hover:underline">
                <a href={analysis.contact_info.website} target="_blank" rel="noopener noreferrer">
                  {analysis.contact_info.website}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Sign Requirements */}
      {(analysis.max_sign_height || analysis.max_sign_area || analysis.setback_requirements) && (
        <div className="p-3 rounded bg-amber-50 border border-amber-200">
          <p className="font-semibold text-amber-700 mb-1">Sign Specifications</p>
          <div className="space-y-1 text-gray-700">
            {analysis.max_sign_height && <p>Max Height: {analysis.max_sign_height}</p>}
            {analysis.max_sign_area && <p>Max Area: {analysis.max_sign_area}</p>}
            {analysis.setback_requirements && <p>Setbacks: {analysis.setback_requirements}</p>}
          </div>
        </div>
      )}

      {/* Restrictions */}
      {(analysis.illumination_allowed !== null || analysis.electronic_signs_allowed !== null || analysis.key_restrictions?.length > 0) && (
        <div className="p-3 rounded bg-red-50 border border-red-200">
          <p className="font-semibold text-red-700 flex items-center gap-1 mb-1">
            <AlertTriangle className="w-4 h-4" /> Restrictions
          </p>
          <div className="space-y-1 text-gray-700">
            {analysis.illumination_allowed !== null && (
              <p className="flex items-center gap-1">
                {analysis.illumination_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                Illumination {analysis.illumination_allowed ? 'Allowed' : 'Not Allowed'}
              </p>
            )}
            {analysis.electronic_signs_allowed !== null && (
              <p className="flex items-center gap-1">
                {analysis.electronic_signs_allowed ? <CheckCircle className="w-3 h-3 text-green-500" /> : <AlertCircle className="w-3 h-3 text-red-500" />}
                Electronic Signs {analysis.electronic_signs_allowed ? 'Allowed' : 'Not Allowed'}
              </p>
            )}
            {analysis.key_restrictions?.map((restriction, i) => (
              <p key={i} className="text-gray-700">• {restriction}</p>
            ))}
          </div>
        </div>
      )}

      {/* Requirements List */}
      {analysis.requirements?.length > 0 && (
        <div className="p-3 rounded bg-cyan-50 border border-cyan-200">
          <p className="font-semibold text-cyan-700 flex items-center gap-1 mb-1">
            <FileText className="w-4 h-4" /> Requirements
          </p>
          <ul className="space-y-1 text-gray-700">
            {analysis.requirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-cyan-600 font-bold mt-0.5">•</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}