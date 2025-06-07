import React from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { format } from 'date-fns';

const WorklistFooter = ({ 
  total = 0, 
  selectedStudies = [],
  filters = {},
  isReportPage = false
}) => {
  // Function to handle study assignment
  const handleAssignStudy = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to assign');
      return;
    }
    
    try {
      // Show loading toast
      toast.loading('Assigning selected studies...');
      
      // API call to assign studies
      const response = await api.post('/studies/assign', {
        studyIds: selectedStudies
      });
      
      // Dismiss loading toast
      toast.dismiss();
      
      if (response.data.success) {
        toast.success(`Successfully assigned ${selectedStudies.length} studies`);
      } else {
        toast.error(response.data.message || 'Failed to assign studies');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error assigning studies:', error);
      toast.error('Failed to assign studies. Please try again.');
    }
  };
  
  // Function to handle unauthorized setting
  const handleUnauthorized = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to mark as unauthorized');
      return;
    }
    
    try {
      toast.loading('Marking studies as unauthorized...');
      
      const response = await api.post('/studies/unauthorized', {
        studyIds: selectedStudies
      });
      
      toast.dismiss();
      
      if (response.data.success) {
        toast.success(`Marked ${selectedStudies.length} studies as unauthorized`);
      } else {
        toast.error(response.data.message || 'Failed to update study status');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error marking studies as unauthorized:', error);
      toast.error('Failed to update study status. Please try again.');
    }
  };
  
  // Function to handle worklist export
  const handleExportWorklist = async () => {
    try {
      toast.loading('Preparing worklist export...');
      
      // Use either selected studies or filters for export
      const params = selectedStudies.length > 0 
        ? { studyIds: selectedStudies.join(',') }
        : filters;
      
      // If this is a report page, use a different endpoint
      const endpoint = isReportPage ? '/reports/tat/export' : '/worklist/export';
      
      const response = await api.get(endpoint, {
        params,
        responseType: 'blob' // Important for binary downloads
      });
      
      toast.dismiss();
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${isReportPage ? 'TAT_Report' : 'Worklist'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Export completed successfully');
    } catch (error) {
      toast.dismiss();
      console.error('Error exporting worklist:', error);
      toast.error('Failed to export worklist. Please try again.');
    }
  };
  
  // Function to handle report dispatch
  const handleDispatchReport = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to dispatch report');
      return;
    }
    
    try {
      toast.loading('Dispatching reports...');
      
      const response = await api.post('/reports/dispatch', {
        studyIds: selectedStudies
      });
      
      toast.dismiss();
      
      if (response.data.success) {
        toast.success(`Successfully dispatched ${selectedStudies.length} reports`);
      } else {
        toast.error(response.data.message || 'Failed to dispatch reports');
      }
    } catch (error) {
      toast.dismiss();
      console.error('Error dispatching reports:', error);
      toast.error('Failed to dispatch reports. Please try again.');
    }
  };
  
  // Function to handle bulk zip download
  const handleBulkZipDownload = async () => {
    if (selectedStudies.length === 0) {
      toast.error('Please select at least one study to download');
      return;
    }
    
    try {
      toast.loading('Preparing bulk download...');
      
      const response = await api.get('/studies/download-zip', {
        params: { studyIds: selectedStudies.join(',') },
        responseType: 'blob' // Important for binary downloads
      });
      
      toast.dismiss();
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Studies_${format(new Date(), 'yyyy-MM-dd')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Download started successfully');
    } catch (error) {
      toast.dismiss();
      console.error('Error downloading zip:', error);
      toast.error('Failed to download studies. Please try again.');
    }
  };

  return (
    <div className="bg-gray-800 text-white w-full py-2 px-3 flex items-center justify-between border-t border-gray-700 fixed bottom-0 left-0 right-0 z-30">
      <div className="flex items-center">
        {/* Logo */}
        <div className="pr-4 flex items-center">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 mr-2 text-gray-300" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2"/>
            <path d="M12 18V12M12 12L15 9M12 12L9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span className="uppercase font-semibold tracking-wider text-md">PERFORM</span>
        </div>
        
        {/* Action Buttons */}
        <div className="flex space-x-1">
          <button 
            onClick={handleAssignStudy}
            className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={selectedStudies.length === 0}
          >
            Assign Study
          </button>
          
          <button 
            onClick={handleUnauthorized}
            className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={selectedStudies.length === 0}
          >
            Unauthorized
          </button>
          
          <button 
            onClick={handleExportWorklist}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded"
          >
            Export Worklist
          </button>
          
          <button 
            onClick={handleDispatchReport}
            className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={selectedStudies.length === 0}
          >
            Dispatch Report
          </button>
          
          <button 
            onClick={handleBulkZipDownload}
            className={`px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 transition-colors rounded ${selectedStudies.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={selectedStudies.length === 0}
          >
            Bulk Zip Download
          </button>
        </div>
      </div>
      
      {/* Total Count */}
      <div className="flex items-center mr-4">
        <span className="text-sm">Total : {total}</span>
      </div>
    </div>
  );
};

export default WorklistFooter;