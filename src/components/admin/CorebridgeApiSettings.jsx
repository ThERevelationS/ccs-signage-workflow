import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RefreshCw, Zap } from "lucide-react";
import {
  getCorebridgeApiAccountSummary,
  getCorebridgeApiStatus,
  testCorebridgeApiConnection,
} from "@/components/admin/corebridgeApiPersistence";

export default function CorebridgeApiSettings({ sessionToken }) {
  const [apiStatus, setApiStatus] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiTestResult, setApiTestResult] = useState(null);
  const [apiAccount, setApiAccount] = useState(null);

  const loadApiStatus = async () => {
    if (!sessionToken) return;
    setApiLoading(true);
    setApiError("");
    try {
      const status = await getCorebridgeApiStatus({ sessionToken });
      setApiStatus(status);
    } catch (err) {
      console.error("Error loading CoreBridge API status:", err);
      setApiError(err?.message || "CoreBridge API status could not be loaded safely.");
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    loadApiStatus();
  }, [sessionToken]);

  const handleApiTest = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiError("");
    setApiTestResult(null);
    try {
      const result = await testCorebridgeApiConnection({ sessionToken });
      setApiTestResult(result);
      await loadApiStatus();
    } catch (err) {
      console.error("CoreBridge API connection test failed:", err);
      setApiError(err?.message || "CoreBridge API connection test failed.");
    } finally {
      setApiLoading(false);
    }
  };

  const handleApiAccount = async () => {
    if (!sessionToken || apiLoading) return;
    setApiLoading(true);
    setApiError("");
    setApiAccount(null);
    try {
      const result = await getCorebridgeApiAccountSummary({ sessionToken });
      setApiAccount(result?.account || null);
    } catch (err) {
      console.error("CoreBridge API account lookup failed:", err);
      setApiError(err?.message || "CoreBridge API account lookup failed.");
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="clay-card p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                CoreBridge API v3
              </h2>
              <Badge className="bg-blue-100 text-blue-700">READ ONLY</Badge>
              {apiStatus && (
                <Badge className={apiStatus.configured ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                  {apiStatus.configured ? "Credentials configured" : "Needs credentials"}
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Direct server-side CoreBridge integration. The retired Gmail importer is no longer used.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={loadApiStatus} disabled={apiLoading || !sessionToken}>
              {apiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
            <Button type="button" size="sm" onClick={handleApiTest} disabled={apiLoading || !apiStatus?.configured}>
              Test Connection
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleApiAccount} disabled={apiLoading || !apiStatus?.configured}>
              API Account
            </Button>
          </div>
        </div>

        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {apiError}
          </div>
        )}

        {apiStatus && !apiStatus.configured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 space-y-1">
            <div>Add both Base44 app secrets before live testing:</div>
            <div><code className="font-mono">COREBRIDGE_SUBSCRIPTION_KEY</code></div>
            <div><code className="font-mono">COREBRIDGE_AUTHENTICATION_TOKEN</code></div>
            <div className="text-xs mt-2">Do not paste either secret into source code, entities, browser fields, logs, or chat.</div>
          </div>
        )}

        {apiStatus && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-white/60 p-3">
              <div className="text-xs text-gray-500">Documented operations</div>
              <div className="text-xl font-semibold text-gray-800">
                {(apiStatus.capabilities || []).reduce((sum, item) => sum + Number(item.operations || 0), 0)}
              </div>
            </div>
            <div className="rounded-lg border bg-white/60 p-3">
              <div className="text-xs text-gray-500">Loaded API specifications</div>
              <div className="text-xl font-semibold text-gray-800">
                {(apiStatus.capabilities || []).filter((item) => Number.isFinite(item.operations)).length}
              </div>
            </div>
            <div className="rounded-lg border bg-white/60 p-3">
              <div className="text-xs text-gray-500">Write access through CCS</div>
              <div className="text-xl font-semibold text-gray-800">Disabled</div>
            </div>
          </div>
        )}

        {apiStatus?.capabilities?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {apiStatus.capabilities.map((item) => (
              <Badge key={item.family} variant="outline" className="bg-white/60">
                {item.title}: {item.operations ?? "spec pending"}
              </Badge>
            ))}
          </div>
        )}

        {apiTestResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            CoreBridge accepted the configured credentials. Account validation: HTTP {apiTestResult.account_validate_http_status}; API status: HTTP {apiTestResult.api_server_http_status}.
          </div>
        )}

        {apiAccount && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <div className="font-medium">Connected API identity</div>
            <div className="mt-1 text-xs">
              {apiAccount.long_name || apiAccount.short_name || apiAccount.user_name || "CoreBridge user"}
              {apiAccount.business_id != null ? ` • Business ID ${apiAccount.business_id}` : ""}
              {apiAccount.user_name ? ` • ${apiAccount.user_name}` : ""}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white/60 p-4 text-sm text-gray-600">
        Historical CoreBridge email-import records remain preserved for audit purposes, but the email importer itself is retired and no longer runs.
      </div>
    </div>
  );
}
