import React from "react";
import { useState, useCallback } from "react";

const EyeIconDropdown = React.memo(({ studyInstanceUID }) => {
  const [isOpen, setIsOpen] = useState(false);

  const viewers = [
    {
      name: 'OHIF Viewer (Local)',
      description: 'Self-hosted OHIF viewer',
      action: () => openOHIFLocal(studyInstanceUID),
      color: 'blue',
      icon: '🏠'
    },
    {
      name: 'Stone Web Viewer',
      description: 'Orthanc built-in viewer',
      action: () => openStoneViewer(studyInstanceUID),
      color: 'gray',
      icon: '🗿'
    }
  ];

  const openOHIFLocal = useCallback((studyInstanceUID) => {
    const ohifBaseURL = import.meta.env.VITE_OHIF_LOCAL_URL || 'http://localhost:4000';
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    
    // 🔐 FIXED: Add Orthanc credentials
    const orthancUsername = 'alice';
    const orthancPassword = 'alicePassword';
    
    const ohifUrl = new URL(`${ohifBaseURL}/viewer`);
    ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
    
    const dataSourceConfig = {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'Local Orthanc Server',
        name: 'orthanc',
        wadoUriRoot: `${orthancBaseURL}/wado`,
        qidoRoot: `${orthancBaseURL}/dicom-web`,
        wadoRoot: `${orthancBaseURL}/dicom-web`,
        qidoSupportsIncludeField: true,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        // 🔐 NEW: Add authentication headers
        headers: {
          'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
        },
        // 🔐 NEW: Add request options for authentication
        requestOptions: {
          auth: `${orthancUsername}:${orthancPassword}`,
          headers: {
            'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
          }
        }
      }
    };
    
    ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
    
    console.log('🏠 Opening local OHIF Viewer with authentication:', ohifUrl.toString());
    window.open(ohifUrl.toString(), '_blank');
    setIsOpen(false);
  }, []);

  const openStoneViewer = useCallback((studyInstanceUID) => {
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    
    // 🔐 FIXED: Add credentials to Stone Viewer URL
    const orthancUsername = 'alice';
    const orthancPassword = 'alicePassword';
    
    // Create URL with embedded credentials for Stone Viewer
    const orthancUrlWithAuth = orthancBaseURL.replace('http://', `http://${orthancUsername}:${orthancPassword}@`);
    const stoneUrl = `${orthancUrlWithAuth}/stone-webviewer/index.html?study=${studyInstanceUID}`;
    
    console.log('🗿 Opening Stone Web Viewer with authentication');
    window.open(stoneUrl, '_blank');
    setIsOpen(false);
  }, []);

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-1 hover:bg-blue-50 rounded flex items-center"
        title="Choose DICOM Viewer"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        {/* Dropdown arrow */}
        <svg className="h-3 w-3 ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-xl border border-gray-200 z-20">
            <div className="py-2">
              <div className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100 flex items-center">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                🔍 Choose DICOM Viewer
              </div>
              
              {viewers.map((viewer, index) => (
                <button
                  key={index}
                  onClick={() => viewer.action()}
                  className={`flex items-center w-full px-3 py-3 text-sm text-gray-700 hover:bg-${viewer.color}-50 transition-colors border-b border-gray-100 last:border-b-0`}
                >
                  <span className="text-lg mr-3">{viewer.icon}</span>
                  <div className="text-left">
                    <div className="font-medium">{viewer.name}</div>
                    <div className="text-xs text-gray-500">{viewer.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default  EyeIconDropdown;