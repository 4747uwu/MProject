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
          console.log('📋 Using study data directly:', study);
          
          // 🔧 FIXED: Use actual study data structure from backend
          setPatientData({
            patientID: study.patientId,
            patientNameRaw: study.patientName,
            ageString: study.ageGender ? study.ageGender.split(' / ')[0] : '',
            gender: study.ageGender ? study.ageGender.split(' / ')[1] : '',
            studyData: {
              studyId: study._id,
              studyInstanceUID: study.studyInstanceUID,
              studyDescription: study.description,
              imageCenter: study.location,
              modality: study.modality,
              studyStatus: study.workflowStatus,
              noOfSeries: study.series ? study.series.split('/')[0] : '',
              noOfImages: study.series ? study.series.split('/')[1] : '',
              studyDate: study.studyDate || formatDateString(study.studyDateTime),
              referringPhysician: study.referringPhysicianName || '',
              accessionNumber: study.accessionNumber,
              uploadDate: formatDateTimeString(study.uploadDateTime),
              reportDate: study.reportedDate ? formatDateTimeString(study.reportedDate) : '',
              assignedDate: study.assignmentHistory?.lastAssignedAt ? formatDateTimeString(study.assignmentHistory.lastAssignedAt) : '',
              reportedBy: study.reportedBy,
              turnaroundTime: study.diffAssignAndReportTAT || 'Pending',
              // 🔧 NEW: Additional fields from actual data
              orthancStudyID: study.orthancStudyID,
              priority: study.priority,
              caseType: study.caseType,
              clinicalHistory: study.clinicalHistory,
              assignedDoctorName: study.assignedDoctorName,
              latestAssignedDoctor: study.latestAssignedDoctorDetails
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

  const calculateFrontendTAT = (patientDetails) => {
    console.log(`[Frontend TAT] Calculating TAT with data:`, patientDetails);

    // 🔧 PRIORITY 1: Use backend calculated TAT from studies if available
    if (patientDetails?.studies?.[0]?.tat) {
        const backendTAT = patientDetails.studies[0].tat;
        console.log(`[Frontend TAT] Using backend calculated TAT:`, backendTAT);
        
        // Use totalTATDays if available, otherwise calculate from minutes
        if (backendTAT.totalTATDays !== null && backendTAT.totalTATDays !== undefined) {
            return backendTAT.totalTATDays;
        }
        
        if (backendTAT.totalTATMinutes) {
            return Math.floor(backendTAT.totalTATMinutes / (60 * 24)); // Convert minutes to days
        }
        
        if (backendTAT.resetAwareTATDays !== null) {
            return backendTAT.resetAwareTATDays;
        }
    }

    // 🔧 PRIORITY 2: Check if we just performed a TAT reset and have fresh data
    if (patientDetails?.tatResetInfo?.wasReset && 
        patientDetails?.tatResetInfo?.freshTATData?.length > 0) {
        const freshTAT = patientDetails.tatResetInfo.freshTATData[0].tat;
        console.log(`[Frontend TAT] Using fresh TAT after reset:`, freshTAT);
        
        if (freshTAT.resetAwareTATDays !== null) {
            return freshTAT.resetAwareTATDays;
        }
        
        if (freshTAT.totalTATDays !== null) {
            return freshTAT.totalTATDays;
        }
    }

    // 🔧 FALLBACK: Calculate from order date if no backend TAT
    if (patientDetails?.visitInfo?.orderDate) {
        const startDate = new Date(patientDetails.visitInfo.orderDate);
        if (!isNaN(startDate.getTime())) {
            const currentDate = new Date();
            const totalDays = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
            console.log(`[Frontend TAT] Calculated from order date: ${totalDays} days`);
            return totalDays;
        }
    }

    console.log(`[Frontend TAT] No valid TAT data found, returning 0`);
    return 0;
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
                      <td className="px-4 py-2 border border-gray-200 w-1/3">{patientData.studyData?.studyId || study._id || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200 w-1/6">Study InstanceUID</td>
                      <td className="px-4 py-2 border border-gray-200 w-1/3">{patientData.studyData?.studyInstanceUID || study.studyInstanceUID || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientId</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.patientID || study.patientId || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Study Description</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.studyDescription || study.description || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientName</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.patientNameRaw || study.patientName || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Image Center Name</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.imageCenter || study.location || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientAge</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.ageString || (study.ageGender ? study.ageGender.split(' / ')[0] : '')}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Modality</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.modality || study.modality || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">PatientGender</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.gender || (study.ageGender ? study.ageGender.split(' / ')[1] : '')}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">StudyStatus</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.studyStatus || study.workflowStatus || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">StudyDate</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.studyDate || formatDateString(study.studyDateTime || study.studyDate) || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">NoOfSeries</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.noOfSeries || (study.series ? study.series.split('/')[0] : '') || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Referring Physician Name</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.referringPhysician || study.referringPhysicianName || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">NoOfImages</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.noOfImages || (study.series ? study.series.split('/')[1] : '') || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Accession Number</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.accessionNumber || study.accessionNumber || ''}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">UploadDate</td>
                      <td className="px-4 py-2 border border-gray-200">{patientData.studyData?.uploadDate || formatDateTimeString(study.uploadDateTime) || ''}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Priority</td>
                      <td className="px-4 py-2 border border-gray-200">{study.priority || 'NORMAL'}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Case Type</td>
                      <td className="px-4 py-2 border border-gray-200">{study.caseType || 'routine'}</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Clinical History</td>
                      <td className="px-4 py-2 border border-gray-200 text-sm">{study.clinicalHistory || 'Not provided'}</td>
                      <td className="px-4 py-2 bg-gray-100 font-medium border border-gray-200">Orthanc Study ID</td>
                      <td className="px-4 py-2 border border-gray-200">{study.orthancStudyID || ''}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Assigned Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-4 py-2">
                  <h3 className="font-medium">Assignment Information</h3>
                </div>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Assignment #</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Doctor Name</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Specialization</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Date Assigned</th>
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.doctorAssignments && study.doctorAssignments.length > 0 ? (
                      study.doctorAssignments.map((assignment, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 border border-gray-200">{index + 1}</td>
                          <td className="px-4 py-2 border border-gray-200">{assignment.doctorDetails?.fullName || 'Unknown'}</td>
                          <td className="px-4 py-2 border border-gray-200">{assignment.doctorDetails?.specialization || 'Unknown'}</td>
                          <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(assignment.assignedAt) || ''}</td>
                          <td className="px-4 py-2 border border-gray-200">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              assignment.doctorDetails?.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {assignment.doctorDetails?.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-4 py-2 text-center border border-gray-200">
                          No assignments found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Current Assignment Summary */}
              {study.latestAssignedDoctorDetails && (
                <div className="mb-4">
                  <div className="bg-slate-700 text-white px-4 py-2">
                    <h3 className="font-medium">Current Assignment</h3>
                  </div>
                  <div className="p-4 bg-blue-50 border border-blue-200">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Doctor:</span>
                        <p className="font-semibold text-blue-800">{study.latestAssignedDoctorDetails.fullName}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Specialization:</span>
                        <p className="text-gray-800">{study.latestAssignedDoctorDetails.specialization}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Email:</span>
                        <p className="text-gray-800">{study.latestAssignedDoctorDetails.email}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Assigned Date:</span>
                        <p className="text-gray-800">{formatDateTimeString(study.latestAssignedDoctorDetails.assignedAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
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
                          <td className="px-4 py-2 border border-gray-200">{download.userName || download.user || 'Unknown User'}</td>
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
                          <td className="px-4 py-2 border border-gray-200">{download.userName || download.user || 'Unknown User'}</td>
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
                      <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Report Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {study.reportedBy ? (
                      <tr>
                        <td className="px-4 py-2 border border-gray-200">{study.reportedBy}</td>
                        <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(study.reportDate || study.reportFinalizedAt) || 'Not reported yet'}</td>
                        <td className="px-4 py-2 border border-gray-200">{study.diffAssignAndReportTAT || 'Pending'}</td>
                        <td className="px-4 py-2 border border-gray-200">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            study.ReportAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {study.ReportAvailable ? 'Available' : 'Not Available'}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-4 py-2 text-center border border-gray-200">
                          No Report Status Found...!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Assignment History Section */}
              {study.assignmentChain && study.assignmentChain.length > 0 && (
                <div className="mb-4">
                  <div className="bg-slate-700 text-white px-4 py-2">
                    <h3 className="font-medium">Assignment Chain History</h3>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Step</th>
                        <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Doctor Name</th>
                        <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Assigned Date</th>
                        <th className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {study.assignmentChain.map((assignment, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 border border-gray-200">{index + 1}</td>
                          <td className="px-4 py-2 border border-gray-200">{assignment.doctorName}</td>
                          <td className="px-4 py-2 border border-gray-200">{formatDateTimeString(assignment.assignedAt)}</td>
                          <td className="px-4 py-2 border border-gray-200">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              assignment.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {assignment.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
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