import React, { useState, useEffect } from 'react';

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
        const backendUrl = import.meta?.env?.VITE_BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/api/patients/${patientId}`);
        const data = await response.json();
        setPatientData(data);
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

  // Mobile-friendly table component
  const ResponsiveTable = ({ data, headers, title, emptyMessage }) => (
    <div className="mb-4">
      <div className="bg-slate-700 text-white px-3 sm:px-4 py-2">
        <h3 className="font-medium text-sm sm:text-base">{title}</h3>
      </div>
      
      {/* Mobile Card Layout */}
      <div className="block md:hidden">
        {data && data.length > 0 ? (
          data.map((row, index) => (
            <div key={index} className="border-b border-gray-200 p-3">
              <div className="flex justify-between items-start mb-2">
                <span className="bg-slate-600 text-white px-2 py-1 rounded text-xs font-medium">#{index + 1}</span>
              </div>
              <div className="space-y-2">
                {headers.map((header, headerIndex) => (
                  <div key={headerIndex}>
                    <span className="text-xs text-gray-600 font-medium">{header}:</span>
                    <div className="text-sm mt-1">{row[headerIndex] || 'N/A'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-center text-sm text-gray-500">
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={index} className="px-4 py-2 text-left font-medium bg-slate-700 text-white border border-slate-600 text-sm">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data && data.length > 0 ? (
              data.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-4 py-2 border border-gray-200 text-sm">
                      {cell || 'N/A'}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length} className="px-4 py-2 text-center border border-gray-200 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Mobile-friendly info grid component
  const InfoGrid = ({ data, title }) => (
    <div className="mb-4">
      <div className="bg-slate-700 text-white px-3 sm:px-4 py-2">
        <h3 className="font-medium text-sm sm:text-base">{title}</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-gray-300">
        {data.map((item, index) => (
          <div key={index} className="bg-white">
            <div className="px-3 sm:px-4 py-2 bg-gray-100 font-medium border-b border-gray-200 text-xs sm:text-sm">
              {item.label}
            </div>
            <div className="px-3 sm:px-4 py-2 text-xs sm:text-sm break-words">
              {item.value || 'N/A'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black bg-opacity-50 flex items-start justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden bg-white rounded-lg shadow-xl flex flex-col">
        {/* Modal Header */}
        <div className="flex-shrink-0 bg-slate-600 text-white px-3 sm:px-6 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-sm sm:text-lg font-semibold truncate pr-2">Patient Information</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 focus:outline-none p-1 rounded-full hover:bg-slate-700 transition-colors flex-shrink-0"
          >
            <span className="text-xl sm:text-2xl font-bold leading-none">×</span>
          </button>
        </div>
        
        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-4 border-blue-500 border-t-transparent"></div>
              <p className="ml-3 text-sm sm:text-base text-gray-600">Loading patient information...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md m-4">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          ) : patientData ? (
            <div className="p-0">
              {/* Study Information Section */}
              <InfoGrid 
                title="Study Information"
                data={[
                  { label: 'StudyId', value: patientData.studyData?.studyId || study._id },
                  { label: 'Study InstanceUID', value: patientData.studyData?.studyInstanceUID || study.studyInstanceUID },
                  { label: 'PatientId', value: patientData.patientID || study.patientId },
                  { label: 'Study Description', value: patientData.studyData?.studyDescription || study.description },
                  { label: 'PatientName', value: patientData.patientNameRaw || study.patientName },
                  { label: 'Image Center Name', value: patientData.studyData?.imageCenter || study.location },
                  { label: 'PatientAge', value: patientData.ageString || (study.ageGender ? study.ageGender.split(' / ')[0] : '') },
                  { label: 'Modality', value: patientData.studyData?.modality || study.modality },
                  { label: 'PatientGender', value: patientData.gender || (study.ageGender ? study.ageGender.split(' / ')[1] : '') },
                  { label: 'StudyStatus', value: patientData.studyData?.studyStatus || study.workflowStatus },
                  { label: 'StudyDate', value: patientData.studyData?.studyDate || formatDateString(study.studyDateTime || study.studyDate) },
                  { label: 'NoOfSeries', value: patientData.studyData?.noOfSeries || (study.series ? study.series.split('/')[0] : '') },
                  { label: 'Referring Physician Name', value: patientData.studyData?.referringPhysician || study.referringPhysicianName },
                  { label: 'NoOfImages', value: patientData.studyData?.noOfImages || (study.series ? study.series.split('/')[1] : '') },
                  { label: 'Accession Number', value: patientData.studyData?.accessionNumber || study.accessionNumber },
                  { label: 'UploadDate', value: patientData.studyData?.uploadDate || formatDateTimeString(study.uploadDateTime) },
                  { label: 'Priority', value: study.priority || 'NORMAL' },
                  { label: 'Case Type', value: study.caseType || 'routine' },
                  { label: 'Clinical History', value: study.clinicalHistory || 'Not provided' },
                  { label: 'Orthanc Study ID', value: study.orthancStudyID }
                ]}
              />
              
              {/* Assignment Information Section */}
              <ResponsiveTable
                title="Assignment Information"
                headers={['Assignment #', 'Doctor Name', 'Specialization', 'Date Assigned', 'Status']}
                data={study.doctorAssignments?.map((assignment, index) => [
                  index + 1,
                  assignment.doctorDetails?.fullName || 'Unknown',
                  assignment.doctorDetails?.specialization || 'Unknown',
                  formatDateTimeString(assignment.assignedAt),
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    assignment.doctorDetails?.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {assignment.doctorDetails?.isActive ? 'Active' : 'Inactive'}
                  </span>
                ]) || []}
                emptyMessage="No assignments found"
              />
              
              {/* Current Assignment Summary */}
              {study.latestAssignedDoctorDetails && (
                <div className="mb-4">
                  <div className="bg-slate-700 text-white px-3 sm:px-4 py-2">
                    <h3 className="font-medium text-sm sm:text-base">Current Assignment</h3>
                  </div>
                  <div className="p-3 sm:p-4 bg-blue-50 border border-blue-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                      <div>
                        <span className="font-medium text-gray-600">Doctor:</span>
                        <p className="font-semibold text-blue-800 mt-1">{study.latestAssignedDoctorDetails.fullName}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Specialization:</span>
                        <p className="text-gray-800 mt-1">{study.latestAssignedDoctorDetails.specialization}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Email:</span>
                        <p className="text-gray-800 mt-1 break-all">{study.latestAssignedDoctorDetails.email}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-600">Assigned Date:</span>
                        <p className="text-gray-800 mt-1">{formatDateTimeString(study.latestAssignedDoctorDetails.assignedAt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Study Download Information Section */}
              <ResponsiveTable
                title="Study Download Information"
                headers={['UserName', 'Download Date']}
                data={study.downloadHistory?.map(download => [
                  download.userName || download.user || 'Unknown User',
                  formatDateTimeString(download.date || download.downloadedAt)
                ]) || []}
                emptyMessage="No Study Download Status Found...!"
              />
              
              {/* Report Download Information Section */}
              <ResponsiveTable
                title="Report Download Information"
                headers={['UserName', 'Download Date']}
                data={study.reportDownloadHistory?.map(download => [
                  download.userName || download.user || 'Unknown User',
                  formatDateTimeString(download.date || download.downloadedAt)
                ]) || []}
                emptyMessage="No Report Download Status Found...!"
              />
              
              {/* Reported Information Section */}
              <ResponsiveTable
                title="Reported Information"
                headers={['Reported By', 'ReportDate', 'TurnAroundTime', 'Report Available']}
                data={study.reportedBy ? [[
                  study.reportedBy,
                  formatDateTimeString(study.reportDate || study.reportFinalizedAt) || 'Not reported yet',
                  study.diffAssignAndReportTAT || 'Pending',
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    study.ReportAvailable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {study.ReportAvailable ? 'Available' : 'Not Available'}
                  </span>
                ]] : []}
                emptyMessage="No Report Status Found...!"
              />
              
              {/* Assignment History Section */}
              {study.assignmentChain && study.assignmentChain.length > 0 && (
                <ResponsiveTable
                  title="Assignment Chain History"
                  headers={['Step', 'Doctor Name', 'Assigned Date', 'Status']}
                  data={study.assignmentChain.map((assignment, index) => [
                    index + 1,
                    assignment.doctorName,
                    formatDateTimeString(assignment.assignedAt),
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      assignment.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {assignment.isActive ? 'Active' : 'Inactive'}
                    </span>
                  ])}
                  emptyMessage="No assignment history found"
                />
              )}
              
              {/* Dispatched Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-3 sm:px-4 py-2">
                  <h3 className="font-medium text-sm sm:text-base">Dispatched Information</h3>
                </div>
                <div className="px-3 sm:px-4 py-8 sm:py-10 text-center border border-gray-200">
                  <p className="text-gray-500 text-sm">No Dispatch Status Found</p>
                </div>
              </div>
              
              {/* Description Modified Information Section */}
              <div className="mb-4">
                <div className="bg-slate-700 text-white px-3 sm:px-4 py-2">
                  <h3 className="font-medium text-sm sm:text-base">Exam Description Modified Information</h3>
                </div>
                <div className="px-3 sm:px-4 py-8 sm:py-10 text-center border border-gray-200">
                  <p className="text-gray-500 text-sm">No Records Found...!</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <p className="text-sm">No patient data available</p>
            </div>
          )}
        </div>
        
        {/* Modal Footer */}
        <div className="flex-shrink-0 bg-gray-100 px-3 sm:px-6 py-3 flex justify-end rounded-b-lg border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PatientReport;