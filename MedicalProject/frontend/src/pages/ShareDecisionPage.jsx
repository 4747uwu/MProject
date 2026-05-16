import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const ORTHANC_BASE_URL = 'http://64.227.187.164:8042';
const OHIF_LOCAL_URL = 'http://64.227.187.164:4000';

function buildOhifUrl(studyInstanceUID) {
  const ohifUrl = new URL(`${OHIF_LOCAL_URL}/viewer`);
  ohifUrl.searchParams.set('StudyInstanceUIDs', studyInstanceUID);
  const dataSourceConfig = {
    namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
    sourceName: 'dicomweb',
    configuration: {
      friendlyName: 'Star Radiology Viewer',
      name: 'orthanc',
      wadoUriRoot: `${ORTHANC_BASE_URL}/wado`,
      qidoRoot: `${ORTHANC_BASE_URL}/dicom-web`,
      wadoRoot: `${ORTHANC_BASE_URL}/dicom-web`,
      qidoSupportsIncludeField: true,
      supportsReject: false,
      imageRendering: 'wadors',
      thumbnailRendering: 'wadors',
      enableStudyLazyLoad: true,
      supportsFuzzyMatching: false,
      supportsWildcard: true
    }
  };
  ohifUrl.searchParams.set('dataSources', JSON.stringify([dataSourceConfig]));
  return ohifUrl.toString();
}

const ShareDecisionPage = () => {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [study, setStudy] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStudy = async () => {
      try {
        const response = await api.get(`/sharing/study/${id}`);
        if (response.data.success) {
          setStudy(response.data.study);
        } else {
          setError(response.data.message || 'Study not found');
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Study not found. The link may be invalid.');
        } else {
          setError('Failed to load study. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchStudy();
    } else {
      setError('No study ID provided.');
      setLoading(false);
    }
  }, [id]);

  const handleOpenViewer = () => {
    const url = buildOhifUrl(study.studyInstanceUID);
    window.open(url, '_blank');
  };

  const handleDownloadReport = () => {
    window.open(`/api/sharing/study/${id}/report`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading study...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-400 text-5xl mb-4">!</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">Unable to Load Study</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const formattedDate = study.studyDate
    ? new Date(study.studyDate).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : 'N/A';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-white bg-opacity-20 flex items-center justify-center mr-3">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white text-lg font-semibold">Star Radiology</h1>
              <p className="text-blue-200 text-sm">Shared Study</p>
            </div>
          </div>
        </div>

        {/* Study Info */}
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900 mb-1">{study.patientName}</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {study.modality}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {formattedDate}
            </span>
            {study.patientId && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                ID: {study.patientId}
              </span>
            )}
          </div>
        </div>

        {/* Action Cards */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-500 mb-4">What would you like to do?</p>

          {/* Viewer Option */}
          <button
            onClick={handleOpenViewer}
            className="w-full flex items-center p-4 border-2 border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
          >
            <div className="h-12 w-12 rounded-xl bg-blue-100 group-hover:bg-blue-200 flex items-center justify-center mr-4 transition-colors flex-shrink-0">
              <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="font-semibold text-gray-900">Open Viewer</p>
              <p className="text-sm text-gray-500">View DICOM images in the browser</p>
            </div>
            <svg className="h-5 w-5 text-gray-400 ml-auto group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Report Option */}
          {study.hasReport ? (
            <button
              onClick={handleDownloadReport}
              className="w-full flex items-center p-4 border-2 border-green-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all group"
            >
              <div className="h-12 w-12 rounded-xl bg-green-100 group-hover:bg-green-200 flex items-center justify-center mr-4 transition-colors flex-shrink-0">
                <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-900">Download Report</p>
                <p className="text-sm text-gray-500">Download the radiology report PDF</p>
              </div>
              <svg className="h-5 w-5 text-gray-400 ml-auto group-hover:text-green-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-full flex items-center p-4 border-2 border-gray-100 rounded-xl bg-gray-50 opacity-60">
              <div className="h-12 w-12 rounded-xl bg-gray-200 flex items-center justify-center mr-4 flex-shrink-0">
                <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-semibold text-gray-500">Report Not Available</p>
                <p className="text-sm text-gray-400">Report has not been uploaded yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-center text-gray-400">Star Radiology — Shared via secure link</p>
        </div>
      </div>
    </div>
  );
};

export default ShareDecisionPage;
