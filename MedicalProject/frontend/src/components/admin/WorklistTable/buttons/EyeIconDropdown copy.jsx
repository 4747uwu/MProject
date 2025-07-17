import { useCallback } from 'react';
import React from 'react';

const EyeIconDropdown = React.memo(({ studyInstanceUID }) => {
  console.log('EyeIconDropdown received studyInstanceUID:', studyInstanceUID);
  console.log('Type:', typeof studyInstanceUID);
  console.log('Is truthy:', !!studyInstanceUID);

  const openOHIFLocal = useCallback((studyInstanceUID) => {
    const ohifBaseURL = import.meta.env.VITE_OHIF_LOCAL_URL || 'http://localhost:4000';
    const orthancBaseURL = import.meta.env.VITE_ORTHANC_URL || 'http://localhost:8042';
    
    // 🔐 Orthanc credentials
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
        // 🔐 Authentication headers
        headers: {
          'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
        },
        // 🔐 Request options for authentication
        requestOptions: {
          auth: `${orthancUsername}:${orthancPassword}`,
          headers: {
            'Authorization': `Basic ${btoa(`${orthancUsername}:${orthancPassword}`)}`
          }
        }
      }
    };
    
    ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
    
    console.log('🏠 Opening local OHIF Viewer:', ohifUrl.toString());
    window.open(ohifUrl.toString(), '_blank');
  }, []);

  const handleDirectClick = useCallback(() => {
    if (!studyInstanceUID) {
      console.error('Study Instance UID is required');
      return;
    }
    openOHIFLocal(studyInstanceUID);
  }, [studyInstanceUID, openOHIFLocal]);

  return (
    <button 
      onClick={handleDirectClick}
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-2 hover:bg-blue-50 rounded-full group"
      title="Open in Local OHIF Viewer"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-5 w-5 group-hover:scale-110 transition-transform" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
});

export default EyeIconDropdown;