import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { useRadiantLaunch } from '../../hooks/useRadiantLaunch';

const RadiantLaunchModal = ({ study, isOpen, onClose, onLaunchSuccess }) => {
  const [helperStatus, setHelperStatus] = useState(null);
  const [checking, setChecking] = useState(false);

  const { 
    launchStudy, 
    checkHelperStatus,
    isLaunching, 
    launchStatus 
  } = useRadiantLaunch();

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setHelperStatus(null);
      handleCheckStatus();
    }
  }, [isOpen]);

  // Check helper status
  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const status = await checkHelperStatus();
      setHelperStatus(status);
      
      if (status.success && status.data?.isRunning) {
        toast.success('✅ RadiAnt Helper is ready');
      } else {
        toast.warning('⚠️ RadiAnt Helper not accessible');
      }
    } catch (error) {
      toast.error(`Status check failed: ${error.message}`);
      setHelperStatus({ success: false, error: error.message });
    } finally {
      setChecking(false);
    }
  };

  // Launch study
  const handleLaunch = async () => {
    try {
      const result = await launchStudy(study, {
        showProgress: true,
        showSuccess: true,
        showError: true
      });

      if (result.success) {
        onLaunchSuccess?.(result);
        onClose();
      }
    } catch (error) {
      console.error('Launch failed:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">🖥️ Launch RadiAnt</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-purple-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          
          {/* Study Info - Compact */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm space-y-1">
              <div><span className="text-gray-600">Patient:</span> <span className="font-medium">{study.patientName}</span></div>
              <div><span className="text-gray-600">Modality:</span> <span className="font-medium">{study.modality}</span></div>
              <div><span className="text-gray-600">Date:</span> <span className="font-medium">{study.studyDate}</span></div>
            </div>
          </div>

          {/* Helper Status - Compact */}
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">🔍 Helper Status</h3>
              <button
                onClick={handleCheckStatus}
                disabled={checking}
                className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Refresh'}
              </button>
            </div>
            
            {helperStatus ? (
              <div className={`text-xs ${helperStatus.data?.isRunning ? 'text-green-700' : 'text-red-700'}`}>
                {helperStatus.data?.isRunning ? (
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span>Ready on localhost:8765</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span>Helper not accessible</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-600">Click refresh to check</div>
            )}
          </div>

          {/* Installation Help - Compact */}
          {helperStatus && !helperStatus.data?.isRunning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="font-medium text-yellow-800 text-sm mb-1">📥 Setup Required</h4>
              <div className="text-xs text-yellow-700 space-y-1">
                <div>1. Download RadiAnt DICOM Viewer</div>
                <div>2. Install RadiAnt Helper service</div>
                <div>3. Ensure Helper runs on port 8765</div>
                <a 
                  href="https://www.radiantviewer.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  🌐 Download here
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer - Compact */}
        <div className="bg-gray-50 px-4 py-3 rounded-b-lg flex items-center justify-between">
          
          {/* Status indicator */}
          <div className="text-xs text-gray-600">
            {launchStatus && (
              <div className="flex items-center space-x-1">
                {launchStatus === 'preparing' && (
                  <>
                    <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Preparing...</span>
                  </>
                )}
                {launchStatus === 'launching' && (
                  <>
                    <div className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Launching...</span>
                  </>
                )}
                {launchStatus === 'success' && (
                  <>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-green-600">Success!</span>
                  </>
                )}
              </div>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1 text-gray-600 border border-gray-300 rounded text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={isLaunching || (helperStatus && !helperStatus.data?.isRunning)}
              className="px-4 py-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded text-sm hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
            >
              {isLaunching ? (
                <>
                  <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Launching...</span>
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>Launch</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadiantLaunchModal;