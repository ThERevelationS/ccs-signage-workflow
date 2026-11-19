import { useState } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { DatabaseZap, History, Loader2, Paperclip, ShieldAlert, Wand2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader } from "@/components/kit";
import MigrationWizard from "@/components/migration/MigrationWizard";
import { MigrationBatchesPanel } from "@/components/migration/MigrationBatchesPanel";
import { MigrationAttachmentsPanel } from "@/components/migration/MigrationAttachmentsPanel";

// CoreBridge CSV migration -- admin-only wizard backed by the manageMigration
// function (LegacyMigrationMap ledger). Upload a CB CSV export, map columns,
// dry-run, run the chunked import, then report / roll back by batch.
export default function CbMigration() {
  const { currentUser, isRegistered, isLoading, sessionToken, showLoginDialog } = useAuth();
  const [tab, setTab] = useState("wizard");
  const [focusBatch, setFocusBatch] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const openBatchReport = (batchId) => {
    setFocusBatch({ batch_id: batchId, nonce: Date.now() });
    setTab("wizard");
  };

  // Admin-gated like Imports.jsx: every manageMigration action requires the
  // admin role server-side, so the whole page is hidden from everyone else.
  if (currentUser && currentUser.role !== "admin") {
    return (
      <EmptyState
        icon={ShieldAlert}
        className="mx-auto max-w-3xl px-4 py-10"
        title="Administrators only"
        message="CoreBridge migrations write core customer, order, and financial records. Ask an administrator to run them."
      />
    );
  }

  if (!isRegistered && !isLoading) {
    return (
      <EmptyState
        icon={ShieldAlert}
        className="mx-auto max-w-3xl px-4 py-10"
        title="Sign in to run migrations."
        message="Migration batches are attributed to the signed-in administrator."
        action={(
          <button
            type="button"
            onClick={showLoginDialog}
            className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
          >
            Sign in
          </button>
        )}
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <PageHeader
        breadcrumbs={[{ label: "Tools", to: "/EstimatorTools" }, { label: "Migration" }]}
        icon={DatabaseZap}
        title="CoreBridge Migration"
        subtitle="Import CoreBridge CSV exports -- customers, orders, invoices, and more -- with mapping, dry-run, and rollback."
      />

      {isLoading ? (
        <div className="flex items-center justify-center p-10 text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-[32px]">
            <TabsTrigger value="wizard" className="text-[11px]">
              <Wand2 className="mr-1 h-3.5 w-3.5" /> Import wizard
            </TabsTrigger>
            <TabsTrigger value="batches" className="text-[11px]">
              <History className="mr-1 h-3.5 w-3.5" /> Batches
            </TabsTrigger>
            <TabsTrigger value="attachments" className="text-[11px]">
              <Paperclip className="mr-1 h-3.5 w-3.5" /> Attachments
            </TabsTrigger>
          </TabsList>
          <TabsContent value="wizard" className="mt-4">
            <MigrationWizard
              sessionToken={sessionToken}
              focusBatch={focusBatch}
              onBatchChanged={() => setReloadKey((k) => k + 1)}
            />
          </TabsContent>
          <TabsContent value="batches" className="mt-4">
            <MigrationBatchesPanel
              sessionToken={sessionToken}
              onOpenReport={openBatchReport}
              reloadKey={reloadKey}
            />
          </TabsContent>
          <TabsContent value="attachments" className="mt-4">
            <MigrationAttachmentsPanel />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
