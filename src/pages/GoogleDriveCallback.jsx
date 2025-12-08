import React, { useEffect, useState } from "react";
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

      setDetails(`Code: ${!!code}, State: ${state}, Error: ${error}`);

      if (error) {
        setStatus('error');
        setMessage(`Authorization failed: ${error}`);
        setTimeout(() => window.close(), 5000);
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setMessage(`Missing required parameters`);
        setTimeout(() => window.close(), 5000);
        return;
      }

      setMessage('Exchanging authorization code...');

      const response = await fetch('/api/functions/googleDriveAuth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exchangeCode',
          code: code,
          userEmail: state
        })
      });

      setDetails(`Response status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        setStatus('error');
        setMessage(`Server error (${response.status})`);
        setDetails(errorText);
        setTimeout(() => window.close(), 8000);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('Successfully connected to Google Drive!');
        setTimeout(() => window.close(), 2000);
      } else {
        setStatus('error');
        setMessage('Failed to complete authorization');
        setDetails(JSON.stringify(data, null, 2));
        setTimeout(() => window.close(), 8000);
      }
    } catch (err) {
      setStatus('error');
      setMessage(`Error: ${err.message}`);
      setDetails(err.stack || '');
      setTimeout(() => window.close(), 8000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="clay-card p-8 max-w-2xl text-center">
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
        
        <p className="text-gray-600 mb-2">{message}</p>
        {details && (
          <div className="mt-4 p-4 bg-gray-100 rounded text-left">
            <p className="text-xs font-mono text-gray-700 whitespace-pre-wrap">{details}</p>
          </div>
        )}
        <p className="text-sm text-gray-400 mt-4">This window will close automatically...</p>
      </div>
    </div>
  );
}