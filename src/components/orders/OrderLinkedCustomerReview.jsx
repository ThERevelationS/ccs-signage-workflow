import { useEffect, useRef, useState } from 'react';
import { previewOrderCustomerDecision, commitOrderSmartsheetCustomerUnlink } from '@/components/orders/orderSaveSync';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { orderCustomerReviewRowState } from '@/components/orders/orderLinkedCustomerReviewPresentation.mjs';

// Read-only snapshot of the last authenticated Order pull; no mutation buttons
// or inferred job reassignment. Reviewers reconcile in their normal workflows.
export default function OrderLinkedCustomerReview({
  count = 0, items = [], orders = [], workOrders = [], isAdmin = false, sessionToken = '',
  canResolve = false, onResolutionApplied = null,
}) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState({});
  const [previews, setPreviews] = useState({});
  const [busyId, setBusyId] = useState('');
  const previewEpochRef = useRef(0);
  const commitInFlightRef = useRef(false);
  const [commitAttemptedIds, setCommitAttemptedIds] = useState({});
  useEffect(() => {
    // A later Sync produces new evidence; invalidate all older previews and
    // in-flight replies even when the permanent Order IDs are unchanged.
    previewEpochRef.current += 1;
    setBusyId('');
    setPreviews({});
    setChoices({});
    setCommitAttemptedIds({});
  }, [items]);
  const choose = (orderId, choice) => {
    if (commitInFlightRef.current || commitAttemptedIds[orderId]) return;
    previewEpochRef.current += 1;
    setBusyId('');
    setChoices(prev => ({ ...prev, [orderId]: choice }));
    setPreviews(prev => ({ ...prev, [orderId]: null }));
  };
  const verify = async item => {
    if (!isAdmin || !sessionToken || busyId || commitInFlightRef.current || commitAttemptedIds[item.orderId] || !choices[item.orderId]) return;
    const epoch = ++previewEpochRef.current;
    const decision = choices[item.orderId];
    setBusyId(item.orderId);
    setPreviews(prev => ({ ...prev, [item.orderId]: null }));
    try {
      const result = await previewOrderCustomerDecision({ sessionToken, review: item, decision });
      if (previewEpochRef.current === epoch) {
        setPreviews(prev => ({ ...prev, [item.orderId]: { ok: true, message: result.result } }));
      }
    } catch (error) {
      if (previewEpochRef.current === epoch) {
        setPreviews(prev => ({ ...prev, [item.orderId]: {
          ok: false, message: error?.response?.data?.error || error?.message || 'Fresh source verification failed.',
        } }));
      }
    } finally {
      if (previewEpochRef.current === epoch) setBusyId('');
    }
  };
  const applyAdoptAndUnlink = async item => {
    if (!isAdmin || !canResolve || !sessionToken || busyId || commitInFlightRef.current ||
        commitAttemptedIds[item.orderId] || choices[item.orderId] !== 'adopt_smartsheet_unlink_job' ||
        !previews[item.orderId]?.ok || orderCustomerReviewRowState(item, orders.find(order => String(order.id) === item.orderId)) !== 'matches_review') return;
    commitInFlightRef.current = true;
    // Any unknown acknowledgement forbids a second attempt from this
    // captured review. A new Sync is required to determine current state.
    setCommitAttemptedIds(prev => ({ ...prev, [item.orderId]: true }));
    const epoch = ++previewEpochRef.current;
    setBusyId(item.orderId);
    try {
      const saved = await commitOrderSmartsheetCustomerUnlink({ sessionToken, review: item });
      if (onResolutionApplied) await onResolutionApplied(saved);
      if (previewEpochRef.current === epoch) setPreviews(prev => ({
        ...prev, [item.orderId]: { ok: true, message: 'Saved in Base44 and queued for Save & Sync. The previous job was unlinked.' },
      }));
    } catch (error) {
      if (previewEpochRef.current === epoch) setPreviews(prev => ({
        ...prev, [item.orderId]: { ok: false, message: (error?.message || 'Result uncertain.') + ' Reload Orders and run a new Sync before making another decision.' },
      }));
    } finally {
      commitInFlightRef.current = false;
      if (previewEpochRef.current === epoch) setBusyId('');
    }
  };
  const closeReview = nextOpen => {
    if (!nextOpen) {
      previewEpochRef.current += 1;
      setBusyId('');
      setPreviews({});
      setChoices({});
      // Keep attempted IDs locked even after closing the review. Only a fresh
      // Sync that replaces the review evidence can unlock a new decision.
    }
    setOpen(nextOpen);
  };
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
      <Dialog open={open} onOpenChange={closeReview}>
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
                  {isAdmin && (
                    <div className="border-t pt-2 space-y-2">
                      <p className="font-semibold text-xs text-gray-700">Choose a possible resolution to verify (no changes will be applied)</p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm"
                          variant={choices[item.orderId] === 'keep_linked_job' ? 'default' : 'outline'}
                          disabled={Boolean(busyId) || Boolean(commitAttemptedIds[item.orderId])}
                          onClick={() => choose(item.orderId, 'keep_linked_job')}>
                          Keep linked job
                        </Button>
                        <Button type="button" size="sm"
                          variant={choices[item.orderId] === 'adopt_smartsheet_unlink_job' ? 'default' : 'outline'}
                          disabled={Boolean(busyId) || Boolean(commitAttemptedIds[item.orderId])}
                          onClick={() => choose(item.orderId, 'adopt_smartsheet_unlink_job')}>
                          Accept Smartsheet name and unlink job
                        </Button>
                      </div>
                      <Button type="button" size="sm" variant="outline"
                        disabled={!sessionToken || Boolean(busyId) || Boolean(commitAttemptedIds[item.orderId]) || !choices[item.orderId] || current !== 'matches_review'}
                        onClick={() => verify(item)}>
                        {busyId === item.orderId ? 'Checking fresh sources…' : 'Verify decision safely'}
                      </Button>
                      {choices[item.orderId] === 'adopt_smartsheet_unlink_job' && previews[item.orderId]?.ok &&
                        !commitAttemptedIds[item.orderId] && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 space-y-2">
                          <p className="text-xs text-amber-950">
                            Applying will replace the Base44 customer name with the verified Smartsheet value,
                            unlink the current job, and mark this Order for Save &amp; Sync.
                            No Smartsheet cell will be edited by this action.
                          </p>
                          <Button type="button" size="sm" variant="destructive"
                            disabled={!canResolve || !sessionToken || Boolean(busyId) || current !== 'matches_review'}
                            onClick={() => applyAdoptAndUnlink(item)}>
                            Apply verified choice: adopt name and unlink job
                          </Button>
                        </div>
                      )}
                      {current === 'matches_review' && previews[item.orderId] && (
                        <p className={previews[item.orderId].ok ? 'text-xs text-green-800' : 'text-xs text-red-700'}
                          role="status">
                          {previews[item.orderId].ok ? 'Fresh evidence verified — preview only. ' : 'Verification blocked — no changes made. '}
                          {previews[item.orderId].message}
                        </p>
                      )}
                    </div>
                  )}
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
            <p className="font-medium">Verification is read-only. Only the separate administrator Apply action can save the Smartsheet customer and unlink its previous job; keeping the existing link remains a manual correction path.</p>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => closeReview(false)}>Close review</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
