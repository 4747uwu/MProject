import { useCallback, useState } from 'react';
import React from 'react';
import api from '../../../../services/api';
import { toast } from 'react-hot-toast';

const EyeIconDropdown = React.memo(({ studyInstanceUID, userRole, study }) => {
  const [restoring, setRestoring] = useState(false);

  const updateStudyInteractionStatus = useCallback(async (action) => {
    try {
      if (userRole === 'doctor') {
        const response = await api.put(
          `/admin/studies/${studyInstanceUID}/interaction`,
          { action }
        );
        console.log(`✅ Study interaction recorded: ${action}`, response.data);
      }
    } catch (error) {
      console.error('Error updating study interaction status:', error);
    }
  }, [studyInstanceUID, userRole]);

  // Returns true if study was uploaded before today (Orthanc may have deleted it)
  const isOldStudy = useCallback(() => {
    const date = study?.createdAt || study?.studyDate;
    if (!date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(date) < today;
  }, [study]);

  // Checks Orthanc; if missing, downloads from R2 and pushes back
  const ensureStudyInOrthanc = useCallback(async () => {
    const studyId = study?.orthancStudyID || study?._id || studyInstanceUID;
    const loadingToast = toast.loading('Checking study availability...');
    try {
      const response = await api.post('/orthanc/ensure-available', { studyId });
      toast.dismiss(loadingToast);
      const { available, restored, warning } = response.data;
      if (restored) {
        toast.success('Study restored from backup. Opening viewer...');
      } else if (warning) {
        toast('Opening viewer...', { icon: '⚠️', duration: 3000 });
      }
      if (!available) {
        toast.error('Study is no longer available in the viewer');
        return false;
      }
      return true;
    } catch (err) {
      toast.dismiss(loadingToast);
      console.error('[EyeIcon] ensure-available error:', err);
      // Don't block — let viewer try anyway
      return true;
    }
  }, [study, studyInstanceUID]);

  const openOHIFLocal = useCallback(async (studyInstanceUID) => {
    try {
      // If study is older than today, verify it's still in Orthanc
      if (isOldStudy()) {
        setRestoring(true);
        const available = await ensureStudyInOrthanc();
        setRestoring(false);
        if (!available) return;
      }

      await updateStudyInteractionStatus('ohif_opened');
      
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
      
    } catch (error) {
      console.error('Error opening OHIF viewer:', error);
      toast.error('Failed to open OHIF viewer');
    }
  }, [updateStudyInteractionStatus]);

  const handleDirectClick = useCallback(() => {
    if (!studyInstanceUID) {
      console.error('Study Instance UID is required');
      toast.error('Study Instance UID is required');
      return;
    }
    openOHIFLocal(studyInstanceUID);
  }, [studyInstanceUID, openOHIFLocal]);

  return (
    <button
      onClick={handleDirectClick}
      disabled={restoring}
      className="text-blue-600 hover:text-blue-800 transition-colors duration-200 p-2 hover:bg-blue-50 rounded-full group disabled:opacity-60 disabled:cursor-wait"
      title={restoring ? 'Restoring study...' : 'Open in Local OHIF Viewer'}
    >
      {restoring ? (
        <svg className="h-5 w-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
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
      )}
    </button>
  );
});

export default EyeIconDropdown;