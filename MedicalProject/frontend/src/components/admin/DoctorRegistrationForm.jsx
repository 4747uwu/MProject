import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GradientInfoPanel from '../layout/GradientInfo';
import api from '../../services/api';

const DoctorRegistrationForm = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const totalSteps = 3;
  
  // User Account Info
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  
  // Doctor Profile Info
  const [specialization, setSpecialization] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [contactPhoneOffice, setContactPhoneOffice] = useState('');
  const [isActiveProfile, setIsActiveProfile] = useState(true);
  
  // Additional Info
  const [biography, setBiography] = useState('');
  const [languages, setLanguages] = useState('');
  const [availableDays, setAvailableDays] = useState([]);

  // 🆕 NEW: Signature Upload State
  const [signatureFile, setSignatureFile] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState('');
  const [signatureError, setSignatureError] = useState('');

  // Step navigation functions
  const nextStep = () => {
    // Validate current step
    if (currentStep === 1) {
      if (!username || !email || !fullName) {
        setError('Username, email, and full name are required.');
        return;
      }
    } else if (currentStep === 2) {
      if (!specialization || !licenseNumber) {
        setError('Specialization and license number are required.');
        return;
      }
    }
    
    setError('');
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError('');
  };
  
  // 🆕 NEW: Handle signature upload
  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    setSignatureError('');
    
    if (file) {
      // Validate file size (2MB limit)
      if (file.size > 2 * 1024 * 1024) {
        setSignatureError('Signature file must be less than 2MB');
        setSignatureFile(null);
        setSignaturePreview('');
        e.target.value = ''; // Clear the input
        return;
      }
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setSignatureError('Please select a valid image file (PNG, JPG, JPEG)');
        setSignatureFile(null);
        setSignaturePreview('');
        e.target.value = '';
        return;
      }
      
      setSignatureFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setSignaturePreview(e.target.result);
      };
      reader.readAsDataURL(file);
      setError('');
    }
  };

  // 🆕 NEW: Remove signature
  const removeSignature = () => {
    setSignatureFile(null);
    setSignaturePreview('');
    setSignatureError('');
    // Clear the file input
    const fileInput = document.getElementById('signature');
    if (fileInput) {
      fileInput.value = '';
    }
  };
  
  // Handle the close action
  const handleClose = () => {
    // Check if any data has been entered
    const hasData = 
      username || 
      email || 
      fullName || 
      specialization || 
      licenseNumber || 
      department || 
      qualifications || 
      yearsOfExperience || 
      contactPhoneOffice || 
      biography || 
      languages ||
      availableDays.length > 0 ||
      signatureFile; // 🆕 NEW: Include signature in data check
      
    if (hasData) {
      // Show confirmation dialog if data exists
      setShowCloseConfirm(true);
    } else {
      // Navigate away directly if no data entered
      navigate('/admin/dashboard');
    }
  };

  // Handle confirmation dialog actions
  const confirmClose = () => {
    navigate('/admin/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    
    // Final validation
    if (!username || !email || !fullName || !specialization || !licenseNumber) {
      setError('Username, email, full name, specialization, and license number are required.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      // 🆕 NEW: Create FormData for file upload
      const formData = new FormData();
      
      // Append all form fields
      formData.append('username', username);
      formData.append('email', email);
      formData.append('fullName', fullName);
      formData.append('specialization', specialization);
      formData.append('licenseNumber', licenseNumber);
      formData.append('department', department);
      formData.append('qualifications', qualifications.split(',').map(q => q.trim()).filter(q => q).join(','));
      formData.append('yearsOfExperience', yearsOfExperience ? parseInt(yearsOfExperience, 10) : '');
      formData.append('contactPhoneOffice', contactPhoneOffice);
      formData.append('isActiveProfile', isActiveProfile);
      formData.append('biography', biography);
      formData.append('languages', languages.split(',').map(l => l.trim()).filter(l => l).join(','));
      formData.append('availableDays', JSON.stringify(availableDays));
      
      // 🆕 NEW: Add signature file if provided
      if (signatureFile) {
        formData.append('signature', signatureFile);
      }

      const response = await api.post('/admin/doctors/register', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      setSuccess(
        `Doctor registered successfully! ${response.data.signatureUploaded ? 'Signature uploaded.' : ''} A password has been generated and sent to the doctor's email.`
      );
      
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
      
    } catch (error) {
      console.error('Error registering doctor:', error);
      
      if (error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('An error occurred while registering the doctor. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Left panel features list
  const doctorFeatures = [
    "Automated account creation",
    "Secure password generation", 
    "Digital signature storage", // 🆕 NEW: Added signature feature
    "Patient assignment system",
    "Integrated reporting tools",
    "Schedule management"
  ];

  // Common CSS for step containers
  const stepContainerClass = "bg-white shadow-lg rounded-xl p-6 border border-gray-100 w-full max-w-3xl";

  // Day selection toggle
  const toggleDay = (day) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter(d => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Side - Using our reusable component with blue color for doctors */}
      <GradientInfoPanel 
        title="Doctor Registration" 
        subtitle="Add medical specialists to your network and enable secure patient care"
        features={doctorFeatures}
        primaryColor="blue"
        secondaryColor="indigo"
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
      />

      {/* Right Side - Form (multi-step) */}
      <div className="flex-1 lg:w-2/3 xl:w-3/5">
        <div className="min-h-screen flex items-center justify-center p-4 md:p-6">
          <div className="w-full max-w-3xl">
            {/* Close Button */}
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gray-200"
                aria-label="Close form"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Confirmation Dialog */}
            {showCloseConfirm && (
              <div className="fixed inset-0 bg-black bg-opacity-25 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Discard changes?</h3>
                  <p className="text-gray-600 mb-6">Any information you've entered will be lost. Are you sure you want to exit?</p>
                  <div className="flex justify-end space-x-3">
                    <button 
                      type="button"
                      onClick={() => setShowCloseConfirm(false)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-150 text-sm font-medium"
                    >
                      Continue editing
                    </button>
                    <button 
                      type="button"
                      onClick={confirmClose}
                      className="px-4 py-2 bg-red-50 border border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-all duration-150 text-sm font-medium"
                    >
                      Discard changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Header (only visible on small screens) */}
            <div className="lg:hidden mb-6 text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Doctor Registration</h1>
              <p className="text-gray-600">Register new doctors and create staff accounts</p>
            </div>

            {/* Progress Steps */}
            <div className="mb-6">
              <div className="flex items-center justify-center mb-4">
                {[1, 2, 3].map((step) => (
                  <React.Fragment key={step}>
                    {/* Step Circle */}
                    <div 
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium 
                        ${currentStep >= step 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-gray-600'}`}
                    >
                      {step}
                    </div>
                    
                    {/* Connector Line */}
                    {step < 3 && (
                      <div className={`h-1 w-16 mx-1 
                        ${currentStep > step 
                          ? 'bg-blue-600' 
                          : 'bg-gray-200'}`}
                      ></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              
              {/* Step Labels */}
              <div className="flex items-center justify-between text-xs text-gray-600 px-2">
                <div className="w-20 text-center">Account Info</div>
                <div className="w-24 text-center">Professional Details</div>
                <div className="w-20 text-center">Additional Info</div>
              </div>
            </div>

            {/* Alert Messages */}
            {error && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}
            
            {success && (
              <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-6 rounded-r-lg">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-green-700">{success}</p>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 1 - Account Information */}
            {currentStep === 1 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Account Information</h2>
                  <p className="text-gray-600 text-sm">Enter the basic details for the doctor's account</p>
                </div>
                
                <div className="space-y-5">
                  {/* Info Banner */}
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-r-lg">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <p className="text-xs text-blue-700">
                          A secure random password will be generated automatically and sent to the doctor's email.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="username"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. dr_smith"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. Dr. John Smith"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. doctor@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Login credentials will be sent to this email address.
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="isActiveProfile" className="block text-sm font-medium text-gray-700 mb-1">
                        Account Status
                      </label>
                      <select
                        id="isActiveProfile"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        value={isActiveProfile}
                        onChange={(e) => setIsActiveProfile(e.target.value === "true")}
                      >
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </div>
                  </div>
                
                  <div className="flex justify-end pt-4">
                    <button
                      type="button"
                      onClick={nextStep}
                      className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                    >
                      Continue to Professional Details
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* STEP 2 - Professional Information */}
            {currentStep === 2 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Professional Details</h2>
                  <p className="text-gray-600 text-sm">Enter the doctor's credentials and specialization</p>
                </div>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="specialization" className="block text-sm font-medium text-gray-700 mb-1">
                        Specialization <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="specialization"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. Radiology"
                        value={specialization}
                        onChange={(e) => setSpecialization(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                        License Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="licenseNumber"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. MD12345"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
                        Department
                      </label>
                      <input
                        id="department"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. Radiology Department"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="contactPhoneOffice" className="block text-sm font-medium text-gray-700 mb-1">
                        Office Phone
                      </label>
                      <input
                        id="contactPhoneOffice"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. +1 123-456-7890"
                        value={contactPhoneOffice}
                        onChange={(e) => setContactPhoneOffice(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="qualifications" className="block text-sm font-medium text-gray-700 mb-1">
                        Qualifications (comma-separated)
                      </label>
                      <input
                        id="qualifications"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. MD, FRCR, PhD"
                        value={qualifications}
                        onChange={(e) => setQualifications(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Separate multiple qualifications with commas
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="yearsOfExperience" className="block text-sm font-medium text-gray-700 mb-1">
                        Years of Experience
                      </label>
                      <input
                        id="yearsOfExperience"
                        type="number"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. 10"
                        value={yearsOfExperience}
                        onChange={(e) => setYearsOfExperience(e.target.value)}
                      />
                    </div>
                  </div>
                
                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={prevStep}
                      className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 text-sm font-medium"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={nextStep}
                      className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                    >
                      Continue to Additional Info
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* STEP 3 - Additional Information & Signature */}
            {currentStep === 3 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Additional Information</h2>
                  <p className="text-gray-600 text-sm">Add optional details and digital signature</p>
                </div>
                
                <form onSubmit={handleSubmit}>
                  <div className="space-y-5">
                    <div>
                      <label htmlFor="biography" className="block text-sm font-medium text-gray-700 mb-1">
                        Professional Biography
                      </label>
                      <textarea
                        id="biography"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="Short biography or professional description..."
                        value={biography}
                        onChange={(e) => setBiography(e.target.value)}
                      ></textarea>
                    </div>
                    
                    <div>
                      <label htmlFor="languages" className="block text-sm font-medium text-gray-700 mb-1">
                        Languages (comma-separated)
                      </label>
                      <input
                        id="languages"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        placeholder="e.g. English, Spanish, French"
                        value={languages}
                        onChange={(e) => setLanguages(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Available Days
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                          <button
                            key={day}
                            type="button"
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors 
                              ${availableDays.includes(day) 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                            onClick={() => toggleDay(day)}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 🆕 NEW: Digital Signature Upload Section */}
                    <div className="border-t border-gray-200 pt-5">
                      <div className="mb-4">
                        <h3 className="text-lg font-medium text-gray-900 mb-1">Digital Signature</h3>
                        <p className="text-sm text-gray-600">Upload a signature image for medical reports (optional)</p>
                      </div>

                      <div>
                        <label htmlFor="signature" className="block text-sm font-medium text-gray-700 mb-1">
                          Doctor Signature (Optional)
                        </label>
                        <input
                          id="signature"
                          type="file"
                          accept="image/*"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          onChange={handleSignatureUpload}
                        />
                        <div className="flex items-start mt-2 space-x-4">
                          <div className="flex-1">
                            <p className="text-xs text-gray-500">
                              Upload a PNG/JPG signature image (max 2MB). Will be optimized for medical reports.
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              Recommended size: 400x200 pixels for best quality
                            </p>
                          </div>
                          {signatureFile && (
                            <button
                              type="button"
                              onClick={removeSignature}
                              className="text-red-600 hover:text-red-800 text-xs font-medium"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        
                        {/* 🆕 NEW: Signature Error Display */}
                        {signatureError && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-xs text-red-600 flex items-center">
                              <svg className="w-4 h-4 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              {signatureError}
                            </p>
                          </div>
                        )}
                        
                        {/* 🆕 NEW: Signature Preview */}
                        {signaturePreview && (
                          <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                            <div className="flex items-start justify-between mb-2">
                              <p className="text-xs font-medium text-gray-700">Signature Preview:</p>
                              <div className="text-xs text-gray-500">
                                {signatureFile && `${(signatureFile.size / 1024).toFixed(1)} KB`}
                              </div>
                            </div>
                            <div className="bg-white border border-gray-300 rounded p-3 flex items-center justify-center min-h-[100px]">
                              <img 
                                src={signaturePreview} 
                                alt="Signature preview" 
                                className="max-h-20 max-w-full object-contain"
                                style={{ filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))' }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              ✓ Signature will be automatically optimized and resized for medical reports
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  
                    <div className="flex justify-between pt-4">
                      <button
                        type="button"
                        onClick={prevStep}
                        className="px-5 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-all duration-200 text-sm font-medium"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {signatureFile ? 'Registering & Uploading...' : 'Registering...'}
                          </span>
                        ) : (
                          <>
                            {signatureFile ? 'Register Doctor & Upload Signature' : 'Register Doctor'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorRegistrationForm;