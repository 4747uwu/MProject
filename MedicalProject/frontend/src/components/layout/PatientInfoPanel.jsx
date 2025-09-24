import React, { useState } from 'react';
import { formatDate } from '../../utils/dateUtils';

const PatientInfoPanel = ({ patientData, studyData, reportData }) => {
  const [activeTab, setActiveTab] = useState('patient');

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const formatAge = (dateOfBirth) => {
    if (!dateOfBirth) return 'N/A';
    try {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        return age - 1;
      }
      return age;
    } catch {
      return 'N/A';
    }
  };

  const InfoItem = ({ label, value, copyable = false }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
      if (copyable && value) {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch (error) {
          console.error('Failed to copy:', error);
        }
      }
    };

    return (
      <div className="flex flex-col space-y-1 p-2">
        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </dt>
        <dd className="text-sm text-gray-900 flex items-center justify-between">
          <span className="break-words">{value || 'N/A'}</span>
          {copyable && value && (
            <button
              onClick={handleCopy}
              className="ml-2 p-1 hover:bg-gray-100 rounded transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          )}
        </dd>
      </div>
    );
  };

  const tabs = [
    { id: 'patient', name: 'Patient', icon: '👤' },
    { id: 'study', name: 'Study', icon: '🔬' },
    { id: 'report', name: 'Report', icon: '📋' }
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tab Headers */}
      <div className="border-b bg-gray-50">
        <nav className="flex space-x-1 p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 shadow-sm border'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span className="text-xs">{tab.icon}</span>
              <span>{tab.name}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'patient' && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Patient Information</h3>
              {patientData?.photo && (
                <div className="mb-4 text-center">
                  <img
                    src={patientData.photo}
                    alt="Patient"
                    className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-gray-200"
                  />
                </div>
              )}
            </div>

            <dl className="space-y-1">
              <InfoItem 
                label="Full Name" 
                value={patientData?.fullName} 
                copyable 
              />
              <InfoItem 
                label="Patient ID" 
                value={patientData?.patientId || patientData?.patientID} 
                copyable 
              />
              <InfoItem 
                label="Date of Birth" 
                value={patientData?.dateOfBirth ? formatDate(patientData.dateOfBirth) : 'N/A'} 
              />
              <InfoItem 
                label="Age" 
                value={patientData?.age || formatAge(patientData?.dateOfBirth)} 
              />
              <InfoItem 
                label="Gender" 
                value={patientData?.gender} 
              />
              <InfoItem 
                label="Phone" 
                value={patientData?.phone} 
                copyable 
              />
              <InfoItem 
                label="Email" 
                value={patientData?.email} 
                copyable 
              />
              <InfoItem 
                label="Address" 
                value={patientData?.address} 
                copyable 
              />
              <InfoItem 
                label="Emergency Contact" 
                value={patientData?.emergencyContact} 
                copyable 
              />
              <InfoItem 
                label="Insurance" 
                value={patientData?.insurance} 
              />
              <InfoItem 
                label="MRN" 
                value={patientData?.mrn} 
                copyable 
              />
            </dl>
          </div>
        )}

        {activeTab === 'study' && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Study Details</h3>
            </div>

            <dl className="space-y-1">
              <InfoItem 
                label="Study Instance UID" 
                value={studyData?.studyInstanceUID} 
                copyable 
              />
              <InfoItem 
                label="Accession Number" 
                value={studyData?.accessionNumber} 
                copyable 
              />
              <InfoItem 
                label="Modality" 
                value={studyData?.modality} 
              />
              <InfoItem 
                label="Study Date" 
                value={studyData?.studyDate ? formatDate(studyData.studyDate) : 'N/A'} 
              />
              <InfoItem 
                label="Study Time" 
                value={studyData?.studyTime} 
              />
              <InfoItem 
                label="Exam Description" 
                value={studyData?.examDescription} 
              />
              <InfoItem 
                label="Body Part" 
                value={studyData?.bodyPart} 
              />
              <InfoItem 
                label="Protocol Name" 
                value={studyData?.protocolName} 
              />
              <InfoItem 
                label="Institution" 
                value={studyData?.institutionName} 
              />
              <InfoItem 
                label="Station Name" 
                value={studyData?.stationName} 
              />
              <InfoItem 
                label="Operator" 
                value={studyData?.operatorName} 
              />
              <InfoItem 
                label="Referring Physician" 
                value={studyData?.referringPhysician} 
              />
              <InfoItem 
                label="Series Count" 
                value={studyData?.seriesCount?.toString()} 
              />
              <InfoItem 
                label="Instance Count" 
                value={studyData?.instanceCount?.toString()} 
              />
              <InfoItem 
                label="Study Size" 
                value={studyData?.studySize} 
              />
              <InfoItem 
                label="Workflow Status" 
                value={studyData?.workflowStatus} 
              />
            </dl>

            {studyData?.modalitiesInStudy && studyData.modalitiesInStudy.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-800 mb-2 text-sm">Modalities in Study</h4>
                <div className="flex flex-wrap gap-1">
                  {studyData.modalitiesInStudy.map((modality, index) => (
                    <span 
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                    >
                      {modality}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'report' && (
          <div className="p-4">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Report Data</h3>
              <p className="text-sm text-gray-600">Data that will be used in the report</p>
            </div>

            <dl className="space-y-1">
              <InfoItem 
                label="Patient Name" 
                value={reportData?.patientName} 
                copyable 
              />
              <InfoItem 
                label="Patient ID" 
                value={reportData?.patientId} 
                copyable 
              />
              <InfoItem 
                label="Age" 
                value={reportData?.age?.toString()} 
              />
              <InfoItem 
                label="Gender" 
                value={reportData?.gender} 
              />
              <InfoItem 
                label="Study Date" 
                value={reportData?.studyDate ? formatDate(reportData.studyDate) : 'N/A'} 
              />
              <InfoItem 
                label="Modality" 
                value={reportData?.modality} 
              />
              <InfoItem 
                label="Accession Number" 
                value={reportData?.accessionNumber} 
                copyable 
              />
              <InfoItem 
                label="Referring Physician" 
                value={reportData?.referringPhysician} 
              />
              <InfoItem 
                label="Exam Description" 
                value={reportData?.examDescription} 
              />
              <InfoItem 
                label="Institution" 
                value={reportData?.institutionName} 
              />
            </dl>

            <div className="mt-6 p-3 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2 text-sm">Quick Copy</h4>
              <p className="text-xs text-blue-700 mb-2">Common patient identifiers for quick access:</p>
              <div className="space-y-1">
                <button
                  onClick={() => navigator.clipboard.writeText(`${reportData?.patientName} (${reportData?.patientId})`)}
                  className="w-full text-left p-2 bg-white rounded border text-sm hover:bg-blue-50 transition-colors"
                >
                  {reportData?.patientName} ({reportData?.patientId})
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(`${reportData?.age} ${reportData?.gender}`)}
                  className="w-full text-left p-2 bg-white rounded border text-sm hover:bg-blue-50 transition-colors"
                >
                  {reportData?.age} {reportData?.gender}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(reportData?.accessionNumber || '')}
                  className="w-full text-left p-2 bg-white rounded border text-sm hover:bg-blue-50 transition-colors"
                >
                  Acc: {reportData?.accessionNumber}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t bg-gray-50 p-3">
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Study ID:</span>
            <span className="font-mono">{studyData?._id?.slice(-8) || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span>Last Updated:</span>
            <span>{studyData?.updatedAt ? formatDateTime(studyData.updatedAt) : 'N/A'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientInfoPanel;