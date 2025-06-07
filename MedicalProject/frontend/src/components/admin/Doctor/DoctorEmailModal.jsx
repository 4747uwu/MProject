// \experimental\MedicalProject\frontend\src\components\admin\doctors\DoctorEmailModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../../services/api';

const DoctorEmailModal = ({ isOpen, onClose, doctor }) => {
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    emailType: 'custom'
  });
  const [loading, setLoading] = useState(false);

  const emailTemplates = {
    reminder: {
      subject: 'Reminder: Pending Studies - Medical Platform',
      message: 'Dear Dr. [DOCTOR_NAME],\n\nThis is a friendly reminder that you have pending studies awaiting your review.\n\nPlease log in to the medical platform to complete your assigned reports.\n\nThank you for your attention to this matter.'
    },
    notification: {
      subject: 'Important Update - Medical Platform',
      message: 'Dear Dr. [DOCTOR_NAME],\n\nWe wanted to notify you of an important update regarding the medical platform.\n\n[Please add your notification details here]\n\nIf you have any questions, please don\'t hesitate to contact the administration.'
    },
    warning: {
      subject: 'Important Notice - Medical Platform',
      message: 'Dear Dr. [DOCTOR_NAME],\n\nThis is an important notice regarding your account or pending responsibilities.\n\n[Please add warning details here]\n\nPlease take appropriate action as soon as possible.'
    },
    welcome: {
      subject: 'Welcome to Medical Platform - Account Information',
      message: 'Dear Dr. [DOCTOR_NAME],\n\nWelcome to the Medical Platform! Your account has been successfully created.\n\nPlease log in to the platform to begin reviewing assigned studies.\n\nWelcome to the team!'
    }
  };

  const handleTemplateChange = (templateType) => {
    if (templateType === 'custom') {
      setFormData(prev => ({
        ...prev,
        emailType: templateType,
        subject: '',
        message: ''
      }));
    } else {
      const template = emailTemplates[templateType];
      setFormData(prev => ({
        ...prev,
        emailType: templateType,
        subject: template.subject,
        message: template.message.replace('[DOCTOR_NAME]', doctor?.fullName || 'Doctor')
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.subject.trim() || !formData.message.trim()) {
      toast.error('Subject and message are required');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post(`/admin/doctors/${doctor._id}/send-email`, formData);
      
      if (response.data.success) {
        toast.success(response.data.message);
        onClose();
      }
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error(error.response?.data?.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Send Email to Doctor
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Doctor Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 h-12 w-12">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {doctor?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Dr. {doctor?.fullName}</p>
                  <p className="text-sm text-gray-500">{doctor?.specialization}</p>
                  <p className="text-sm text-gray-500">{doctor?.email}</p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Template Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Template
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { value: 'custom', label: 'Custom', icon: '✏️' },
                    { value: 'reminder', label: 'Reminder', icon: '🔔' },
                    { value: 'notification', label: 'Notification', icon: '📢' },
                    { value: 'warning', label: 'Warning', icon: '⚠️' }
                  ].map((template) => (
                    <button
                      key={template.value}
                      type="button"
                      onClick={() => handleTemplateChange(template.value)}
                      className={`p-3 text-sm border rounded-lg text-center transition-all ${
                        formData.emailType === template.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="text-xl mb-1">{template.icon}</div>
                      <div className="font-medium">{template.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter email subject"
                  required
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message *
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your message here..."
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  The email will be formatted with our professional template design
                </p>
              </div>

              {/* Preview Section */}
              {formData.subject && formData.message && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Email Preview:</h4>
                  <div className="bg-white border rounded p-3">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900 mb-1">
                        To: {doctor?.email}
                      </div>
                      <div className="font-medium text-gray-900 mb-3">
                        Subject: {formData.subject}
                      </div>
                      <div className="text-gray-700 whitespace-pre-wrap border-t pt-3">
                        {formData.message}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !formData.subject.trim() || !formData.message.trim()}
                  className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    loading || !formData.subject.trim() || !formData.message.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending Email...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      Send Email
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorEmailModal;