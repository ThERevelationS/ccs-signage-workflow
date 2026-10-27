import { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function newBadgeRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tc-badge-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function badgeRotationStorageKey(email) {
  return `ccs_timeclock_badge_rotate:${String(email || "").trim().toLowerCase()}`;
}

function storedBadgeRotationRequest(email) {
  try {
    const value = sessionStorage.getItem(badgeRotationStorageKey(email)) || "";
    return value.length >= 8 && value.length <= 128 ? value : "";
  } catch {
    return "";
  }
}

function persistBadgeRotationRequest(email, requestId) {
  try { sessionStorage.setItem(badgeRotationStorageKey(email), requestId); } catch {}
}

function clearBadgeRotationRequest(email, expectedRequestId = "") {
  try {
    // Only clear the request id this caller persisted — a delayed ack must not
    // wipe a newer rotation request stored after a reload or by a fresh retry.
    if (expectedRequestId &&
        sessionStorage.getItem(badgeRotationStorageKey(email)) !== expectedRequestId) return;
    sessionStorage.removeItem(badgeRotationStorageKey(email));
  } catch {}
}

function shouldRetainBadgeRotation(err) {
  if (err?.retrySameRequest === true || err?.response?.data?.retry_same_request === true) return true;
  if (err?.confirmedServerResponse === true) return false;
  const status = Number(err?.response?.status || 0);
  return !err?.response || status >= 500;
}

export default function UserQRCode({ user, sessionToken = "" }) {
  const qrRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [badgeCode, setBadgeCode] = useState("");
  const [badgeVersion, setBadgeVersion] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [error, setError] = useState("");
  const [confirmReplace, setConfirmReplace] = useState(false);
  const badgeSeqRef = useRef(0);
  const badgeScopeRef = useRef("");
  badgeScopeRef.current = `${sessionToken || ""}|${String(user?.email || "").trim().toLowerCase()}`;

  const loadBadge = async ({ rotate = false } = {}) => {
    const requestEmail = String(user?.email || "").trim().toLowerCase();
    if (!requestEmail || !sessionToken) {
      setError("Sign in to Time Clock before viewing or replacing your secure badge.");
      return;
    }
    const requestScope = badgeScopeRef.current;
    const requestSeq = ++badgeSeqRef.current;
    const stillCurrent = () => requestSeq === badgeSeqRef.current && badgeScopeRef.current === requestScope;

    const requestId = rotate
      ? (storedBadgeRotationRequest(user.email) || newBadgeRequestId())
      : "";
    if (rotate) persistBadgeRotationRequest(user.email, requestId);

    rotate ? setIsReplacing(true) : setIsLoading(true);
    setError("");
    try {
      const response = await base44.functions.invoke("issueTimeClockBadge", {
        session_token: sessionToken,
        target_email: user.email,
        rotate,
        ...(rotate ? { request_id: requestId } : {}),
      });
      const data = response?.data || response;
      if (!stillCurrent()) return;
      if (!data?.success || !data?.badge_code) {
        const actionError = new Error(data?.error || "Secure Time Clock badge could not be loaded.");
        actionError.retrySameRequest = data?.retry_same_request === true;
        actionError.confirmedServerResponse = true;
        throw actionError;
      }
      if (String(data?.badge_owner_email || "").trim().toLowerCase() &&
          String(data.badge_owner_email).trim().toLowerCase() !== requestEmail) return;
      if (rotate) clearBadgeRotationRequest(user.email, requestId);
      setBadgeCode(data.badge_code);
      setBadgeVersion(data.badge_version || null);
    } catch (err) {
      if (!stillCurrent()) return;
      if (rotate && !shouldRetainBadgeRotation(err)) clearBadgeRotationRequest(user.email, requestId);
      const apiError = err?.response?.data?.error;
      setError(apiError || err?.message || "Secure Time Clock badge could not be loaded.");
    } finally {
      if (requestSeq === badgeSeqRef.current) {
        setIsLoading(false);
        setIsReplacing(false);
      }
    }
  };

  useEffect(() => {
    if (open && user?.email && sessionToken && !badgeCode && !isLoading) {
      loadBadge();
    }
  }, [open, user?.email, sessionToken]);

  // Employee/session switch: clear the previous badge and issue a fresh read
  // when the dialog is open. Bumping the sequence also fences any in-flight
  // response belonging to the previous employee.
  useEffect(() => {
    badgeSeqRef.current += 1;
    setBadgeCode("");
    setBadgeVersion(null);
    setError("");
    if (open && user?.email && sessionToken) loadBadge();
  }, [user?.email, sessionToken]);

  if (!user?.email) return null;

  const handleDownload = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg || !badgeCode) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();

    img.onload = () => {
      canvas.width = 300;
      canvas.height = 365;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 25, 20, 250, 250);
      ctx.fillStyle = "black";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "center";
      ctx.fillText(user.full_name || user.email, canvas.width / 2, 300);
      ctx.font = "12px Arial";
      ctx.fillStyle = "#666";
      ctx.fillText("Secure Time Clock Badge", canvas.width / 2, 325);
      if (badgeVersion) ctx.fillText(`Badge v${badgeVersion}`, canvas.width / 2, 345);

      const link = document.createElement("a");
      link.download = `timeclock-badge-${user.username || user.email.split("@")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <QrCode className="w-4 h-4" />
            QR Badge
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Secure Time Clock QR Badge</DialogTitle>
            <DialogDescription>
              This badge is verified by the Time Clock server. Replacing it immediately invalidates the previous printed or saved badge.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {isLoading ? (
              <div className="h-[232px] flex flex-col items-center justify-center gap-3 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                <span className="text-sm">Loading secure badge...</span>
              </div>
            ) : badgeCode ? (
              <>
                <div ref={qrRef} className="bg-white p-4 rounded-xl shadow-inner border">
                  <QRCodeSVG value={badgeCode} size={200} level="H" includeMargin />
                </div>
                <div className="mt-3 flex items-center gap-1 text-xs text-green-700">
                  <ShieldCheck className="w-4 h-4" />
                  Server-verifiable badge{badgeVersion ? ` · v${badgeVersion}` : ""}
                </div>
              </>
            ) : (
              <div className="h-[232px] flex items-center justify-center text-sm text-gray-500 text-center px-6">
                Badge unavailable.
              </div>
            )}

            <p className="mt-4 font-semibold text-lg">{user.full_name || user.email}</p>
            <p className="text-sm text-gray-500">{user.username}</p>

            {error && (
              <div className="w-full mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={handleDownload} disabled={!badgeCode || isLoading} className="gap-2">
                <Download className="w-4 h-4" />
                Download Badge
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!sessionToken || isLoading || isReplacing}
                onClick={() => setConfirmReplace(true)}
                className="gap-2"
              >
                {isReplacing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Replace Badge
              </Button>
            </div>

            <p className="mt-4 text-xs text-gray-400 text-center max-w-xs">
              Print this badge or save it on your phone. Do not share it; anyone holding a valid badge can identify you at Quick Clock.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReplace} onOpenChange={setConfirmReplace}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Time Clock Badge?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current printed or saved QR badge will stop working immediately. Replace it only if the old badge was lost, shared, or you are ready to update every copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReplacing}>Keep Current Badge</AlertDialogCancel>
            <AlertDialogAction
              disabled={isReplacing}
              onClick={async (event) => {
                event.preventDefault();
                await loadBadge({ rotate: true });
                setConfirmReplace(false);
              }}
            >
              Replace Badge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

