import React, { useState, useEffect } from 'react';
import axios from 'axios';

const PatientReport = ({ patientId, isOpen, onClose, study = {} }) => {
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('patient');

  useEffect(() => {
    const fetchPatientData = async () => {
      if (!isOpen) return;
      
      setLoading(true);
      try {
        // If we already have the study with patient data, use it
        if (study && Object.keys(study).length > 0) {
          setPatientData({
            patientID: study.patientId,
            patientNameRaw: study.patientName,
            ageString: study.ageGender ? study.ageGender.split('/')[0] : '',
            dateOfBirth: study.patientDateOfBirth,
            studyData: {
              studyId: study.orthancStudyID || study._id,
              studyInstanceUID: study.studyInstanceUID,
              studyDescription: study.description,
              imageCenter: study.institutionName || study.location,
              modality: study.modality,
              studyStatus: study.workflowStatus,
              noOfSeries: study.numberOfSeries || (study.seriesImages ? study.seriesImages.split('/')[0] : ''),
              noOfImages: study.numberOfImages || (study.seriesImages ? study.seriesImages.split('/')[1] : ''),
              studyDate: study.studyDate || formatDateString(study.studyDateTime),
              referringPhysician: study.referredBy,
              accessionNumber: study.accessionNumber,
              uploadDate: formatDateTimeString(study.uploadDateTime),
              reportDate: formatDateTimeString(study.reportedDateTime),
              assignedDate: formatDateTimeString(study.assignedDate),
              reportedBy: study.reportedBy,
              turnaroundTime: study.diffAssignAndReportTAT || '25 Minutes'
            }
          });
          setLoading(false);
          return;
        }
        
        // Otherwise fetch it from the API
        const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
        const response = await axios.get(`${backendUrl}/api/patients/${patientId}`);
        setPatientData(response.data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching patient data:', err);
        setError('Failed to load patient information');
        setLoading(false);
      }
    };

    fetchPatientData();
  }, [isOpen, patientId, study]);

  // Helper function to format date from string
  const formatDateString = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      });
    } catch (e) {
      return dateString;
    }
  };

  // Helper function to format date and time from string
  const formatDateTimeString = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return `${date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit' 
      })} ${date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      })}`;
    } catch (e) {
      return dateString;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center">
      <div className="relative w-[90%] max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
        {/* Modal Header */}
        <div className="sticky top-0 z-10 bg-slate-600 text-white px-6 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-semibold">Patient Information</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 focus:outline-none"
          >
            <span className="text-xl font-bold">×</span>
          </button>
        </div>
        
        {/* Modal Content */}
        <div className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="ml-3 text-gray-600">Loading patient information...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md">
              <p className="text-red-500">{error}</p>
            </div>
          ) : patientData ? (
            <div>
              {/* Study Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Study Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200 w-1/6">StudyId</td>
                      <td className="px-4 py-2 border border-gray-200 w-1/3">{study._id || patientData.studyData?.studyId || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200 w-1/6">Study InstanceUID</td>
                      <td className="px-4 py-2 border border-gray-200 w-1/3">{study.studyInstanceUID || patientData.studyData?.studyInstanceUID || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientId</td>
                      <td className="px-4 py-2 border border-gray-200">{study.patientId || patientData.patientID || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Study Description</td>
                      <td className="px-4 py-2 border border-gray-200">{study.description || patientData.studyData?.studyDescription || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientName</td>
                      <td className="px-4 py-2 border border-gray-200">{study.patientName || patientData.patientNameRaw || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Image Center Name</td>
                      <td className="px-4 py-2 border border-gray-200">{study.location || patientData.studyData?.imageCenter || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientAge</td>
                      <td className="px-4 py-2 border border-gray-200">{study.ageGender?.split('/')[0].trim() || patientData.ageString || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Modality</td>
                      <td className="px-4 py-2 border border-gray-200">{study.modality || patientData.studyData?.modality || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientDOB</td>
                      <td className="px-4 py-2 border border-gray-200">{''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">StudyStatus</td>
                      <td className="px-4 py-2 border border-gray-200">{study.workflowStatus || patientData.studyData?.studyStatus || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">StudyDate</td>
                      <td className="px-4 py-2 border border-gray-200">{formatDateString(study.studyDateTime) || patientData.studyData?.studyDate || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">NoOfSeries</td>
                      <td className="px-4 py-2 border border-gray-200">{study.numberOfSeries || patientData.studyData?.noOfSeries || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Referring Physician Name</td>
                      <td className="px-4 py-2 border border-gray-200">{study.referredBy || patientData.studyData?.referringPhysician || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">NoOfImages</td>
                      <td className="px-4 py-2 border border-gray-200">{study.numberOfImages || patientData.studyData?.noOfImages || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Accession Number</td>
                      <td className="px-4 py-2 border border-gray-200">{study.accessionNumber || patientData.studyData?.accessionNumber || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">UploadDate</td>
                      <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(study.uploadDateTime) || patientData.studyData?.uploadDate || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">TechnologistName</td>
                      <td className="px-4 py-2 border border-gray-200">{study.technologistName || patientData.studyData?.technologistName }</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200"></td>
                      <td className="px-4 py-2 border border-gray-200"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Assigned Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Assigned Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Technologist</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Radiologist</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Date of Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2 border border-gray-200">Xcentic</td>
                      <td className="px-4 py-2 border border-gray-200">{study.assignedDoctorName || study.reportedBy}</td>
                      <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(study.assignedDate || study.lastAssignmentAt) || ''}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Study Download Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Study Download Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">UserName</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Download Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.downloadHistory?.length > 0 ? (
                      study.downloadHistory.map((download, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 border border-gray-200">{download.userName || download.user }</td>
                          <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(download.date || download.downloadedAt) || ''}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="px-4 py-2 text-center border border-gray-200">
                          No Study Download Status Found...!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Report Download Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Report Download Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">UserName</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Download Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.reportDownloadHistory?.length > 0 ? (
                      study.reportDownloadHistory.map((download, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 border border-gray-200">{download.userName || download.user }</td>
                          <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(download.date || download.downloadedAt) || ''}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="px-4 py-2 text-center border border-gray-200">
                          No Report Download Status Found...!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Reported Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Reported Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Reported By</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">ReportDate</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">TurnAroundTime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.reportedBy ? (
                      <tr>
                        <td className="px-4 py-2 border border-gray-200">{study.reportedBy }</td>
                        <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(study.reportDate || study.reportFinalizedAt) || ''}</td>
                        <td className="px-4 py-2 border border-gray-200">{study.diffAssignAndReportTAT || '29 Minutes'}</td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan="3" className="px-4 py-2 text-center border border-gray-200">
                          No Report Download Status Found...!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Dispatched Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Dispatched Information</h3>
                </div>
                <div className="px-4 py-10 text-center border border-gray-200">
                  <p className="text-gray-500">No Dispatch Status Found</p>
                </div>
              </div>
              
              {/* Description Modified Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Exam Description Modified Information</h3>
                </div>
                <div className="px-4 py-10 text-center border border-gray-200">
                  <p className="text-gray-500">No Records Found...!</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No patient data available
            </div>
          )}
        </div>
        
        {/* Modal Footer */}
        <div className="bg-gray-100 px-6 py-3 flex justify-end rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientReport;