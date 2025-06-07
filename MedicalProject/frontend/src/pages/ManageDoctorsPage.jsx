import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import UniversalNavbar from '../components/layout/AdminNavbar';
import DoctorTable from '../components/admin/Doctor/DoctorTable';
import DoctorEditModal from '../components/admin/Doctor/DoctorEditModal';
import DoctorDeleteModal from '../components/admin/Doctor/DoctorDeleteModal';
import DoctorEmailModal from '../components/admin/Doctor/DoctorEmailModal';
import DoctorStatsModal from '../components/admin/Doctor/DoctorStatModal';
import api from '../services/api';

const ManageDoctorsPage = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialization, setSelectedSpecialization] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [specializations, setSpecializations] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    specializations: 0
  });

  // Modal states
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  const limit = 10;

  // Fetch doctors with filters
  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/doctors', {
        params: {
          page: currentPage,
          limit,
          search: searchTerm,
          specialization: selectedSpecialization,
          status: selectedStatus
        }
      });

      if (response.data.success) {
        console.log('Doctors fetched successfully:', response.data);
        
        // Set doctors with fallback
        setDoctors(response.data.doctors || []);
        setTotalPages(response.data.totalPages || 1);
        setTotalRecords(response.data.totalRecords || 0);
        
        // Set summary with proper fallbacks
        setSummary({
          total: response.data.summary?.total || 0,
          active: response.data.summary?.active || 0,
          inactive: response.data.summary?.inactive || 0,
          specializations: response.data.summary?.specializations || 0
        });
        
        // Fix: Use the direct specializations field, not nested filters
        setSpecializations(response.data.specializations || []);
        
      } else {
        // Handle unsuccessful response
        setDoctors([]);
        setSummary({ total: 0, active: 0, inactive: 0, specializations: 0 });
        setSpecializations([]);
        toast.error(response.data.message || 'Failed to load doctors');
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
      
      // Reset all state to safe defaults on error
      setDoctors([]);
      setSummary({ total: 0, active: 0, inactive: 0, specializations: 0 });
      setSpecializations([]);
      setTotalPages(1);
      setTotalRecords(0);
      
      toast.error('Failed to load doctors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, [currentPage, searchTerm, selectedSpecialization, selectedStatus]);

  // Handle page change
  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Handle search
  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // Handle filter changes
  const handleSpecializationChange = (specialization) => {
    setSelectedSpecialization(specialization);
    setCurrentPage(1);
  };

  const handleStatusChange = (status) => {
    setSelectedStatus(status);
    setCurrentPage(1);
  };

  // Modal handlers
  const handleEdit = (doctor) => {
    setSelectedDoctor(doctor);
    setEditModalOpen(true);
  };

  const handleDelete = (doctor) => {
    setSelectedDoctor(doctor);
    setDeleteModalOpen(true);
  };

  const handleSendEmail = (doctor) => {
    setSelectedDoctor(doctor);
    setEmailModalOpen(true);
  };

  const handleViewStats = (doctor) => {
    setSelectedDoctor(doctor);
    setStatsModalOpen(true);
  };

  // Handle status toggle
  const handleToggleStatus = async (doctor) => {
    try {
      const newStatus = !doctor.isActive;
      const response = await api.patch(`/admin/doctors/${doctor._id}/toggle-status`, {
        isActive: newStatus
      });

      if (response.data.success) {
        toast.success(response.data.message);
        fetchDoctors(); // Refresh the list
      }
    } catch (error) {
      console.error('Error toggling doctor status:', error);
      toast.error(error.response?.data?.message || 'Failed to update doctor status');
    }
  };

  // Handle password reset
  const handleResetPassword = async (doctor) => {
    if (!window.confirm(`Are you sure you want to reset password for Dr. ${doctor.fullName}?`)) {
      return;
    }

    try {
      const response = await api.post(`/admin/doctors/${doctor._id}/reset-password`, {
        sendEmail: true
      });

      if (response.data.success) {
        toast.success(response.data.message);
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(error.response?.data?.message || 'Failed to reset password');
    }
  };

  // Handle modal close and refresh
  const handleModalClose = () => {
    setEditModalOpen(false);
    setDeleteModalOpen(false);
    setEmailModalOpen(false);
    setStatsModalOpen(false);
    setSelectedDoctor(null);
    fetchDoctors(); // Refresh the list
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <UniversalNavbar />
      
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Doctor Management</h1>
              <p className="text-gray-600 mt-1">Manage all registered doctors in the system</p>
            </div>
            <Link
              to="/admin/new-doctor"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add New Doctor
            </Link>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Doctors</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Active Doctors</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.active}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Inactive Doctors</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.inactive}</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Specializations</p>
                  <p className="text-2xl font-bold text-gray-900">{summary.specializations}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Doctor Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <DoctorTable
            doctors={doctors}
            loading={loading}
            totalRecords={totalRecords}
            currentPage={currentPage}
            totalPages={totalPages}
            searchTerm={searchTerm}
            selectedSpecialization={selectedSpecialization}
            selectedStatus={selectedStatus}
            specializations={specializations}
            onPageChange={handlePageChange}
            onSearch={handleSearch}
            onSpecializationChange={handleSpecializationChange}
            onStatusChange={handleStatusChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onSendEmail={handleSendEmail}
            onViewStats={handleViewStats}
            onToggleStatus={handleToggleStatus}
            onResetPassword={handleResetPassword}
          />
        </div>
      </div>

      {/* Modals */}
      {editModalOpen && selectedDoctor && (
        <DoctorEditModal
          isOpen={editModalOpen}
          onClose={handleModalClose}
          doctor={selectedDoctor}
          specializations={specializations}
        />
      )}

      {deleteModalOpen && selectedDoctor && (
        <DoctorDeleteModal
          isOpen={deleteModalOpen}
          onClose={handleModalClose}
          doctor={selectedDoctor}
        />
      )}

      {emailModalOpen && selectedDoctor && (
        <DoctorEmailModal
          isOpen={emailModalOpen}
          onClose={handleModalClose}
          doctor={selectedDoctor}
        />
      )}

      {statsModalOpen && selectedDoctor && (
        <DoctorStatsModal
          isOpen={statsModalOpen}
          onClose={handleModalClose}
          doctor={selectedDoctor}
        />
      )}
    </div>
  );
};

export default ManageDoctorsPage;