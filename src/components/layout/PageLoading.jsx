import { Loader2 } from "lucide-react";

export default function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading page">
      <Loader2 className="h-7 w-7 animate-spin text-violet-500" />
    </div>
  );
}