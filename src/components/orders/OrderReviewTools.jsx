import { useState } from "react";
import { Button } from "@/components/ui/button";
import OrderRequestorEmailReview from "@/components/orders/OrderRequestorEmailReview";
import OrderCreateAttemptReview from "@/components/orders/OrderCreateAttemptReview";
import OrderDateParityReview from "@/components/orders/OrderDateParityReview";
import OrderLinkIntegrityReview from "@/components/orders/OrderLinkIntegrityReview";

// Order Form-only diagnostics belong in the Smartsheet admin panel, never in
// the everyday purchasing toolbar. Keep the existing admin-session gate.
export default function OrderReviewTools({ sessionToken }) {
  const [emailOpen, setEmailOpen] = useState(false);
  const [attemptOpen, setAttemptOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  if (!sessionToken) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          Order Form diagnostics (admin)
        </summary>
        <p className="mt-2 text-xs text-slate-600">
          Review requestor emails, permanent Smartsheet links, uncertain sync creates, and full-sheet date parity without modifying Orders.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEmailOpen(true)}>Review emails</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(true)}>Review links</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAttemptOpen(true)}>Review sync attempts</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setDateOpen(true)}>Review dates</Button>
        </div>
      </details>
      <OrderRequestorEmailReview open={emailOpen} onOpenChange={setEmailOpen} sessionToken={sessionToken} />
      <OrderLinkIntegrityReview open={linkOpen} onOpenChange={setLinkOpen} sessionToken={sessionToken} />
      <OrderCreateAttemptReview open={attemptOpen} onOpenChange={setAttemptOpen} sessionToken={sessionToken} />
      <OrderDateParityReview open={dateOpen} onOpenChange={setDateOpen} sessionToken={sessionToken} />
    </div>
  );
}
