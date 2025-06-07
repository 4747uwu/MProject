import React from 'react';

const StudySeries = ({ study, isOpen, onClose }) => {
  if (!isOpen) return null;

  // Extract patient and study information
  const patientName = study?.patientName || 'N/A';
  const patientId = study?.patientId || 'N/A';
  const patientAge = study?.ageGender?.split('/')[0].trim() || 'N/A';
  const patientGender = study?.ageGender?.split('/')[1]?.trim() || 'M';
  const accessionNo = study?.accessionNumber || 'N/A';
  const studyDate = study?.studyDate || 
    (study?.studyDateTime ? new Date(study.studyDateTime).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }) : 'N/A');
  const studyTime = study?.studyDateTime ? 
    new Date(study.studyDateTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) : 'N/A';
  const images = study?.numberOfImages || (study?.seriesImages?.split('/')?.[1] || 'N/A');
  const series = study?.numberOfSeries || (study?.seriesImages?.split('/')?.[0] || 'N/A');
  const examDescription = study?.description || 'N/A';
  const modality = study?.modality || 'N/A';

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex justify-center items-start pt-10">
      <div className="bg-white w-full max-w-4xl rounded shadow-lg">
        {/* Header with patient name */}
        <div className="bg-gray-600 text-white px-4 py-2 flex justify-between items-center">
          <h2 className="font-medium">{patientName}</h2>
          <button 
            onClick={onClose} 
            className="text-white hover:text-gray-300"
          >
            <span className="text-xl">×</span>
          </button>
        </div>

        {/* Patient Information Section */}
        <div>
          <h3 className="px-4 py-2 bg-gray-100 font-medium border-b border-gray-300">
            Patient Information
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
            <div>
              <div className="text-sm text-gray-600">Patient Name</div>
              <div className="bg-gray-200 p-2 mt-1">{patientName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Patient Id</div>
              <div className="bg-gray-200 p-2 mt-1">{patientId}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Patient Age</div>
              <div className="bg-gray-200 p-2 mt-1">{patientAge}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Patient Gender</div>
              <div className="bg-gray-200 p-2 mt-1">{patientGender}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Accession No</div>
              <div className="bg-gray-200 p-2 mt-1">{accessionNo}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">StudyDate</div>
              <div className="bg-gray-200 p-2 mt-1">{studyDate}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Images</div>
              <div className="bg-gray-200 p-2 mt-1">{images}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Series</div>
              <div className="bg-gray-200 p-2 mt-1">{series}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Exam Description</div>
              <div className="bg-gray-200 p-2 mt-1">{examDescription}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Modality</div>
              <div className="bg-gray-200 p-2 mt-1">{modality}</div>
            </div>
          </div>
        </div>

        {/* Series Information Table */}
        <div>
          <h3 className="px-4 py-2 bg-gray-100 font-medium border-t border-b border-gray-300">
            Series Information(s)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-gray-700 text-white">
                <tr>
                  <th className="border border-gray-600 p-2 text-left">#</th>
                  <th className="border border-gray-600 p-2 text-left">Series Date</th>
                  <th className="border border-gray-600 p-2 text-left">Series Time</th>
                  <th className="border border-gray-600 p-2 text-left">Series Description</th>
                  <th className="border border-gray-600 p-2 text-left">Part Examined</th>
                  <th className="border border-gray-600 p-2 text-left">Position</th>
                  <th className="border border-gray-600 p-2 text-left"># Images</th>
                </tr>
              </thead>
              <tbody>
                {study?.series && study.series.length > 0 ? (
                  study.series.map((series, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="border border-gray-300 p-2">{idx + 1}</td>
                      <td className="border border-gray-300 p-2">{series.seriesDate || 'N/A'}</td>
                      <td className="border border-gray-300 p-2">{series.seriesTime || 'N/A'}</td>
                      <td className="border border-gray-300 p-2">{series.seriesDescription || 'N/A'}</td>
                      <td className="border border-gray-300 p-2">{series.bodyPart || 'N/A'}</td>
                      <td className="border border-gray-300 p-2">{series.patientPosition || 'N/A'}</td>
                      <td className="border border-gray-300 p-2">{series.numberOfImages || 'N/A'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="7" className="border border-gray-300 p-3 text-center">
                      No Series Found...!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="flex justify-between items-center p-4 bg-gray-100 border-t border-gray-300">
          <button
            onClick={() => window.location.href = study?.instanceID ? `https://viewer.ohif.org/viewer?studyInstanceUIDs=${study.instanceID}` : '#'}
            className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <div className="flex space-x-2">
            <select className="border border-gray-300 rounded px-3 py-2 bg-white">
              <option>--Select Viewer--</option>
              <option>OHIF Viewer</option>
              <option>Basic Viewer</option>
            </select>
            <button
              onClick={onClose}
              className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudySeries;