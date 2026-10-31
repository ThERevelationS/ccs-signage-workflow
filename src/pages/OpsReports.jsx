import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import OpsReportView from "@/components/reports/OpsReportView";
import { OPS_REPORT_MAP, OPS_REPORTS } from "@/components/reports/opsReportModel";

// CoreBridge-style production/operations report suite. The active report
// rides on the ?report= URL param so report links are shareable.
export default function OpsReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = searchParams.get("report");
  const active = OPS_REPORT_MAP[param] ? param : OPS_REPORTS[0].key;

  useEffect(() => { document.title = "Ops Reports"; }, []);

  const setActive = (key) => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set("report", key);
    return next;
  });

  return <OpsReportView reportKey={active} onSelect={setActive} />;
}
