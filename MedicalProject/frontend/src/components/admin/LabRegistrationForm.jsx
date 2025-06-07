import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GradientInfoPanel from '../layout/GradientInfo';
import api from '../../services/api';

const LabRegistrationForm = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 3;
  
  // Lab Details
  const [labName, setLabName] = useState('');
  const [labIdentifier, setLabIdentifier] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [labNotes, setLabNotes] = useState('');
  const [labIsActive, setLabIsActive] = useState(true);
  
  // Address
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [country, setCountry] = useState('');
  
  // Staff Details
  const [staffUsername, setStaffUsername] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffFullName, setStaffFullName] = useState('');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Step navigation functions
  const nextStep = () => {
    // Validate current step
    if (currentStep === 1) {
      if (!labName || !labIdentifier) {
        setError('Laboratory name and identifier are required.');
        return;
      }
    } else if (currentStep === 2) {
      // Address validation is optional
    }
    
    setError('');
    setCurrentStep(prev => Math.min(prev + 1, totalSteps));
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError('');
  };

  // Final submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    
    // Final validation before submission
    if (!staffUsername || !staffEmail || !staffFullName) {
      setError('Staff username, email, and full name are required.');
      setIsSubmitting(false);
      return;
    }
    
    try {
      await api.post('/admin/labs/register', {
        labName,
        labIdentifier: labIdentifier.toUpperCase(),
        contactPerson,
        contactEmail,
        contactPhone,
        address: {
          street,
          city,
          state,
          zipCode,
          country
        },
        labNotes,
        labIsActive,
        staffUsername,
        staffEmail,
        staffFullName
      });
      
      setSuccess('Laboratory and staff registered successfully! A password has been generated and sent to the staff email.');
      setTimeout(() => {
        navigate('/admin/dashboard');
      }, 2000);
    } catch (error) {
      console.error('Error registering lab:', error);
      
      if (error.response && error.response.data && error.response.data.message) {
        setError(error.response.data.message);
      } else {
        setError('An error occurred while registering the lab. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Left panel features list
  const labFeatures = [
    "Automated staff account creation",
    "Secure password generation",
    "Complete lab management system",
    "Email notification system"
  ];

  // Common CSS for step containers
  const stepContainerClass = "bg-white shadow-lg rounded-xl p-6 border border-gray-100 w-full max-w-3xl";

  // Add this function to handle the close action
  const handleClose = () => {
    // Check if any data has been entered
    const hasData = 
      labName || 
      labIdentifier || 
      contactPerson || 
      contactEmail || 
      contactPhone || 
      street || 
      city || 
      state || 
      zipCode || 
      country || 
      staffUsername || 
      staffEmail || 
      staffFullName || 
      labNotes;
      
    if (hasData) {
      // Show confirmation dialog if data exists
      setShowCloseConfirm(true);
    } else {
      // Navigate away directly if no data entered
      navigate('/admin/dashboard');
    }
  };

  // Add this to handle confirmation dialog actions
  const confirmClose = () => {
    navigate('/admin/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Side - Using our new reusable component with orange color */}
      <GradientInfoPanel 
        title="Lab Registration" 
        subtitle="Register new laboratories and create staff accounts to expand your medical network"
        features={labFeatures}
        primaryColor="orange"
        secondaryColor="amber"
      />

      {/* Right Side - Form (now multi-step) */}
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
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Lab Registration</h1>
              <p className="text-gray-600">Register new laboratories and create staff accounts</p>
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
                          ? 'bg-orange-500 text-white' 
                          : 'bg-gray-200 text-gray-600'}`}
                    >
                      {step}
                    </div>
                    
                    {/* Connector Line */}
                    {step < 3 && (
                      <div className={`h-1 w-16 mx-1 
                        ${currentStep > step 
                          ? 'bg-orange-500' 
                          : 'bg-gray-200'}`}
                      ></div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              
              {/* Step Labels */}
              <div className="flex items-center justify-between text-xs text-gray-600 px-2">
                <div className="w-20 text-center">Lab Info</div>
                <div className="w-20 text-center">Address</div>
                <div className="w-20 text-center">Staff Account</div>
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

            {/* STEP 1 - Lab Information */}
            {currentStep === 1 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Lab Information</h2>
                  <p className="text-gray-600 text-sm">Enter the basic details of the laboratory</p>
                </div>
                
                <div className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="labName" className="block text-sm font-medium text-gray-700 mb-1">
                        Laboratory Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="labName"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. City General Hospital Radiology"
                        value={labName}
                        onChange={(e) => setLabName(e.target.value)}
                        required
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="labIdentifier" className="block text-sm font-medium text-gray-700 mb-1">
                        Identifier <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="labIdentifier"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. CGH_RAD"
                        value={labIdentifier}
                        onChange={(e) => setLabIdentifier(e.target.value)}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        A unique identifier (will be converted to uppercase)
                      </p>
                    </div>
                    
                    <div>
                      <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Person
                      </label>
                      <input
                        id="contactPerson"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. John Smith"
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="contactEmail" className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Email
                      </label>
                      <input
                        id="contactEmail"
                        type="email"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. contact@lab.com"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="contactPhone" className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Phone
                      </label>
                      <input
                        id="contactPhone"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. +1 123-456-7890"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="labIsActive" className="block text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        id="labIsActive"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        value={labIsActive}
                        onChange={(e) => setLabIsActive(e.target.value === "true")}
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
                      className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                    >
                      Continue to Address
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* STEP 2 - Address */}
            {currentStep === 2 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Address Information</h2>
                  <p className="text-gray-600 text-sm">Enter the laboratory's location details</p>
                </div>
                
                <div className="space-y-5">
                  <div>
                    <label htmlFor="street" className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
                    </label>
                    <input
                      id="street"
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                      placeholder="e.g. 123 Main St"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <input
                        id="city"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. New York"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                        State/Province
                      </label>
                      <input
                        id="state"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. NY"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700 mb-1">
                        Postal/ZIP Code
                      </label>
                      <input
                        id="zipCode"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. 10001"
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                      </label>
                      <input
                        id="country"
                        type="text"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="e.g. United States"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
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
                      className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                    >
                      Continue to Staff Account
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* STEP 3 - Staff Account */}
            {currentStep === 3 && (
              <div className={`${stepContainerClass} animate-fade-in`}>
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Staff Account</h2>
                  <p className="text-gray-600 text-sm">Create an initial staff account for this laboratory</p>
                </div>
                
                {/* Info Banner */}
                <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-6 rounded-r-lg">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-xs text-blue-700">
                        A secure random password will be generated automatically and sent to the staff email address.
                      </p>
                    </div>
                  </div>
                </div>
                
                <form onSubmit={handleSubmit}>
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="staffUsername" className="block text-sm font-medium text-gray-700 mb-1">
                          Username <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="staffUsername"
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                          placeholder="e.g. lab_user1"
                          value={staffUsername}
                          onChange={(e) => setStaffUsername(e.target.value)}
                          required
                        />
                      </div>
                      
                      <div>
                        <label htmlFor="staffFullName" className="block text-sm font-medium text-gray-700 mb-1">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="staffFullName"
                          type="text"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                          placeholder="e.g. John Smith"
                          value={staffFullName}
                          onChange={(e) => setStaffFullName(e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="md:col-span-2">
                        <label htmlFor="staffEmail" className="block text-sm font-medium text-gray-700 mb-1">
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="staffEmail"
                          type="email"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                          placeholder="e.g. staff@lab.com"
                          value={staffEmail}
                          onChange={(e) => setStaffEmail(e.target.value)}
                          required
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Login credentials will be sent to this email address.
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="labNotes" className="block text-sm font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <textarea
                        id="labNotes"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
                        placeholder="Any additional notes about this laboratory..."
                        value={labNotes}
                        onChange={(e) => setLabNotes(e.target.value)}
                      ></textarea>
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
                        className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg hover:from-orange-600 hover:to-amber-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 transition-all duration-200 text-sm font-medium shadow"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Registering...
                          </span>
                        ) : (
                          "Register Laboratory"
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

export default LabRegistrationForm;