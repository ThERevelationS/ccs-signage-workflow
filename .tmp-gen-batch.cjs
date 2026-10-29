const fs = require('fs');

const out = {
  '.tmp-b-MyWorkflow.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";\nimport { Skeleton } from "@/components/ui/skeleton";',
    },
    {
      old_text: '  if (isLoading) {\n    return (\n      <div className="flex items-center justify-center p-8">\n        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />\n      </div>\n    );\n  }',
      new_text: '  if (isLoading) {\n    return (\n      <div className="p-6">\n        <div className="mb-6 space-y-2">\n          <Skeleton className="h-8 w-56" />\n          <Skeleton className="h-4 w-80" />\n        </div>\n        <ListSkeleton rows={8} />\n      </div>\n    );\n  }',
    },
  ],
  '.tmp-b-ReportingDashboard.json': [
    {
      old_text: 'import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";',
      new_text: 'import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";\nimport { Skeleton } from "@/components/ui/skeleton";',
    },
    {
      old_text: '  if (loading) {\n    return (\n      <div className="flex items-center justify-center h-full min-h-96">\n        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />\n      </div>\n    );\n  }',
      new_text: '  if (loading) {\n    return (\n      <div className="p-6 space-y-6">\n        <div className="space-y-2">\n          <Skeleton className="h-8 w-64" />\n          <Skeleton className="h-4 w-96" />\n        </div>\n        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">\n          <Skeleton className="h-28 rounded-xl" />\n          <Skeleton className="h-28 rounded-xl" />\n          <Skeleton className="h-28 rounded-xl" />\n          <Skeleton className="h-28 rounded-xl" />\n        </div>\n        <Skeleton className="h-72 w-full rounded-xl" />\n      </div>\n    );\n  }',
    },
  ],
  '.tmp-b-Financials.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" /></div>;',
      new_text: '  if (loading) return <ListSkeleton rows={5} />;',
    },
  ],
  '.tmp-b-CompletedReports.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '          <div className="clay-card p-12 text-center">\n            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />\n          </div>',
      new_text: '          <ListSkeleton rows={6} />',
    },
  ],
  '.tmp-b-FeatureReports.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '          <div className="clay-card p-12 text-center">\n            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />\n          </div>',
      new_text: '          <ListSkeleton rows={6} />',
    },
  ],
  '.tmp-b-ChangeOrders.json': [
    {
      old_text: 'import { useAuth } from "@/components/auth/EmailGate";',
      new_text: 'import { useAuth } from "@/components/auth/EmailGate";\nimport { ListSkeleton } from "@/components/ui/list-skeleton";',
    },
    {
      old_text: '          <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading…</div>',
      new_text: '          <ListSkeleton rows={3} />',
    },
  ],
};

for (const [file, e] of Object.entries(out)) fs.writeFileSync(file, JSON.stringify(e));
console.log('ok');
