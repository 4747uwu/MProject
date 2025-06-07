import React from 'react';
import AdminNavbar from '../../components/layout/AdminNavbar';
import WorklistTable from '../../components/admin/WorklistTable';

const ReportsPage = () => {
  return (
    <div className="min-h-screen bg-gray-100">
      <AdminNavbar />
      
      <div className="container mx-auto p-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Study Reports</h1>
          <p className="text-gray-600">View and manage all medical reports</p>
        </div>
        
        <WorklistTable />
      </div>
    </div>
  );
};

export default ReportsPage;