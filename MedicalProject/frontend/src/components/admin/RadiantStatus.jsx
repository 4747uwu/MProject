import React, { useState, useEffect } from 'react';
import { useRadiantLaunch } from '../../hooks/useRadiantLaunch';

const RadiantStatus = ({ className = '', showDetails = false }) => {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const { checkHelperStatus } = useRadiantLaunch();

  // Check status on mount and periodically
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    setChecking(true);
    try {
      const result = await checkHelperStatus();
      setStatus(result);
    } catch (error) {
      setStatus({ success: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  const getStatusDisplay = () => {
    if (checking) {
      return { dot: 'bg-blue-500 animate-pulse', text: 'Checking' };
    }
    if (!status) {
      return { dot: 'bg-gray-400', text: 'Unknown' };
    }
    if (status.success && status.data?.isRunning) {
      return { dot: 'bg-green-500', text: 'Ready' };
    }
    return { dot: 'bg-red-500', text: 'Offline' };
  };

  const statusDisplay = getStatusDisplay();

  if (showDetails) {
    return (
      <div className={`inline-flex items-center gap-2 ${className}`}>
        {/* Status */}
        <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-md">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dot}`}></div>
          <span className="text-xs text-gray-700">{statusDisplay.text}</span>
        </div>
        
        {/* Refresh */}
        <button
          onClick={checkStatus}
          disabled={checking}
          className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
          title="Refresh"
        >
          <svg className={`w-3 h-3 text-gray-500 ${checking ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    );
  }

  // Minimal version
  return (
    <div className={`inline-flex items-center gap-1 ${className}`} title={`RadiAnt: ${statusDisplay.text}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${statusDisplay.dot}`}></div>
      <span className="text-xs text-gray-600">{statusDisplay.text}</span>
    </div>
  );
};

export default RadiantStatus;