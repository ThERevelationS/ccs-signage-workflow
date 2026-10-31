import { useEffect } from "react";
import CrmEventsQueue from "@/components/crm/CrmEventsQueue";

// Typed CRM event queue — the CoreBridge "CRM Events" equivalent. Contact
// events (calls, e-mails, visits, consultations) live as typed rows on
// OpportunityActivity; this page is their open-work queue with the same
// filter/pagination conventions as the product queues.
export default function CrmEvents() {
  useEffect(() => { document.title = "CRM Events"; }, []);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <CrmEventsQueue title="CRM Event Queue" />
      </div>
    </div>
  );
}
