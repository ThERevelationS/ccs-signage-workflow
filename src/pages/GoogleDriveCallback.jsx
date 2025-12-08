import React, { useEffect, useState } from "react";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function GoogleDriveCallback() {
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Connecting to Google Drive...');

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        setStatus('error');
        setMessage(`Authorization failed: ${error}`);
        setTimeout(() => window.close(), 3000);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage(`Missing data - code: ${!!code}, state: ${!!state}`);
        setTimeout(() => window.close(), 5000);
        return;
      }

      // Call backend function directly without SDK to avoid auth requirements
      const result = await fetch('/api/functions/googleDriveAuth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exchangeCode',
          code,
          userEmail: state
        })
      });
      
      if (!result.ok) {
        const errorText = await result.text();
        setStatus('error');
        setMessage(`Server error (${result.status}): ${errorText}`);
        setTimeout(() => window.close(), 5000);
        return;
      }

      const data = await result.json();

      if (data.success) {
        setStatus('success');
        setMessage('Successfully connected to Google Drive!');
        setTimeout(() => window.close(), 2000);
      } else {
        setStatus('error');
        setMessage(`Failed: ${JSON.stringify(data)}`);
        setTimeout(() => window.close(), 5000);
      }
    } catch (err) {
      setStatus('error');
      setMessage(`Error: ${err.message}`);
      setTimeout(() => window.close(), 5000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="clay-card p-8 max-w-md text-center">
        {status === 'processing' && (
          <>
            <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Connecting...</h2>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Success!</h2>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">Error</h2>
          </>
        )}
        
        <p className="text-gray-600">{message}</p>
        <p className="text-sm text-gray-400 mt-4">This window will close automatically...</p>
      </div>
    </div>
  );
}