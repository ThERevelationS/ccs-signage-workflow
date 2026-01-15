import React, { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Download, QrCode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function UserQRCode({ user }) {
  const qrRef = useRef(null);
  
  // Create a unique code for the user - using email as identifier
  const qrValue = `TIMECLOCK:${user.email}`;
  
  // Don't render if user has no email
  if (!user?.email) {
    return null;
  }
  
  const handleDownload = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    
    // Create canvas and draw SVG
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 300;
      canvas.height = 350;
      
      // White background
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw QR code
      ctx.drawImage(img, 25, 20, 250, 250);
      
      // Add name text
      ctx.fillStyle = "black";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(user.full_name || user.email, canvas.width / 2, 300);
      
      ctx.font = "12px Arial";
      ctx.fillStyle = "#666";
      ctx.fillText("Time Clock Badge", canvas.width / 2, 325);
      
      // Download
      const link = document.createElement("a");
      link.download = `timeclock-badge-${user.username || user.email.split("@")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <QrCode className="w-4 h-4" />
          QR Badge
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Time Clock QR Badge</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center py-4">
          <div ref={qrRef} className="bg-white p-4 rounded-xl shadow-inner">
            <QRCodeSVG 
              value={qrValue} 
              size={200}
              level="H"
              includeMargin={true}
            />
          </div>
          <p className="mt-4 font-semibold text-lg">{user.full_name || user.email}</p>
          <p className="text-sm text-gray-500">{user.username}</p>
          <Button onClick={handleDownload} className="mt-4 gap-2">
            <Download className="w-4 h-4" />
            Download Badge
          </Button>
          <p className="mt-4 text-xs text-gray-400 text-center max-w-xs">
            Print this badge or display on phone to scan at the time clock for quick clock in/out
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}