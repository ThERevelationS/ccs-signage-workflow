import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2, XCircle, Loader2, Send, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { checkGmailConnection } from "@/functions/checkGmailConnection";
import { sendGmail } from "@/functions/sendGmail";

export default function GmailConnector() {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setIsLoading(true);
    try {
      const response = await checkGmailConnection();
      setIsConnected(response.data?.connected === true);
      setConnectedEmail(response.data?.email || null);
    } catch (error) {
      setIsConnected(false);
    }
    setIsLoading(false);
  };

  const handleTestEmail = async () => {
    setIsTesting(true);
    try {
      const user = await base44.auth.me();
      await sendGmail({
        to: user.email,
        subject: 'Test Email from Sign Shop Workflow',
        body: 'This is a test email to confirm your Gmail integration is working correctly.'
      });
      alert(`Test email sent to ${user.email}!`);
    } catch (error) {
      alert('Failed to send test email: ' + error.message);
    }
    setIsTesting(false);
  };

  if (isLoading) {
    return (
      <div className="clay-card p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        <span className="text-gray-500">Checking Gmail connection...</span>
      </div>
    );
  }

  return (
    <div className="clay-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: 'linear-gradient(135deg, #EA4335 0%, #FBBC05 100%)' }}>
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Gmail Integration</h4>
            <p className="text-sm text-gray-500">
              {isConnected && connectedEmail 
                ? `Connected as ${connectedEmail}` 
                : 'Send email notifications via Gmail'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <>
              <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Connected
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestEmail}
                disabled={isTesting}
                className="text-blue-600 hover:text-blue-700"
              >
                {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                {isTesting ? 'Sending...' : 'Test'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={checkConnectionStatus}
                className="text-gray-600 hover:text-gray-700"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Badge className="bg-red-100 text-red-600 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Not Connected
              </Badge>
              <p className="text-sm text-gray-500">
                Reconnect via Base44 Dashboard → App Connectors
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={checkConnectionStatus}
                className="text-gray-600 hover:text-gray-700"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}