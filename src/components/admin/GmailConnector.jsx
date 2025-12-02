import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { gmailAuthInitiate } from "@/functions/gmailAuthInitiate";

export default function GmailConnector() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    checkConnectionStatus();

    // Listen for successful connection from popup
    const handleMessage = (event) => {
      if (event.data === 'gmail_connected') {
        setIsConnected(true);
        setIsConnecting(false);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkConnectionStatus = async () => {
    setIsLoading(true);
    const user = await base44.auth.me();
    setIsConnected(user?.gmail_connected === true);
    setIsLoading(false);
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    const response = await gmailAuthInitiate();
    if (response.data?.authUrl) {
      // Open in popup
      const popup = window.open(
        response.data.authUrl,
        'Gmail Authorization',
        'width=500,height=600,scrollbars=yes'
      );
      
      // Check if popup was blocked
      if (!popup) {
        alert('Please allow popups to connect Gmail');
        setIsConnecting(false);
      }
    } else {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await base44.auth.updateMe({
      gmail_connected: false,
      gmail_refresh_token: null
    });
    setIsConnected(false);
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
            <p className="text-sm text-gray-500">Send email notifications via your Gmail account</p>
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
                onClick={handleDisconnect}
                className="text-red-600 hover:text-red-700"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Badge className="bg-gray-100 text-gray-600 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Not Connected
              </Badge>
              <Button
                onClick={handleConnect}
                disabled={isConnecting}
                className="clay-button border-none"
                style={{ background: 'linear-gradient(135deg, #EA4335 0%, #FBBC05 100%)' }}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Connect Gmail
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}