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

  // 🆕 NEW: Launch RadiAnt using download approach
  const handleRadiantLaunch = async () => {
    try {
      setIsLaunching(true);
      
      if (!study.orthancStudyID) {
        toast.error('Orthanc Study ID not found - cannot launch RadiAnt Viewer');
        return;
      }

      console.log('🚀 Launching RadiAnt via download for study:', study.orthancStudyID);
      
      // Show loading toast
      const loadingToast = toast.loading(
        `📡 Preparing RadiAnt launcher...`,
        {
          duration: 10000,
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontWeight: '600'
          }
        }
      );

      try {
        // Option 1: Generate and download launcher file
        const launcherUrl = `${import.meta.env.VITE_BACKEND_URL}/api/orthanc-proxy/studies/${study.orthancStudyID}/launcher?launcherType=bat&downloadType=archive`;
        
        // Create download link
        const link = document.createElement('a');
        link.href = launcherUrl;
        link.download = `radiant-launcher-${study.orthancStudyID}.bat`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.dismiss(loadingToast);
        
        // Show success message with instructions
        toast.success(
          (t) => (
            <div className="text-sm">
              <div className="font-semibold mb-2">🚀 RadiAnt Launcher Downloaded!</div>
              <div className="space-y-1 text-xs">
                <div>📁 Check your Downloads folder</div>
                <div>🖱️ Double-click the .bat file to launch</div>
                <div>⏳ RadiAnt will open automatically</div>
              </div>
              <button 
                onClick={() => toast.dismiss(t.id)}
                className="mt-2 text-xs bg-white bg-opacity-20 px-2 py-1 rounded"
              >
                Got it!
              </button>
            </div>
          ),
          {
            duration: 8000,
            icon: '🎉',
            style: {
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              fontWeight: '600'
            }
          }
        );

        onLaunchSuccess?.({ method: 'download', studyId: study.orthancStudyID });

      } catch (error) {
        toast.dismiss(loadingToast);
        throw error;
      }

    } catch (error) {
      console.error('Error launching RadiAnt:', error);
      toast.dismiss();
      
      toast.error(
        `Failed to generate RadiAnt launcher: ${error.message}`,
        {
          duration: 6000,
          icon: '❌'
        }
      );
      
    } finally {
      setIsLaunching(false);
    }
  };

  // 🆕 NEW: Alternative - Direct URL approach
  const handleDirectUrlLaunch = async () => {
    try {
      // Get study instances
      const response = await api.get(`/orthanc-proxy/studies/${study.orthancStudyID}/instances`);
      
      if (response.data.success && response.data.data.primaryInstanceUrl) {
        // Try to launch via custom protocol (if registered)
        const protocolUrl = `radiant://open?url=${encodeURIComponent(response.data.data.studyArchiveUrl)}`;
        
        console.log('🔗 Attempting protocol launch:', protocolUrl);
        
        const link = document.createElement('a');
        link.href = protocolUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success('🖥️ RadiAnt protocol launched', { duration: 4000 });
      }
    } catch (error) {
      console.error('Direct URL launch failed:', error);
      // Fallback to file download approach
      handleRadiantLaunch();
    }
  };

  // Update the button onClick to use the new method
  const handleClick = () => {
    handleRadiantLaunch(); // Use the download approach
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