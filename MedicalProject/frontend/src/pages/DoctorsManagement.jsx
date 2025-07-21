import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import UniversalNavbar from '../components/layout/AdminNavbar';

const DoctorsManagement = () => {
    const [doctors, setDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [pagination, setPagination] = useState({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        limit: 10
    });
    const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });
    const [selectedDoctor, setSelectedDoctor] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [editFormData, setEditFormData] = useState({});
    const [signatureFile, setSignatureFile] = useState(null);

    // Fetch doctors
    const fetchDoctors = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: pagination.limit,
                search: searchTerm,
                status: statusFilter !== 'all' ? statusFilter : undefined
            };

            const response = await api.get('/admin/doctors/list', { params });
            
            if (response.data.success) {
                setDoctors(response.data.data);
                setPagination(response.data.pagination);
                setStats(response.data.stats);
            }
        } catch (error) {
            console.error('Error fetching doctors:', error);
            toast.error('Failed to fetch doctors');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, statusFilter, pagination.limit]);

    useEffect(() => {
        fetchDoctors(1);
    }, [searchTerm, statusFilter]);

    // Handle edit doctor
    const handleEdit = async (doctor) => {
        try {
            const response = await api.get(`/admin/doctors/details/${doctor._id}`);
            if (response.data.success) {
                setSelectedDoctor(response.data.data);
                setEditFormData({
                    fullName: response.data.data.userAccount?.fullName || '',
                    email: response.data.data.userAccount?.email || '',
                    username: response.data.data.userAccount?.username || '',
                    specialization: response.data.data.specialization || '',
                    licenseNumber: response.data.data.licenseNumber || '',
                    department: response.data.data.department || '',
                    qualifications: Array.isArray(response.data.data.qualifications) 
                        ? response.data.data.qualifications.join(', ') 
                        : '',
                    yearsOfExperience: response.data.data.yearsOfExperience || '',
                    contactPhoneOffice: response.data.data.contactPhoneOffice || '',
                    isActiveProfile: response.data.data.isActiveProfile,
                    isActive: response.data.data.userAccount?.isActive
                });
                setShowEditModal(true);
            }
        } catch (error) {
            console.error('Error fetching doctor details:', error);
            toast.error('Failed to fetch doctor details');
        }
    };

    // Handle update doctor
    const handleUpdate = async (e) => {
        e.preventDefault();
        
        try {
            const formData = new FormData();
            
            // Append all form fields
            Object.keys(editFormData).forEach(key => {
                formData.append(key, editFormData[key]);
            });
            
            // Append signature if selected
            if (signatureFile) {
                formData.append('signature', signatureFile);
            }

            const response = await api.put(`/admin/doctors/update/${selectedDoctor._id}`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (response.data.success) {
                toast.success('Doctor updated successfully');
                setShowEditModal(false);
                setSignatureFile(null);
                fetchDoctors(pagination.currentPage);
            }
        } catch (error) {
            console.error('Error updating doctor:', error);
            toast.error(error.response?.data?.message || 'Failed to update doctor');
        }
    };

    // Handle delete doctor
    const handleDelete = async () => {
        try {
            const response = await api.delete(`/admin/doctors/delete/${selectedDoctor._id}`);
            
            if (response.data.success) {
                toast.success('Doctor deleted successfully');
                setShowDeleteModal(false);
                fetchDoctors(pagination.currentPage);
            }
        } catch (error) {
            console.error('Error deleting doctor:', error);
            toast.error(error.response?.data?.message || 'Failed to delete doctor');
        }
    };

    const handlePageChange = (page) => {
        fetchDoctors(page);
    };

    return (
        <div className="h-screen bg-gray-50 flex flex-col">
            <UniversalNavbar />
            
            <div className="flex-1 p-6">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Doctors Management</h1>
                            <p className="text-gray-600">Manage all registered doctors</p>
                        </div>
                        <Link
                            to="/admin/doctors/register"
                            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add New Doctor
                        </Link>
                    </div>

                    {/* Stats Cards */}
                    
                    {/* Filters */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Search doctors by name, email, specialization..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div className="flex gap-4">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Doctors Table */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="px-4 py-5 sm:p-6">
                            {loading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                                </div>
                            ) : doctors.length === 0 ? (
                                <div className="text-center py-12">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">No doctors found</h3>
                                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new doctor.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Doctor
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Specialization
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    License
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Status
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Experience
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {doctors.map((doctor) => (
                                                <tr key={doctor._id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10">
                                                                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-blue-600">
                                                                        {doctor.userAccount?.fullName?.charAt(0)?.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {doctor.userAccount?.fullName}
                                                                </div>
                                                                <div className="text-sm text-gray-500">
                                                                    {doctor.userAccount?.email}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{doctor.specialization}</div>
                                                        <div className="text-sm text-gray-500">{doctor.department}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {doctor.licenseNumber}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                            doctor.userAccount?.isActive 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {doctor.userAccount?.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {doctor.yearsOfExperience ? `${doctor.yearsOfExperience} years` : 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <div className="flex space-x-2">
                                                            <button
                                                                onClick={() => handleEdit(doctor)}
                                                                className="text-blue-600 hover:text-blue-900"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedDoctor(doctor);
                                                                    setShowDeleteModal(true);
                                                                }}
                                                                className="text-red-600 hover:text-red-900"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Pagination */}
                            {pagination.totalPages > 1 && (
                                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 sm:px-6">
                                    <div className="flex-1 flex justify-between sm:hidden">
                                        <button
                                            onClick={() => handlePageChange(pagination.currentPage - 1)}
                                            disabled={!pagination.hasPrevPage}
                                            className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            onClick={() => handlePageChange(pagination.currentPage + 1)}
                                            disabled={!pagination.hasNextPage}
                                            className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                        </button>
                                    </div>
                                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm text-gray-700">
                                                Showing{' '}
                                                <span className="font-medium">
                                                    {(pagination.currentPage - 1) * pagination.limit + 1}
                                                </span>{' '}
                                                to{' '}
                                                <span className="font-medium">
                                                    {Math.min(pagination.currentPage * pagination.limit, pagination.totalRecords)}
                                                </span>{' '}
                                                of{' '}
                                                <span className="font-medium">{pagination.totalRecords}</span> results
                                            </p>
                                        </div>
                                        <div>
                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                                                    <button
                                                        key={page}
                                                        onClick={() => handlePageChange(page)}
                                                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                                            page === pagination.currentPage
                                                                ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                                                                : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                            </nav>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Doctor</h3>
                            
                            <form onSubmit={handleUpdate} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                                        <input
                                            type="text"
                                            value={editFormData.fullName}
                                            onChange={(e) => setEditFormData({...editFormData, fullName: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Email</label>
                                        <input
                                            type="email"
                                            value={editFormData.email}
                                            onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Username</label>
                                        <input
                                            type="text"
                                            value={editFormData.username}
                                            onChange={(e) => setEditFormData({...editFormData, username: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Specialization</label>
                                        <input
                                            type="text"
                                            value={editFormData.specialization}
                                            onChange={(e) => setEditFormData({...editFormData, specialization: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">License Number</label>
                                        <input
                                            type="text"
                                            value={editFormData.licenseNumber}
                                            onChange={(e) => setEditFormData({...editFormData, licenseNumber: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Department</label>
                                        <input
                                            type="text"
                                            value={editFormData.department}
                                            onChange={(e) => setEditFormData({...editFormData, department: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Years of Experience</label>
                                        <input
                                            type="number"
                                            value={editFormData.yearsOfExperience}
                                            onChange={(e) => setEditFormData({...editFormData, yearsOfExperience: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                        <input
                                            type="text"
                                            value={editFormData.contactPhoneOffice}
                                            onChange={(e) => setEditFormData({...editFormData, contactPhoneOffice: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Qualifications (comma separated)</label>
                                    <textarea
                                        value={editFormData.qualifications}
                                        onChange={(e) => setEditFormData({...editFormData, qualifications: e.target.value})}
                                        rows={3}
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Signature</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setSignatureFile(e.target.files[0])}
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                    {selectedDoctor?.signature && (
                                        <p className="text-sm text-gray-500 mt-1">Current signature will be replaced if new file is uploaded</p>
                                    )}
                                </div>
                                
                                <div className="flex items-center space-x-4">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={editFormData.isActive}
                                            onChange={(e) => setEditFormData({...editFormData, isActive: e.target.checked})}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        />
                                        <label className="ml-2 block text-sm text-gray-900">Account Active</label>
                                    </div>
                                    
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={editFormData.isActiveProfile}
                                            onChange={(e) => setEditFormData({...editFormData, isActiveProfile: e.target.checked})}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                        />
                                        <label className="ml-2 block text-sm text-gray-900">Profile Active</label>
                                    </div>
                                </div>
                                
                                <div className="flex justify-end space-x-2 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowEditModal(false);
                                            setSignatureFile(null);
                                        }}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
                                    >
                                        Update Doctor
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div className="mt-3 text-center">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                            </div>
                            <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">Delete Doctor</h3>
                            <div className="mt-2 px-7 py-3">
                                <p className="text-sm text-gray-500">
                                    Are you sure you want to delete {selectedDoctor?.userAccount?.fullName}? This action cannot be undone.
                                </p>
                            </div>
                            <div className="flex justify-center space-x-2 pt-4">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorsManagement;