import React from 'react';
import AdminNavbar from '../../components/layout/AdminNavbar';
import LabRegistrationForm from '../../components/admin/LabRegistrationForm';

const NewLabPage = () => {
  return (
    <div className="min-h-screen bg-white">
      
      <div className="container max-h-[80vh] mx-auto max-w-full p-0 pt-6">
        
        
        <LabRegistrationForm />
      </div>
    </div>
  );
};

export default NewLabPage;