import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Phone, Mail, Globe, MapPin, FileText } from "lucide-react";

export default function LocalityInfoPopup({ locality, isOpen, onClose }) {
  if (!locality) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-purple-600" />
            {locality.name}
            {locality.state && <span className="text-sm font-normal text-gray-500">({locality.state})</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {locality.governing_body && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Governing Body</p>
              <p className="text-sm font-medium">{locality.governing_body}</p>
            </div>
          )}

          {locality.office_type && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Office Type</p>
              <p className="text-sm">{locality.office_type}</p>
            </div>
          )}

          {locality.contact_department && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Department</p>
              <p className="text-sm">{locality.contact_department}</p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            {locality.contact_phone && (
              <a href={`tel:${locality.contact_phone}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Phone className="w-4 h-4" /> {locality.contact_phone}
              </a>
            )}
            {locality.contact_email && (
              <a href={`mailto:${locality.contact_email}`} className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Mail className="w-4 h-4" /> {locality.contact_email}
              </a>
            )}
            {locality.contact_website && (
              <a href={locality.contact_website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                <Globe className="w-4 h-4" /> {locality.contact_website}
              </a>
            )}
            {locality.contact_address && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" /> {locality.contact_address}
              </div>
            )}
          </div>

          {locality.contact_notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-0.5">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{locality.contact_notes}</p>
            </div>
          )}

          {locality.categories?.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">Categories</p>
              <div className="flex flex-wrap gap-1">
                {locality.categories.map(c => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700">{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}