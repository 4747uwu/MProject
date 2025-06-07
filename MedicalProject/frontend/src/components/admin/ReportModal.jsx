import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { formatDate } from '../../utils/dateUtils';
import { toast } from 'react-toastify';

const ReportModal = ({ isOpen, onClose, studyData }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [reportStatus, setReportStatus] = useState('draft');
  const [reportResponse, setReportResponse] = useState(null);
  const [findings, setFindings] = useState('');
  const [savingFindings, setSavingFindings] = useState(false);

  useEffect(() => {
    if (isOpen && studyData) {
      fetchReports();
    }
  }, [isOpen, studyData]);

  const fetchReports = async () => {
    if (!studyData?._id) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/documents/study/${studyData._id}/reports`);
      if (response.data.success) {
        setReports(response.data.reports || []);
        setReportResponse(response.data);
        console.log('Current workflow status:', response.data);
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!studyData?._id) return;
    
    setGenerating(true);
    try {
      const response = await api.get(`/documents/study/${studyData._id}/generate-patient-report`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      const contentDisposition = response.headers['content-disposition'];
      let filename = `Patient_Report_${studyData.patientName || 'Unknown'}_${Date.now()}.docx`;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Report generated and downloaded successfully!");
      
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUploadReport = async () => {
    if (!selectedFile || !studyData?._id) {
      toast.error("Please select a file");
      return;
    }
    
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('report', selectedFile);
      if (studyData.lastAssignedDoctor?._id) {
        formData.append('doctorId', studyData.lastAssignedDoctor._id);
      }
      formData.append('reportStatus', reportStatus);
      
      await api.post(`/documents/study/${studyData._id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      toast.success("Report uploaded successfully!");
      setSelectedFile(null);
      document.getElementById('report-file-input').value = '';
      
      fetchReports();
      setActiveTab(0);
    } catch (error) {
      console.error("Error uploading report:", error);
      toast.error("Failed to upload report");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadReport = async (reportIndex) => {
    if (!studyData?._id) return;
    
    try {
      const response = await api.get(
        `/documents/study/${studyData._id}/reports/${reportIndex}/download`, 
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // 🔧 SIMPLIFIED: More robust filename extraction
      let filename = `report_${reportIndex}_${Date.now()}.pdf`; // Safe fallback
      
      const contentDisposition = response.headers['content-disposition'];
      console.log('🔍 Content-Disposition:', contentDisposition);
      
      if (contentDisposition) {
        // Try multiple extraction methods
        const patterns = [
          /filename\*?=['"]?([^'";]+)['"]?/i,  // Most comprehensive
          /filename="([^"]+)"/i,               // Standard quoted
          /filename=([^;,]+)/i                 // Unquoted
        ];
        
        for (const pattern of patterns) {
          const match = contentDisposition.match(pattern);
          if (match && match[1]) {
            filename = match[1].trim().replace(/['"]/g, '');
            console.log('✅ Extracted filename:', filename);
            break;
          }
        }
      }
      
      // 🔧 SAFETY: Ensure filename has a valid extension
      if (!filename.includes('.')) {
        filename += '.pdf'; // Default to PDF if no extension
      }
      
      console.log('📁 Final download filename:', filename);
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      console.log('✅ Downloaded file:', filename);
      
    } catch (error) {
      console.error("Error downloading report:", error);
      toast.error("Failed to download report");
    }
  };

  const handleDeleteReport = async (reportIndex) => {
    if (!window.confirm("Are you sure you want to delete this report?")) {
      return;
    }
    
    if (!studyData?._id) return;
    
    try {
      await api.delete(`/documents/study/${studyData._id}/reports/${reportIndex}`);
      toast.success("Report deleted successfully");
      fetchReports();
    } catch (error) {
      console.error("Error deleting report:", error);
      toast.error("Failed to delete report");
    }
  };

  const handleSaveFindings = async () => {
    setSavingFindings(true);
    try {
      // Add your API call here to save findings
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      toast.success("Findings saved successfully!");
    } catch (error) {
      console.error("Error saving findings:", error);
      toast.error("Failed to save findings");
    } finally {
      setSavingFindings(false);
    }
  };

  // 🔧 ENHANCED: Better file size formatting
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 🔧 ENHANCED: Better date formatting
  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return {
        date: date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        }),
        time: date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        })
      };
    } catch {
      return { date: 'N/A', time: 'N/A' };
    }
  };

  if (!isOpen) return null;

  // Get patient and study info
  const patientName = studyData?.patientName || 'N/A';
  const patientId = studyData?.patientId || 'N/A';
  const assignedDoctor = studyData?.lastAssignedDoctor;
  const workflowStatus = reportResponse?.workflowStatus || studyData?.workflowStatus;

  // Get workflow status styling
  const getStatusColor = (status) => {
    switch (status) {
      case 'final_report_downloaded':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'report_finalized':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'report_in_progress':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'assigned_to_doctor':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const tabs = [
    { id: 0, name: 'Reports', icon: '📋', color: 'blue' },
    { id: 1, name: 'Generate', icon: '✨', color: 'green' },
    { id: 2, name: 'Upload', icon: '📤', color: 'purple' },
    { id: 3, name: 'Findings', icon: '🔍', color: 'orange' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-40 flex items-start justify-center p-2 pt-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl min-h-[40vh] h-[55vh] flex flex-col overflow-hidden my-auto">
        
        {/* 🎨 COMPACT HEADER */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 py-3 px-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-500 p-2 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Medical Reports</h3>
                <p className="text-xs text-gray-600">
                  <span className="font-medium">{patientName}</span> • ID: <span className="font-medium">{patientId}</span>
                </p>
              </div>
            </div>
            
            {/* 📊 INLINE STATUS CARDS */}
            <div className="flex items-center space-x-4">
              <div className="text-center">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(workflowStatus)}`}>
                  {workflowStatus?.replace(/_/g, ' ')?.toUpperCase() || 'UNKNOWN'}
                </span>
                <p className="text-xs text-gray-500 mt-1">Status</p>
              </div>
              
              <div className="text-center">
                <p className="text-lg font-semibold text-gray-900">{reportResponse?.totalReports || 0}</p>
                <p className="text-xs text-gray-500">Reports</p>
              </div>
              
              <div className="text-center max-w-32">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {reportResponse?.studyInfo?.reportInfo?.reporterName || assignedDoctor?.fullName || 'Unassigned'}
                </p>
                <p className="text-xs text-gray-500">Doctor</p>
              </div>
            </div>
            
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 🎨 COMPACT TABS */}
        <div className="flex border-b bg-gray-50">
          {tabs.map((tab) => (
            <button 
              key={tab.id}
              className={`py-2 px-4 font-medium text-sm transition-all duration-200 border-b-2 flex items-center space-x-2 ${
                activeTab === tab.id 
                  ? `text-${tab.color}-600 border-${tab.color}-500 bg-white shadow-sm` 
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </div>

        {/* 📱 OPTIMIZED TAB CONTENT */}
        <div className="flex-grow overflow-auto bg-gray-50">
          
          {/* 📋 VIEW REPORTS TAB - OPTIMIZED */}
          {activeTab === 0 && (
            <div className="p-4">
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                {loading ? (
                  <div className="flex justify-center items-center h-48">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent mx-auto mb-3"></div>
                      <p className="text-gray-600 text-sm">Loading reports...</p>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">#</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">File Details</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Uploaded By</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Date & Time</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Size</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Type</th>
                          <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {reports.length === 0 ? (
                          <tr>
                            <td colSpan="8" className="px-6 py-12 text-center text-gray-500">
                              <div className="flex flex-col items-center">
                                <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="font-medium text-gray-900 mb-1">No Reports Available</p>
                                <p className="text-sm text-gray-500">Generate or upload a report to get started</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          reports.map((report, index) => {
                            const dateTime = formatDateTime(report.uploadedAt);
                            return (
                              <tr key={index} className="hover:bg-gray-50 transition-colors">
                                {/* Index */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                                    {index + 1}
                                  </div>
                                </td>
                                
                                {/* File Details */}
                                <td className="px-4 py-3">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-8 w-8">
                                      <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center">
                                        <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                      </div>
                                    </div>
                                    <div className="ml-3">
                                      <div className="text-sm font-medium text-gray-900 truncate max-w-48" title={report.filename}>
                                        {report.filename}
                                      </div>
                                      <div className="text-xs text-gray-500 truncate max-w-48" title={report.contentType}>
                                        {report.contentType}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                
                                {/* Uploaded By */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <div className="flex-shrink-0 h-6 w-6">
                                      <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center">
                                        <svg className="h-3 w-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                      </div>
                                    </div>
                                    <div className="ml-2">
                                      <div className="text-sm font-medium text-gray-900 truncate max-w-24" title={report.uploadedBy || 'Unknown'}>
                                        {report.uploadedBy || 'Unknown'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                
                                {/* Date & Time */}
                                <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-600">
                                  <div className="text-center">
                                    <div className="font-medium">{dateTime.date}</div>
                                    <div className="text-gray-500">{dateTime.time}</div>
                                  </div>
                                </td>
                                
                                {/* 🔧 FIXED: Size Column */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                    {report.formattedSize || formatFileSize(report.size)}
                                  </span>
                                </td>
                                
                                {/* Status */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                    report.reportStatus === 'finalized' 
                                      ? 'bg-green-100 text-green-800' 
                                      : 'bg-yellow-100 text-yellow-800'
                                  }`}>
                                    {report.reportStatus || 'draft'}
                                  </span>
                                </td>
                                
                                {/* Type */}
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    {report.reportType?.replace(/-/g, ' ') || 'Report'}
                                  </span>
                                </td>
                                
                                {/* Actions */}
                                <td className="px-4 py-3 whitespace-nowrap text-center">
                                  <div className="flex justify-center space-x-1">
                                    <button
                                      onClick={() => handleDownloadReport(report.index)}
                                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                                      title="Download Report"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                      </svg>
                                      Download
                                    </button>
                                    <button
                                      onClick={() => handleDeleteReport(report.index)}
                                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 transition-colors"
                                      title="Delete Report"
                                    >
                                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ✨ GENERATE REPORT TAB - COMPACT */}
          {activeTab === 1 && (
            <div className="p-4">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="text-center space-y-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                    <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Generate Report Template</h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Create a standardized medical report for <strong>{patientName}</strong>
                    </p>
                  </div>

                  <button
                    onClick={handleGenerateReport}
                    disabled={generating}
                    className={`inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all ${
                      generating ? 'opacity-75 cursor-not-allowed' : 'hover:shadow-lg'
                    }`}
                  >
                    {generating ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Generate Report
                      </>
                    )}
                  </button>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-sm text-gray-600">Report will be generated as a Microsoft Word document (.docx)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 📤 UPLOAD REPORT TAB - COMPACT */}
          {activeTab === 2 && (
            <div className="p-4">
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="space-y-4">
                  {/* File Upload Area */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors">
                    <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="mt-3">
                      <label htmlFor="report-file-input" className="cursor-pointer">
                        <span className="mt-2 block text-sm font-medium text-gray-900">
                          Choose report file to upload
                        </span>
                        <input
                          type="file"
                          id="report-file-input"
                          onChange={handleFileChange}
                          className="sr-only"
                          accept=".pdf,.doc,.docx,.txt"
                        />
                        <span className="mt-1 block text-xs text-gray-500">
                          PDF, DOC, DOCX up to 10MB
                        </span>
                      </label>
                    </div>
                    
                    {selectedFile && (
                      <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-md">
                        <div className="flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-sm text-blue-700 font-medium">{selectedFile.name}</span>
                          <span className="text-xs text-blue-500 ml-2">({formatFileSize(selectedFile.size)})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label htmlFor="report-status" className="block text-sm font-medium text-gray-700 mb-1">
                        Report Status
                      </label>
                      <select
                        id="report-status"
                        className="block w-40 pl-3 pr-8 py-2 text-sm border-gray-300 focus:outline-none focus:ring-purple-500 focus:border-purple-500 rounded-md"
                        value={reportStatus}
                        onChange={(e) => setReportStatus(e.target.value)}
                      >
                        <option value="draft">Draft</option>
                        <option value="finalized">Finalized</option>
                      </select>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleUploadReport}
                      disabled={!selectedFile || uploading}
                      className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all ${
                        !selectedFile || uploading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'
                      }`}
                    >
                      {uploading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Uploading...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Upload Report
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 🔍 FINDINGS TAB - COMPACT */}
          {activeTab === 3 && (
            <div className="p-4">
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium text-gray-900">Clinical Findings</h3>
                    <span className="text-sm text-gray-500">
                      Doctor: {reportResponse?.studyInfo?.reportInfo?.reporterName || 'Unassigned'}
                    </span>
                  </div>
                  
                  <textarea 
                    rows={10}
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-orange-500 focus:border-orange-500 resize-none text-sm"
                    placeholder="Enter detailed clinical findings, observations, and diagnostic impressions..."
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                  ></textarea>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                      Last updated: Never
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveFindings}
                      disabled={savingFindings}
                      className={`inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors ${
                        savingFindings ? 'opacity-75 cursor-not-allowed' : ''
                      }`}
                    >
                      {savingFindings ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          Save Findings
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
        </div>

        {/* 🎨 COMPACT FOOTER */}
        <div className="bg-white border-t px-4 py-2 flex justify-between items-center">
          <div className="text-xs text-gray-500">
            Study ID: <span className="font-mono">{studyData?._id?.slice(-8) || 'N/A'}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;