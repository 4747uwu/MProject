import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const LaunchButton = ({ 
  study, 
  variant = 'button', // 'button', 'dropdown-item', 'icon'
  size = 'md', // 'sm', 'md', 'lg'
  showModal = false, // 🔧 Changed default to false for direct launch
  onLaunchSuccess,
  className = ''
}) => {
  const [isLaunching, setIsLaunching] = useState(false);

  // 🆕 NEW: Launch RadiAnt using C-STORE backend
  const handleCStoreLaunch = async () => {
    try {
      setIsLaunching(true);
      
      if (!study.orthancStudyID) {
        toast.error('Orthanc Study ID not found - cannot launch RadiAnt Viewer');
        return;
      }

      console.log('🚀 Launching RadiAnt via C-STORE for study:', study.orthancStudyID);
      
      // Show loading toast
      const loadingToast = toast.loading(
        `📡 Sending study to RadiAnt Viewer...`,
        {
          duration: 15000,
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontWeight: '600'
          }
        }
      );

      // Call backend C-STORE endpoint
      const response = await api.post(`/orthanc-proxy/study/${study.orthancStudyID}/cstore`, {
        patientName: study.patientName || 'Unknown Patient',
        // 🔧 Client IP will be auto-detected by backend
        // You can add manual IP override here if needed:
        // clientIp: '192.168.1.100', // Optional: override auto-detection
        // clientPort: 11112,         // Optional: custom port
        // remoteAeTitle: 'RADIANT'   // Optional: custom AE title
      });

      toast.dismiss(loadingToast);

      if (response.data.success) {
        // Show success message with details
        toast.success(
          `🖥️ RadiAnt launched successfully!\n📁 ${response.data.data.filesCount} files sent in ${response.data.data.transferTime}`,
          {
            duration: 6000,
            icon: '🚀',
            style: {
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              fontWeight: '600'
            }
          }
        );

        // Show additional info
        setTimeout(() => {
          toast(
            `📡 Study sent to ${response.data.data.clientIp}:${response.data.data.clientPort}`,
            {
              duration: 4000,
              icon: '📊',
              style: {
                background: '#f0f9ff',
                color: '#0369a1',
                border: '1px solid #0ea5e9'
              }
            }
          );
        }, 1000);

        onLaunchSuccess?.(response.data);
      } else {
        throw new Error(response.data.message || 'Failed to launch RadiAnt');
      }

    } catch (error) {
      console.error('Error launching RadiAnt via C-STORE:', error);
      toast.dismiss();
      
      // Enhanced error handling
      let errorMessage = 'Failed to launch RadiAnt Viewer';
      
      if (error.response?.status === 400) {
        errorMessage = error.response.data.message || 'Invalid request - check RadiAnt configuration';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error - RadiAnt may not be running or not configured for DICOM';
      } else if (error.message.includes('network')) {
        errorMessage = 'Network error - check connection to RadiAnt';
      }
      
      toast.error(errorMessage, {
        duration: 8000,
        icon: '❌',
        style: {
          background: '#fef2f2',
          color: '#dc2626',
          border: '1px solid #fca5a5'
        }
      });

      // Show troubleshooting tips for common issues
      if (error.response?.status === 400 && error.response.data.message?.includes('IP address')) {
        setTimeout(() => {
          toast(
            '💡 Tip: Ensure RadiAnt is running and DICOM server is enabled (Tools → Options → DICOM Server)',
            {
              duration: 10000,
              icon: '💡',
              style: {
                background: '#fffbeb',
                color: '#d97706',
                border: '1px solid #fbbf24'
              }
            }
          );
        }, 2000);
      }
      
    } finally {
      setIsLaunching(false);
    }
  };

  // 🔧 FALLBACK: Registry protocol launch (if C-STORE fails)
  const handleRegistryLaunch = async () => {
    try {
      const protocolUrl = `radiant://launch?studyId=${study.orthancStudyID}&patientName=${encodeURIComponent(study.patientName || 'Unknown')}`;
      
      console.log('🔄 Fallback: Launching RadiAnt with registry protocol:', protocolUrl);
      
      const link = document.createElement('a');
      link.href = protocolUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('🖥️ RadiAnt protocol launched (fallback method)', {
        duration: 4000,
        style: {
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white'
        }
      });

    } catch (error) {
      console.error('Registry launch failed:', error);
      toast.error('Both C-STORE and registry launch failed');
    }
  };

  // 🆕 NEW: Test connection before launching
  const handleTestAndLaunch = async () => {
    try {
      setIsLaunching(true);
      
      // First test the connection
      toast.loading('🔍 Testing RadiAnt connection...', { duration: 5000 });
      
      try {
        await api.post('/api/orthanc/test-connection', {
          // Let backend auto-detect IP or add manual override here
        });
        
        toast.dismiss();
        toast.success('✅ Connection test passed', { duration: 2000 });
        
        // Wait a moment then launch
        setTimeout(() => {
          handleCStoreLaunch();
        }, 1000);
        
      } catch (testError) {
        toast.dismiss();
        console.warn('Connection test failed, trying direct launch:', testError);
        
        // If test fails, try direct launch anyway
        toast('⚠️ Connection test failed, attempting direct launch...', {
          duration: 3000,
          icon: '🔄'
        });
        
        await handleCStoreLaunch();
      }
      
    } catch (error) {
      console.error('Test and launch failed:', error);
      setIsLaunching(false);
    }
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base'
  };

  // Variant rendering
  if (variant === 'icon') {
    return (
      <button
        onClick={handleCStoreLaunch}
        disabled={isLaunching || !study.orthancStudyID}
        className={`text-purple-600 hover:text-purple-800 transition-colors p-1 hover:bg-purple-50 rounded ${className}`}
        title="Launch in RadiAnt Desktop Viewer via C-STORE"
      >
        {isLaunching ? (
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </button>
    );
  }

  if (variant === 'dropdown-item') {
    return (
      <button
        onClick={handleCStoreLaunch}
        disabled={isLaunching || !study.orthancStudyID}
        className={`flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 transition-colors disabled:opacity-50 ${className}`}
      >
        {isLaunching ? (
          <>
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2"></div>
            <div className="text-left">
              <div className="font-medium">Sending to RadiAnt...</div>
              <div className="text-xs text-gray-500">Please wait while we transfer files</div>
            </div>
          </>
        ) : (
          <>
            <svg className="h-4 w-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-left">
              <div className="font-medium">🚀 Launch RadiAnt Desktop</div>
              <div className="text-xs text-gray-500">Send via DICOM C-STORE</div>
            </div>
          </>
        )}
      </button>
    );
  }

  // Default button variant
  return (
    <button
      onClick={handleCStoreLaunch}
      disabled={isLaunching || !study.orthancStudyID}
      className={`
        inline-flex items-center justify-center font-medium rounded-md transition-colors
        ${sizeClasses[size]}
        ${isLaunching 
          ? 'bg-purple-300 text-white cursor-not-allowed' 
          : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
        }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isLaunching ? (
        <>
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
          <span>Sending to RadiAnt...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>🚀 Launch RadiAnt</span>
        </>
      )}
    </button>
  );
};

export default LaunchButton;