import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { orderCustomerReviewRowState } from '@/components/orders/orderLinkedCustomerReviewPresentation.mjs';

// Read-only snapshot of the last authenticated Order pull; no mutation buttons
// or inferred job reassignment. Reviewers reconcile in their normal workflows.
export default function OrderLinkedCustomerReview({
  count = 0, items = [], orders = [], workOrders = [],
}) {
  const [open, setOpen] = useState(false);
  if (!Number.isSafeInteger(count) || count < 1) return null;

  return (
    <section className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950"
      aria-label="Held Order customer name reviews">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">
          <strong>{count} Order{count === 1 ? '' : 's'} held for customer-name review.</strong>{' '}
          Existing customer/job links and Smartsheet rows were preserved.
        </p>
        <Button type="button" size="sm" variant="outline"
          className="min-h-9 border-amber-400 bg-white text-amber-950"
          onClick={() => setOpen(true)}>
          Compare names
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order customer-name conflicts · review only</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            These values were captured during the last manual Smartsheet pull. No customer,
            Work Order link, or Smartsheet row was changed for these conflicts.
            Verify current values before deciding which source to correct.
          </p>
          <div className="space-y-3">
            {items.map((item) => {
              const local = orders.find(order => String(order.id) === item.orderId);
              const current = orderCustomerReviewRowState(item, local);
              const job = workOrders.find(workOrder => String(workOrder.id) === item.workOrderId);
              return (
                <article key={item.orderId} className="rounded-lg border border-gray-200 p-3 space-y-2">
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-gray-600">
                    <span className="break-all">Smartsheet row: <strong>{item.rowId}</strong></span>
                    <span className="break-all">Base44 Order: <strong>{item.orderId}</strong></span>
                  </div>
                  {current !== 'matches_review' && (
                    <p className="text-xs font-medium text-amber-800" role="status">
                      This Order has changed since the review or is not loaded in this view.
                      These are historical pull values; reload and verify before resolving.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="rounded-md bg-gray-50 p-2 min-w-0">
                      <p className="font-semibold text-gray-600 mb-1">Base44 customer at pull</p>
                      <p className="break-words text-gray-900">{item.localCustomerName || 'Blank'}</p>
                    </div>
                    <div className="rounded-md bg-amber-50 p-2 min-w-0">
                      <p className="font-semibold text-amber-900 mb-1">Smartsheet customer at pull</p>
                      <p className="break-words text-gray-900">{item.smartsheetCustomerName || 'Blank'}</p>
                    </div>
                    <div className="rounded-md bg-gray-50 p-2 min-w-0">
                      <p className="font-semibold text-gray-600 mb-1">Linked job in Base44</p>
                      <p className="break-words text-gray-900">
                        {job ? (job.client_name || job.title || 'Customer unavailable') : 'Job not in active-job list'}
                      </p>
                      <p className="break-all text-gray-500 mt-1">ID: {item.workOrderId}</p>
                    </div>
                  </div>
                </article>
              );
            })}
            {!items.length && (
              <p className="text-sm text-amber-900">The sync identified held rows, but comparison details were unavailable.
                Review the sync result by permanent Smartsheet row ID.</p>
            )}
          </div>
          {count > items.length && (
            <p className="text-xs text-gray-600">
              Showing {items.length} of {count} held Orders. Additional IDs are in the sync results.
            </p>
          )}
          <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
            <p><strong>Decision: keep the existing linked job.</strong> Verify the job's customer and
              correct the Smartsheet customer name through the authorized workflow.</p>
            <p><strong>Decision: change the linked job.</strong> Verify the intended active job,
              update the Order using its job picker, and follow the protected Save &amp; Sync workflow.</p>
            <p className="font-medium">This comparison does not approve or apply either decision.</p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Close review</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
