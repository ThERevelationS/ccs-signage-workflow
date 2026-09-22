import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function PermittingRepository() {
  return <Navigate to={`${createPageUrl("Permitting")}?view=jurisdictions`} replace />;
}
