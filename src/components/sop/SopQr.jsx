import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { categoryByKey } from "./sopModel";

// QR sticker dialog: scan-to-open link for one SOP. Prints a label-friendly card.
export function sopDeepLink(sop) {
  return `${window.location.origin}/sop?sop=${sop.id}`;
}

export default function SopQrDialog({ sop, settings, open, onClose }) {
  if (!sop) return null;
  const cat = categoryByKey(settings, sop.category);
  const url = sopDeepLink(sop);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Machine QR code</DialogTitle>
          <DialogDescription>Print and tape to the equipment — scan opens this SOP instantly.</DialogDescription>
        </DialogHeader>
        <div className="sop-qr-card mx-auto rounded-xl border-2 border-slate-800 p-5 text-center bg-white">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cat.color }}>{cat.label}</p>
          <QRCodeSVG value={url} size={180} level="M" includeMargin={false} className="mx-auto my-3" />
          <p className="text-sm font-bold text-slate-900 leading-snug">{sop.title}</p>
          <p className="mt-1 text-[10px] text-slate-400 break-all">{url}</p>
        </div>
        <Button type="button" onClick={() => window.print()} className="gap-1.5 mx-auto">
          <Printer className="h-4 w-4" /> Print sticker
        </Button>
      </DialogContent>
    </Dialog>
  );
}
