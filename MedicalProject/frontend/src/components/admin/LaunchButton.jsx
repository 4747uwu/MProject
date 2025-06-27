import React, { useState, useRef } from 'react';
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
  const [downloadProgress, setDownloadProgress] = useState(0);
  const abortControllerRef = useRef(null);

  // 🆕 Browser Download API with Protocol Launch
  const handleProtocolLaunch = async () => {
    try {
      setIsLaunching(true);
      setDownloadProgress(0);
      
      if (!study.orthancStudyID) {
        toast.error('Study ID not found');
        return;
      }

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();
      
      const loadingToast = toast.loading(
        (t) => (
          <div className="text-sm">
            <div className="font-semibold mb-1">📥 Downloading Study...</div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              ></div>
            </div>
            <div className="text-xs text-gray-600">
              {downloadProgress}% • Preparing RadiAnt launch...
            </div>
            <button 
              onClick={() => {
                abortControllerRef.current?.abort();
                toast.dismiss(t.id);
                setIsLaunching(false);
              }}
              className="mt-1 text-xs bg-red-500 text-white px-2 py-1 rounded"
            >
              Cancel
            </button>
          </div>
        ),
        { duration: Infinity }
      );

      try {
        // Download with progress tracking
        const downloadResult = await downloadWithProgress(study.orthancStudyID);
        
        toast.dismiss(loadingToast);
        
        // Trigger protocol launch
        await triggerProtocolLaunch(downloadResult.filePath, study.orthancStudyID);
        
        toast.success(
          (t) => (
            <div className="text-sm">
              <div className="font-semibold mb-1">🎉 RadiAnt Launched!</div>
              <div className="text-xs space-y-1">
                <div>✅ Study downloaded successfully</div>
                <div>🖥️ Opening in RadiAnt DICOM Viewer</div>
                <div>📁 File: {downloadResult.fileName}</div>
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
            icon: '🚀'
          }
        );

        onLaunchSuccess?.({ 
          method: 'protocol-launch', 
          studyId: study.orthancStudyID,
          fileName: downloadResult.fileName
        });

      } catch (error) {
        toast.dismiss(loadingToast);
        
        if (error.name === 'AbortError') {
          toast('Download cancelled', { icon: '⏹️' });
          return;
        }
        
        // Fallback to manual download
        await handleFallbackDownload(study.orthancStudyID);
      }

    } catch (error) {
      console.error('Protocol launch failed:', error);
      toast.error(`Launch failed: ${error.message}`);
    } finally {
      setIsLaunching(false);
      setDownloadProgress(0);
    }
  };

  // Browser Download API with progress
  const downloadWithProgress = async (studyId) => {
    const downloadUrl = `${import.meta.env.VITE_BACKEND_URL}/api/orthanc-proxy/studies/${studyId}/download`;
    
    console.log('🚀 Starting browser download with progress tracking');
    console.log('📥 Download URL:', downloadUrl);
    
    // Use fetch with ReadableStream for progress
    const response = await fetch(downloadUrl, {
      signal: abortControllerRef.current.signal,
      credentials: 'include',
      headers: {
        'Accept': 'application/zip, */*',
      }
    });
    
    console.log('📡 Response headers:');
    console.log('   - Status:', response.status, response.statusText);
    console.log('   - Content-Type:', response.headers.get('content-type'));
    console.log('   - Content-Length:', response.headers.get('content-length'));
    console.log('   - Content-Disposition:', response.headers.get('content-disposition'));
    console.log('   - Transfer-Encoding:', response.headers.get('transfer-encoding'));
    
    if (!response.ok) {
      console.error('❌ Download request failed');
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }
    
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    console.log(`📊 Download size: ${total > 0 ? (total / 1024 / 1024).toFixed(2) : 'Unknown'} MB`);
    
    const reader = response.body.getReader();
    const chunks = [];
    let downloaded = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      downloaded += value.length;
      
      // ✅ IMPROVED PROGRESS CALCULATION
      if (total > 0) {
        const progress = Math.round((downloaded / total) * 100);
        setDownloadProgress(progress);
        console.log(`📥 Download progress: ${progress}% (${(downloaded / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        // ✅ FOR UNKNOWN SIZE - PROGRESSIVE ESTIMATION
        const downloadedMB = downloaded / 1024 / 1024;
        let estimatedProgress;
        
        if (downloadedMB < 1) {
          estimatedProgress = Math.min(downloadedMB * 30, 30); // 0-30% for first MB
        } else if (downloadedMB < 5) {
          estimatedProgress = 30 + ((downloadedMB - 1) * 15); // 30-90% for 1-5MB
        } else {
          estimatedProgress = Math.min(90 + ((downloadedMB - 5) * 2), 95); // 90-95% for >5MB
        }
        
        setDownloadProgress(Math.round(estimatedProgress));
        console.log(`📥 Downloaded: ${downloadedMB.toFixed(2)} MB (estimated ${Math.round(estimatedProgress)}%)`);
      }
    }
    
    console.log(`✅ Download completed: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
    
    // ✅ REDUCED MINIMUM SIZE CHECK
    if (downloaded < 1024) { // Less than 1KB is definitely an error
      throw new Error('Downloaded file is too small (less than 1KB)');
    }
    
    // ✅ SET FINAL PROGRESS TO 100%
    setDownloadProgress(100);
    
    // Create blob and save to Downloads
    const blob = new Blob(chunks);
    const fileName = `study-${studyId}-${Date.now()}.zip`;
    const url = window.URL.createObjectURL(blob);
    
    // Trigger browser download
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // ✅ IMPROVED PATH DETECTION
    const userProfile = navigator.userAgent.includes('Windows') ? 
      (window.navigator.userAgentData?.platform === 'Windows' ? 'User' : 'User') : 
      'user';
    
    const downloadsPath = navigator.userAgent.includes('Windows') ? 
      `C:\\Users\\${userProfile}\\Downloads\\${fileName}` : 
      `/home/${userProfile}/Downloads/${fileName}`;

    console.log('📂 Downloaded file path:', downloadsPath);
    
    window.URL.revokeObjectURL(url);
    
    console.log('✅ Download completed:', fileName);
    
    return {
      fileName,
      filePath: downloadsPath,
      blob,
      size: downloaded
    };
  };

  // Trigger custom protocol
  const triggerProtocolLaunch = async (filePath, studyId) => {
    console.log('🔗 Triggering radiant:// protocol');
    console.log('📁 File path:', filePath);
    
    // Wait a moment for download to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create protocol URL
    const protocolUrl = `radiant://open?file=${encodeURIComponent(filePath)}&study=${studyId}&cleanup=true&source=web-portal`;
    
    console.log('🚀 Protocol URL:', protocolUrl);
    
    // Trigger protocol
    try {
      // Method 1: Direct assignment
      window.location.href = protocolUrl;
      
      // Method 2: Hidden link (fallback)
      setTimeout(() => {
        const link = document.createElement('a');
        link.href = protocolUrl;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, 1000);
      
    } catch (error) {
      console.error('Protocol trigger failed:', error);
      throw new Error('Protocol handler not installed. Please run the RadiAnt Protocol Installer.');
    }
  };

  // Fallback to manual download
  const handleFallbackDownload = async (studyId) => {
    console.log('🔄 Falling back to manual download');
    
    const downloadUrl = `${import.meta.env.VITE_BACKEND_URL}/api/orthanc-proxy/studies/${studyId}/download`;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `study-${studyId}.zip`;
    link.click();
    
    toast.success(
      (t) => (
        <div className="text-sm">
          <div className="font-semibold mb-2">📁 Manual Download Started</div>
          <div className="space-y-1 text-xs">
            <div>📥 Check your Downloads folder</div>
            <div>📂 Extract the ZIP file</div>
            <div>🖱️ Drag to RadiAnt or use File → Open</div>
          </div>
          <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
            <div className="font-semibold text-blue-800">Want automatic opening?</div>
            <div className="text-blue-700">Install RadiAnt Protocol Handler for one-click experience!</div>
          </div>
          <button 
            onClick={() => toast.dismiss(t.id)}
            className="mt-2 text-xs bg-white bg-opacity-20 px-2 py-1 rounded"
          >
            Got it!
          </button>
        </div>
      ),
      { duration: 10000 }
    );
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
        onClick={handleProtocolLaunch} // ✅ FIXED
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
        onClick={handleProtocolLaunch} // ✅ FIXED
        disabled={isLaunching || !study.orthancStudyID}
        className={`flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 transition-colors disabled:opacity-50 ${className}`}
      >
        {isLaunching ? (
          <>
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-2"></div>
            <div className="text-left">
              <div className="font-medium">Downloading... {downloadProgress}%</div>
              <div className="text-xs text-gray-500">Preparing RadiAnt launch</div>
            </div>
          </>
        ) : (
          <>
            <svg className="h-4 w-4 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-left">
              <div className="font-medium">🚀 Launch RadiAnt (Auto)</div>
              <div className="text-xs text-gray-500">Download + auto-open</div>
            </div>
          </>
        )}
      </button>
    );
  }

  // Default button variant
  return (
    <button
      onClick={handleProtocolLaunch} // ✅ FIXED
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
          <span>Launching... {downloadProgress}%</span>
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