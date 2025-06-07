import React, { useState, useEffect } from 'react';
import api from '../../../services/api';
import LoadingSpinner from '../../../common/LoadingSpinner';

const PatientDetailModal = ({ isOpen, onClose, patientId }) => {
  const [patientDetails, setPatientDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clinical');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploadType, setUploadType] = useState('Clinical');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [clinicalHistoryChecked, setClinicalHistoryChecked] = useState(true);
  const [previousInjuryChecked, setPreviousInjuryChecked] = useState(false);
  const [previousSurgeryChecked, setPreviousSurgeryChecked] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [referralInfo, setReferralInfo] = useState('');

  useEffect(() => {
    if (isOpen && patientId) {
      fetchPatientDetails();
    }
  }, [isOpen, patientId]);

  const fetchPatientDetails = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await api.get(`/admin/patients/${patientId}/detailed-view`);
      console.log('Patient Details:', response.data);
      
      // Store the response data directly
      setPatientDetails(response.data.data);
      
      // Initialize checkboxes based on data
      if (response.data.data.clinicalInfo?.clinicalHistory) {
        setClinicalHistoryChecked(true);
      }
      if (response.data.data.clinicalInfo?.previousInjury) {
        setPreviousInjuryChecked(true);
      }
      if (response.data.data.clinicalInfo?.previousSurgery) {
        setPreviousSurgeryChecked(true);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching patient details:', error);
      setError('An error occurred while fetching patient details');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUploadFile = () => {
    if (!selectedFile) return;
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('type', uploadType);
    formData.append('patientId', patientId);
    
    setUploading(true);
    
    api.post('/api/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })
    .then(() => {
      setSelectedFile(null);
      fetchPatientDetails();
    })
    .catch(error => {
      console.error('Error uploading file:', error);
      setError('Failed to upload document');
    })
    .finally(() => {
      setUploading(false);
    });
  };

  const handleSave = () => {
    // Save patient information
    const updatedData = {
      // Include the fields that can be edited
      referralInfo,
      clinicalInfo: {
        clinicalHistory: clinicalHistoryChecked ? patientDetails?.clinicalInfo?.clinicalHistory : '',
        previousInjury: previousInjuryChecked ? patientDetails?.clinicalInfo?.previousInjury : '',
        previousSurgery: previousSurgeryChecked ? patientDetails?.clinicalInfo?.previousSurgery : '',
      }
    };

    api.put(`/admin/patients/${patientId}`, updatedData)
      .then(() => {
        // Success handling
        fetchPatientDetails();
      })
      .catch(error => {
        console.error('Error saving patient data:', error);
        setError('Failed to save patient data');
      });
  };

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    if (!dateStr || dateStr === 'N/A') return '';
    
    // Check if it's in YYYYMMDD format
    if (dateStr.length === 8 && !dateStr.includes('-')) {
      const year = dateStr.substring(0, 4);
      const month = dateStr.substring(4, 6);
      const day = dateStr.substring(6, 8);
      return `${day}-${month}-${year}`;
    }
    
    return dateStr;
  };

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 overflow-y-auto h-full w-full z-50">
      <div className="relative w-full mx-auto bg-white shadow-lg" style={{maxWidth: "95%"}}>
        {/* Header */}
        <div className="bg-gray-600 text-white p-2 flex justify-between items-center">
          <h3 className="text-xl">{patientDetails?.patientInfo?.fullName || 'MRS GAYTRI TIWARI'}</h3>
          <button onClick={onClose} className="text-white hover:text-gray-300">
            <span className="text-2xl">×</span>
          </button>
        </div>

        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-300">
          <button
            onClick={() => setActiveTab('clinical')}
            className={`px-4 py-2 ${
              activeTab === 'clinical' ? 'bg-white text-blue-700' : 'bg-gray-200'
            }`}
          >
            CLINICAL HISTORY
          </button>
          <button
            onClick={() => setActiveTab('visit')}
            className={`px-4 py-2 ${
              activeTab === 'visit' ? 'bg-white text-blue-700' : 'bg-gray-200'
            }`}
          >
            VISIT INFORMATION
          </button>
          <div className="flex-grow bg-gray-700 text-white px-4 flex items-center justify-between">
            <div>TOTAL TAT:</div>
            <div>REMAINING TIME:</div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <LoadingSpinner />
            <p className="mt-2">Loading patient details...</p>
          </div>
        ) : (
          <div className="p-0">
            {/* Patient & Study Related Information Section */}
            <div className="bg-beige-100 p-4" style={{ backgroundColor: '#f5f5dc' }}>
              <h2 className="text-gray-700 font-medium mb-4">Patient & Study Related Information</h2>
              
              <div className="grid grid-cols-5 gap-4">
                {/* Row 1 */}
                <div>
                  <label className="block text-sm mb-1">Salutation</label>
                  <select className="w-full border p-1.5" defaultValue="SELECT">
                    <option>SELECT</option>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Ms</option>
                    <option>Dr</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Patient Name</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.patientInfo?.fullName || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Patient ID</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.patientInfo?.patientId || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Age</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.patientInfo?.age || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Gender</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.patientInfo?.gender || ''}
                    readOnly
                  />
                </div>

                {/* Row 2 */}
                <div>
                  <label className="block text-sm mb-1">Accession No</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.studyInfo?.accessionNumber || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">DOB</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.patientInfo?.dateOfBirth || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Images</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={(patientDetails?.studyInfo?.images?.length || 0).toString()}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Series</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value=""
                    readOnly
                  />
                </div>
                <div></div>

                {/* Row 3 */}
                <div>
                  <label className="block text-sm mb-1">Exam Description</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.visitInfo?.examDescription || ''}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Code</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    defaultValue=""
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Center's</label>
                  <select className="w-full border p-1.5" defaultValue={patientDetails?.visitInfo?.center || 'ASHOK HOSPITAL'}>
                    <option>{patientDetails?.visitInfo?.center || 'ASHOK HOSPITAL'}</option>
                    <option>OTHER HOSPITAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Date</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={formatDate(patientDetails?.visitInfo?.studyDate)}
                    readOnly
                  />
                </div>
                <div></div>

                {/* Row 4 */}
                <div>
                  <label className="block text-sm mb-1">Case Type</label>
                  <select className="w-full border p-1.5" defaultValue={patientDetails?.visitInfo?.caseType || ''}>
                    <option value=""></option>
                    <option value="ROUTINE">ROUTINE</option>
                    <option value="URGENT">URGENT</option>
                    <option value="EMERGENCY">EMERGENCY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Study status change</label>
                  <select className="w-full border p-1.5" defaultValue="SELECT">
                    <option>SELECT</option>
                    <option>NEW</option>
                    <option>IN_PROGRESS</option>
                    <option>COMPLETED</option>
                    <option>VERIFIED</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button className="bg-gray-600 text-white p-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="col-span-2 row-span-2">
                  <select className="w-full border p-1.5 mb-1" defaultValue="SELECT">
                    <option>SELECT</option>
                  </select>
                  <textarea 
                    className="w-full h-[85%] border p-1.5" 
                    placeholder="(Select this if you need immediate Report or meet referral doctor)"
                    value={referralInfo}
                    onChange={(e) => setReferralInfo(e.target.value)}
                  ></textarea>
                </div>

                {/* Row 5 */}
                <div>
                  <label className="block text-sm mb-1">Study Attribute Type</label>
                  <select className="w-full border p-1.5" defaultValue="SELECT">
                    <option>SELECT</option>
                    <option>TYPE 1</option>
                    <option>TYPE 2</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm mb-1">Modified Date</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={formatDate(patientDetails?.visitInfo?.orderDate?.split('T')[0])}
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Time</label>
                  <input 
                    type="text" 
                    className="w-full border p-1.5" 
                    value={patientDetails?.visitInfo?.orderDate ? 
                      patientDetails.visitInfo.orderDate.split('T')[1].substring(0, 8) : 
                      ''}
                    readOnly
                  />
                </div>
              </div>
            </div>

            {/* Clinical Information Section - Two columns side by side */}
            <div className="p-4">
              <h2 className="text-gray-700 font-medium mb-4">Clinical Information</h2>
              
              <div className="flex flex-row">
                {/* Left side - Clinical History */}
                <div className="flex-1 pr-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex-grow"></div>
                    <div className="flex items-center">
                      <span className="mr-2">ReportDate</span>
                      <input 
                        type="text" 
                        className="border p-1.5 mr-4 w-32" 
                        value={formatDate(patientDetails?.visitInfo?.studyDate)}
                        readOnly
                      />
                      <span className="mr-2">Time</span>
                      <input 
                        type="text" 
                        className="border p-1.5 w-20" 
                        value="00:00"
                        readOnly
                      />
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex items-start">
                      <input 
                        type="checkbox" 
                        id="clinicalHistory" 
                        className="mt-1"
                        checked={clinicalHistoryChecked}
                        onChange={() => setClinicalHistoryChecked(!clinicalHistoryChecked)}
                      />
                      <label htmlFor="clinicalHistory" className="ml-2 block text-sm">Clinical History</label>
                    </div>
                    <textarea 
                      className="w-full border p-1.5 mt-1" 
                      rows="6"
                      value={clinicalHistoryChecked ? (patientDetails?.clinicalInfo?.clinicalHistory || `${patientDetails?.visitInfo?.examType || ''} ${patientDetails?.visitInfo?.examDescription || ''}`) : ''}
                      onChange={(e) => {
                        if (patientDetails && clinicalHistoryChecked) {
                          setPatientDetails({
                            ...patientDetails,
                            clinicalInfo: {
                              ...patientDetails.clinicalInfo,
                              clinicalHistory: e.target.value
                            }
                          });
                        }
                      }}
                      readOnly={!clinicalHistoryChecked}
                    ></textarea>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex items-start">
                      <input 
                        type="checkbox" 
                        id="previousInjury" 
                        className="mt-1"
                        checked={previousInjuryChecked}
                        onChange={() => setPreviousInjuryChecked(!previousInjuryChecked)}
                      />
                      <label htmlFor="previousInjury" className="ml-2 block text-sm">Previous Injury</label>
                    </div>
                    <textarea 
                      className="w-full border p-1.5 mt-1" 
                      rows="2"
                      value={previousInjuryChecked ? (patientDetails?.clinicalInfo?.previousInjury || '') : ''}
                      onChange={(e) => {
                        if (patientDetails && previousInjuryChecked) {
                          setPatientDetails({
                            ...patientDetails,
                            clinicalInfo: {
                              ...patientDetails.clinicalInfo,
                              previousInjury: e.target.value
                            }
                          });
                        }
                      }}
                      readOnly={!previousInjuryChecked}
                    ></textarea>
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex items-start">
                      <input 
                        type="checkbox" 
                        id="previousSurgery" 
                        className="mt-1"
                        checked={previousSurgeryChecked}
                        onChange={() => setPreviousSurgeryChecked(!previousSurgeryChecked)}
                      />
                      <label htmlFor="previousSurgery" className="ml-2 block text-sm">Previous Surgery</label>
                    </div>
                    <textarea 
                      className="w-full border p-1.5 mt-1" 
                      rows="2"
                      value={previousSurgeryChecked ? (patientDetails?.clinicalInfo?.previousSurgery || '') : ''}
                      onChange={(e) => {
                        if (patientDetails && previousSurgeryChecked) {
                          setPatientDetails({
                            ...patientDetails,
                            clinicalInfo: {
                              ...patientDetails.clinicalInfo,
                              previousSurgery: e.target.value
                            }
                          });
                        }
                      }}
                      readOnly={!previousSurgeryChecked}
                    ></textarea>
                  </div>
                </div>
                
                {/* Right side - Attach Documents */}
                <div className="flex-1 pl-4">
                  <h2 className="text-gray-700 font-medium mb-2">Attach Documents</h2>
                  <p className="text-red-500 text-sm mb-3">(Select a file from the local pc and click upload the attachments)</p>
                  
                  <div className="flex items-center mb-3">
                    <label className="bg-gray-300 text-gray-700 py-1 px-3 border border-gray-500 cursor-pointer">
                      <span className="flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        Choose a file...
                      </span>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                    </label>
                    
                    <select 
                      className="ml-2 border p-1.5" 
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value)}
                    >
                      <option>Clinical</option>
                      <option>Radiology</option>
                      <option>Lab</option>
                      <option>Other</option>
                    </select>
                    
                    <button 
                      className="ml-2 bg-gray-600 text-white py-1 px-3"
                      onClick={handleUploadFile}
                      disabled={!selectedFile || uploading}
                    >
                      {uploading ? 'Uploading...' : 'UploadFile'}
                    </button>
                    
                    <button className="ml-2 bg-gray-600 text-white py-1 px-3">
                      ScanFile
                    </button>
                  </div>
                  
                  <table className="w-full mt-2 border">
                    <thead>
                      <tr className="bg-gray-700 text-white">
                        <th className="p-2 text-left">File</th>
                        <th className="p-2 text-left">Type</th>
                        <th className="p-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientDetails?.documents && patientDetails.documents.length > 0 ? (
                        patientDetails.documents.map((doc, index) => (
                          <tr key={index} className="hover:bg-gray-100">
                            <td className="p-2">{doc.fileName}</td>
                            <td className="p-2">{doc.fileType}</td>
                            <td className="p-2">
                              <button className="text-blue-600 hover:underline mr-2">View</button>
                              <button className="text-red-600 hover:underline">Delete</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr className="bg-yellow-100">
                          <td className="p-2 text-center" colSpan="3">No Clinical Attachment...!</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-center p-4 border-t">
              <button className="bg-green-500 text-white px-8 py-2 mx-2 flex items-center">
                <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print
              </button>
              <button 
                className="bg-blue-700 text-white px-8 py-2 mx-2"
                onClick={handleSave}
              >
                Save
              </button>
              <button 
                className="bg-red-500 text-white px-8 py-2 mx-2" 
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDetailModal;