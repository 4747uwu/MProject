import React from 'react';
import AdminNavbar from '../../components/layout/AdminNavbar';
import DoctorRegistrationForm from '../../components/admin/DoctorRegistrationForm';

const NewDoctorPage = () => {
  return (
    <div className="min-h-screen  bg-white">
      
      <div className="container max-h-[80vh] mx-auto max-w-full p-0 pt-6">
        
        
        <DoctorRegistrationForm />
      </div>
    </div>
  );
};

export default NewDoctorPage;