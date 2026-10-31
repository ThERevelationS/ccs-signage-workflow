import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import ProductQueue, { flattenQueueRows } from "@/components/queues/ProductQueue";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { PageHeader } from "@/components/kit";

// CoreBridge-style module queues over the shared product operational model.
// Each tab is the same component with a different stage/due-date lens.
const QUEUES = [
  { key: "design", label: "Design", stageFilter: ["design", "estimating", "sales"], dueField: "design_due_date", title: "Design Queue" },
  { key: "production", label: "Production", stageFilter: ["production", "fabrication"], dueField: "product_due_date", title: "Production Queue" },
  { key: "fulfillment", label: "Fulfillment", stageFilter: ["installation", "completed"], dueField: "product_due_date", title: "Fulfillment Queue" },
  { key: "all", label: "All Active", stageFilter: null, dueField: "product_due_date", title: "All Active Products" },
];

export default function ProductQueues() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: workOrders = [] } = useAllWorkOrders();
  const activeParam = searchParams.get("queue");
  const active = QUEUES.some((q) => q.key === activeParam) ? activeParam : "design";
  const setActive = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("queue", key);
    return next;
  });

  useEffect(() => { document.title = "Product Queues"; }, []);

  const counts = useMemo(() => {
    const map = {};
    for (const q of QUEUES) {
      let rows = flattenQueueRows(workOrders);
      if (q.stageFilter?.length) rows = rows.filter((r) => q.stageFilter.includes(r.stage));
      map[q.key] = rows.length;
    }
    return map;
  }, [workOrders]);

  const queue = QUEUES.find((q) => q.key === active) || QUEUES[0];

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Queues" }, { label: "Product Queues" }]}
        title="Product Queues"
        subtitle="Design, production and fulfillment lenses over the shared product operational model."
        className="mb-0 px-3 pt-3"
      />
      <nav className="flex gap-1 border-b border-gray-200 bg-white px-3 pt-2">
        {QUEUES.map((q) => (
          <button type="button"
            key={q.key}
            onClick={() => setActive(q.key)}
            className={`rounded-t px-3 py-1.5 text-sm font-medium ${
              active === q.key ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {q.label}
            {counts[q.key] > 0 && (
              <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{counts[q.key]}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1">
        <ProductQueue
          key={queue.key}
          title={queue.title}
          queueLens={queue.key}
          dueField={queue.dueField}
          stageFilter={queue.stageFilter}
        />
      </div>
    </div>
  );
}