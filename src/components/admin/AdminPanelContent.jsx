import { Component, Fragment, createRef, useRef } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ADMIN_NESTED_TABS, ADMIN_TAB_GROUPS } from "@/components/admin/adminTabNavigation";

const panelLabels = new Map([
  ...ADMIN_TAB_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab.value, tab.label])),
  ...Object.values(ADMIN_NESTED_TABS).flatMap((tabs) => tabs.map((tab) => [tab.value, tab.label])),
]);

// Only the affected panel is reset. Never display exception details, which may
// contain customer data or integration credentials, in the Admin interface.
export class AdminPanelErrorBoundary extends Component {
  state = { failed: false, retryVersion: 0 };
  retryButtonRef = createRef();
  retryRequested = false;

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps, previousState) {
    if (!this.retryRequested) return;
    if (this.state.failed) {
      // A second render failure must not strand keyboard focus on a
      // destroyed button. The fallback remains manual and retryable.
      this.retryButtonRef.current?.focus({ preventScroll: true });
    } else if (previousState.failed) {
      this.retryRequested = false;
      this.props.onRetryRecovered?.();
    }
  }

  retry = () => {
    this.retryRequested = true;
    this.setState(({ retryVersion }) => ({ failed: false, retryVersion: retryVersion + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <section role="alert" aria-label={`${this.props.label} panel failed`}
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 space-y-3">
              <div>
                <h3 className="font-semibold">{this.props.label} couldn't load</h3>
                <p className="mt-1 text-sm">
                  This Admin panel encountered an error. Other Admin sections are still available.
                  No changes were retried automatically.
                </p>
              </div>
              <button type="button" ref={this.retryButtonRef} type="button" onClick={this.retry}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-500 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry panel
              </button>
            </div>
          </div>
        </section>
      );
    }
    return <Fragment key={this.state.retryVersion}>{this.props.children}</Fragment>;
  }
}

// Preserve Radix TabsContent's controlled selection and unmount behavior,
// while containing render / lifecycle failures in the individual tab.
export default function AdminPanelContent({ value, children, className, ...props }) {
  const label = panelLabels.get(value) || value.replace(/_/g, " ");
  const panelRef = useRef(null);
  const focusSelectedTabAfterRetry = () => {
    const panel = panelRef.current;
    // Radix links each panel to its exact trigger. Only the still-active
    // destination may receive focus; never activate or write anything here.
    if (!panel || panel.getAttribute("data-state") !== "active") return;
    const triggerId = panel.getAttribute("aria-labelledby");
    const trigger = triggerId && panel.ownerDocument.getElementById(triggerId);
    if (!trigger || trigger.getAttribute("data-state") !== "active") return;
    const focused = panel.ownerDocument.activeElement;
    // A search input, another tab, or an autofocused recovery control owns
    // focus if one took it since the Retry click.
    if (focused !== panel.ownerDocument.body && focused !== panel) return;
    trigger.focus({ preventScroll: true });
    // Reveal the selected nested trigger within Admin's own scroll region,
    // without scrolling an outer page or changing selected navigation.
    const scrollArea = panel.closest("[data-admin-scroll-area]");
    if (!scrollArea) return;
    const target = trigger.getBoundingClientRect();
    const bounds = scrollArea.getBoundingClientRect();
    if (target.top < bounds.top + 8) scrollArea.scrollTop -= bounds.top + 8 - target.top;
    else if (target.bottom > bounds.bottom - 8) scrollArea.scrollTop += target.bottom - bounds.bottom + 8;
  };
  return (
    <TabsContent ref={panelRef} value={value} className={cn("w-full min-w-0 max-w-full overflow-x-auto", className)} {...props}>
      <AdminPanelErrorBoundary label={label} onRetryRecovered={focusSelectedTabAfterRetry}>{children}</AdminPanelErrorBoundary>
    </TabsContent>
  );
}
