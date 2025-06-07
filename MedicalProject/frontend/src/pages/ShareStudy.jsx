// 🔧 FIXED: pages/ShareStudy.jsx - Fix API call
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const ShareStudy = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [studyInfo, setStudyInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const accessSharedStudy = async () => {
      try {
        setLoading(true);
        
        // 🔧 FIXED: Call the correct API endpoint
        const response = await api.get(`/sharing/access/${token}`);
        
        if (response.data.success) {
          setStudyInfo(response.data);
          
          console.log('📋 Study Info:', response.data);
          console.log('🔗 Viewer URL:', response.data.viewerUrl);
          
          // Add a small delay before redirect for better UX
          setTimeout(() => {
            window.location.href = response.data.viewerUrl;
          }, 2000);
          
        } else {
          setError(response.data.message);
        }
      } catch (error) {
        console.error('❌ Error accessing shared study:', error);
        
        // Better error handling
        if (error.response?.status === 404) {
          setError('Share link not found or has expired.');
        } else if (error.response?.status === 400) {
          setError('Invalid share link format.');
        } else {
          setError('Failed to access shared study. Please check your internet connection and try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      accessSharedStudy();
    } else {
      setError('No share token provided.');
      setLoading(false);
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">🔍 Loading Study...</h2>
          <p className="text-gray-600">Please wait while we prepare your DICOM viewer</p>
          <div className="mt-4 text-sm text-gray-500">
            <p>Share Token: {token?.substring(0, 16)}...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Share Link Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          
          <div className="bg-gray-100 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">Possible reasons:</h3>
            <ul className="text-left text-sm text-gray-600 space-y-1">
              <li>• Link has expired (links expire after 7 days)</li>
              <li>• Invalid or malformed share token</li>
              <li>• Study has been removed or archived</li>
              <li>• Network connectivity issues</li>
            </ul>
          </div>
          
          <button 
            onClick={() => window.location.reload()}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-green-500 text-6xl mb-4">✅</div>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Study Access Granted</h2>
        <p className="text-gray-600 mb-4">Redirecting to DICOM viewer...</p>
        
        {studyInfo && (
          <div className="mt-4 p-4 bg-white rounded-lg shadow border text-left max-w-sm mx-auto">
            <h3 className="font-semibold mb-2">📋 Study Information:</h3>
            <div className="space-y-1 text-sm">
              <p><strong>Patient:</strong> {studyInfo.studyInfo.patientName}</p>
              <p><strong>Modality:</strong> {studyInfo.studyInfo.modality}</p>
              <p><strong>Date:</strong> {new Date(studyInfo.studyInfo.studyDate).toLocaleDateString()}</p>
              <p><strong>Viewer:</strong> {studyInfo.viewerType}</p>
              <p><strong>Access Count:</strong> {studyInfo.accessCount}</p>
            </div>
          </div>
        )}
        
        <div className="mt-4">
          <div className="animate-pulse flex justify-center">
            <div className="h-2 bg-blue-200 rounded-full w-32"></div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Preparing viewer...</p>
        </div>
      </div>
    </div>
  );
};

export default ShareStudy;