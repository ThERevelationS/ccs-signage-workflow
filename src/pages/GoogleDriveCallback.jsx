import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function GoogleDriveCallback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting to Google Drive...');
  const [details, setDetails] = useState('');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      setDetails(`Code: ${code?.substring(0, 20)}...\nState (email): ${state}\nError: ${error || 'none'}`);

      if (error) {
        setStatus('error');
        setMessage(`Authorization failed: ${error}`);
        setTimeout(() => window.close(), 5000);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage('Missing authorization code or state');
        setTimeout(() => window.close(), 5000);
        return;
      }

      setMessage('Saving connection...');

      const result = await base44.functions.invoke('googleDriveAuth', {
        action: 'exchangeCode',
        code: code,
        userEmail: state
      });

      setDetails(prev => prev + `\n\nResponse: ${JSON.stringify(result.data, null, 2)}`);

      if (result.data.success) {
        setStatus('success');
        setMessage('Successfully connected to Google Drive!');
        setTimeout(() => window.close(), 2000);
      } else {
        setStatus('error');
        setMessage('Failed to save connection');
        setTimeout(() => window.close(), 8000);
      }
    } catch (err) {
      setStatus('error');
      setMessage(`Connection error`);
      setDetails(prev => prev + `\n\nError: ${err.message}`);
      setTimeout(() => window.close(), 8000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="clay-card p-8 max-w-2xl w-full">
        {status === 'processing' && (
          <div className="text-center">
            <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Connecting...</h2>
          </div>
        )}
        
        {status === 'success' && (
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Success!</h2>
          </div>
        )}
        
        {status === 'error' && (
          <div className="text-center">
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          </div>
        )}
        
        <p className="text-gray-600 text-center mb-2">{message}</p>
        {details && (
          <div className="mt-4 p-4 bg-gray-100 rounded text-left max-h-96 overflow-auto">
            <p className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">{details}</p>
          </div>
        )}
        <p className="text-sm text-gray-400 text-center mt-4">This window will close automatically...</p>
      </div>
    </div>
  );
}