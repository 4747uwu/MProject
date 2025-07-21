import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import UniversalNavbar from '../components/layout/AdminNavbar';

const LabsManagement = () => {
    const [labs, setLabs] = useState([]);
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
    const [selectedLab, setSelectedLab] = useState(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [editFormData, setEditFormData] = useState({});

    // Fetch labs
    const fetchLabs = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = {
                page,
                limit: pagination.limit,
                search: searchTerm,
                status: statusFilter !== 'all' ? statusFilter : undefined
            };

            const response = await api.get('/admin/labs/list', { params });
            
            if (response.data.success) {
                setLabs(response.data.data);
                setPagination(response.data.pagination);
                setStats(response.data.stats);
            }
        } catch (error) {
            console.error('Error fetching labs:', error);
            toast.error('Failed to fetch labs');
        } finally {
            setLoading(false);
        }
    }, [searchTerm, statusFilter, pagination.limit]);

    useEffect(() => {
        fetchLabs(1);
    }, [searchTerm, statusFilter]);

    // Handle view lab details
    const handleViewDetails = async (lab) => {
        try {
            const response = await api.get(`/admin/labs/details/${lab._id}`);
            if (response.data.success) {
                setSelectedLab(response.data.data);
                setShowDetailsModal(true);
            }
        } catch (error) {
            console.error('Error fetching lab details:', error);
            toast.error('Failed to fetch lab details');
        }
    };

    // Handle edit lab
    const handleEdit = async (lab) => {
        try {
            const response = await api.get(`/admin/labs/details/${lab._id}`);
            if (response.data.success) {
                setSelectedLab(response.data.data);
                setEditFormData({
                    name: response.data.data.name || '',
                    identifier: response.data.data.identifier || '',
                    contactPerson: response.data.data.contactPerson || '',
                    contactEmail: response.data.data.contactEmail || '',
                    contactPhone: response.data.data.contactPhone || '',
                    address: {
                        street: response.data.data.address?.street || '',
                        city: response.data.data.address?.city || '',
                        state: response.data.data.address?.state || '',
                        zipCode: response.data.data.address?.zipCode || '',
                        country: response.data.data.address?.country || ''
                    },
                    isActive: response.data.data.isActive,
                    notes: response.data.data.notes || ''
                });
                setShowEditModal(true);
            }
        } catch (error) {
            console.error('Error fetching lab details:', error);
            toast.error('Failed to fetch lab details');
        }
    };

    // Handle update lab
    const handleUpdate = async (e) => {
        e.preventDefault();
        
        try {
            const response = await api.put(`/admin/labs/update/${selectedLab._id}`, editFormData);

            if (response.data.success) {
                toast.success('Lab updated successfully');
                setShowEditModal(false);
                fetchLabs(pagination.currentPage);
            }
        } catch (error) {
            console.error('Error updating lab:', error);
            toast.error(error.response?.data?.message || 'Failed to update lab');
        }
    };

    // Handle delete lab
    const handleDelete = async () => {
        try {
            const response = await api.delete(`/admin/labs/delete/${selectedLab._id}`);
            
            if (response.data.success) {
                toast.success('Lab deleted successfully');
                setShowDeleteModal(false);
                fetchLabs(pagination.currentPage);
            }
        } catch (error) {
            console.error('Error deleting lab:', error);
            toast.error(error.response?.data?.message || 'Failed to delete lab');
        }
    };

    const handlePageChange = (page) => {
        fetchLabs(page);
    };

    return (
        <div className="h-screen bg-gray-50 flex flex-col">
            <UniversalNavbar />
            
            <div className="flex-1 p-6">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Labs Management</h1>
                            <p className="text-gray-600">Manage all registered laboratories</p>
                        </div>
                        <Link
                            to="/admin/new-lab"
                            className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add New Lab
                        </Link>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Total Labs</p>
                                    <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Active Labs</p>
                                    <p className="text-2xl font-semibold text-gray-900">{stats.active}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                                        <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="ml-4">
                                    <p className="text-sm font-medium text-gray-600">Inactive Labs</p>
                                    <p className="text-2xl font-semibold text-gray-900">{stats.inactive}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <input
                                    type="text"
                                    placeholder="Search labs by name, identifier, email..."
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

                    {/* Labs Table */}
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="px-4 py-5 sm:p-6">
                            {loading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
                                </div>
                            ) : labs.length === 0 ? (
                                <div className="text-center py-12">
                                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <h3 className="mt-2 text-sm font-medium text-gray-900">No labs found</h3>
                                    <p className="mt-1 text-sm text-gray-500">Get started by creating a new lab.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Lab Info
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Contact
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Studies
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Staff
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Status
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {labs.map((lab) => (
                                                <tr key={lab._id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-10 w-10">
                                                                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                                                    <span className="text-sm font-medium text-purple-600">
                                                                        {lab.name?.charAt(0)?.toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="ml-4">
                                                                <div className="text-sm font-medium text-gray-900">
                                                                    {lab.name}
                                                                </div>
                                                                <div className="text-sm text-gray-500">
                                                                    ID: {lab.identifier}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">{lab.contactPerson || 'N/A'}</div>
                                                        <div className="text-sm text-gray-500">{lab.contactEmail || 'N/A'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                        {lab.totalStudies || 0}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-900">
                                                            {lab.activeStaff || 0} / {lab.totalStaff || 0}
                                                        </div>
                                                        <div className="text-sm text-gray-500">Active / Total</div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                            lab.isActive 
                                                                ? 'bg-green-100 text-green-800' 
                                                                : 'bg-red-100 text-red-800'
                                                        }`}>
                                                            {lab.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                        <div className="flex space-x-2">
                                                            <button
                                                                onClick={() => handleViewDetails(lab)}
                                                                className="text-indigo-600 hover:text-indigo-900"
                                                            >
                                                                View
                                                            </button>
                                                            <button
                                                                onClick={() => handleEdit(lab)}
                                                                className="text-blue-600 hover:text-blue-900"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedLab(lab);
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

            {/* Details Modal */}
            {showDetailsModal && selectedLab && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-gray-900">Lab Details</h3>
                                <button
                                    onClick={() => setShowDetailsModal(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="space-y-6">
                                {/* Basic Info */}
                                <div className="border-b border-gray-200 pb-4">
                                    <h4 className="text-md font-medium text-gray-900 mb-3">Basic Information</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Lab Name</label>
                                            <p className="mt-1 text-sm text-gray-900">{selectedLab.name}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Identifier</label>
                                            <p className="mt-1 text-sm text-gray-900">{selectedLab.identifier}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Status</label>
                                            <span className={`mt-1 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                selectedLab.isActive 
                                                    ? 'bg-green-100 text-green-800' 
                                                    : 'bg-red-100 text-red-800'
                                            }`}>
                                                {selectedLab.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Contact Info */}
                                <div className="border-b border-gray-200 pb-4">
                                    <h4 className="text-md font-medium text-gray-900 mb-3">Contact Information</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                                            <p className="mt-1 text-sm text-gray-900">{selectedLab.contactPerson || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Email</label>
                                            <p className="mt-1 text-sm text-gray-900">{selectedLab.contactEmail || 'N/A'}</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Phone</label>
                                            <p className="mt-1 text-sm text-gray-900">{selectedLab.contactPhone || 'N/A'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Address */}
                                {selectedLab.address && (
                                    <div className="border-b border-gray-200 pb-4">
                                        <h4 className="text-md font-medium text-gray-900 mb-3">Address</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">Street</label>
                                                <p className="mt-1 text-sm text-gray-900">{selectedLab.address.street || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">City</label>
                                                <p className="mt-1 text-sm text-gray-900">{selectedLab.address.city || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">State</label>
                                                <p className="mt-1 text-sm text-gray-900">{selectedLab.address.state || 'N/A'}</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                                                <p className="mt-1 text-sm text-gray-900">{selectedLab.address.zipCode || 'N/A'}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Statistics */}
                                <div className="border-b border-gray-200 pb-4">
                                    <h4 className="text-md font-medium text-gray-900 mb-3">Statistics</h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                                            <div className="text-2xl font-bold text-blue-600">{selectedLab.totalStudies || 0}</div>
                                            <div className="text-sm text-gray-600">Total Studies</div>
                                        </div>
                                        <div className="text-center p-3 bg-green-50 rounded-lg">
                                            <div className="text-2xl font-bold text-green-600">{selectedLab.staffStats?.active || 0}</div>
                                            <div className="text-sm text-gray-600">Active Staff</div>
                                        </div>
                                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                                            <div className="text-2xl font-bold text-purple-600">{selectedLab.staffStats?.total || 0}</div>
                                            <div className="text-sm text-gray-600">Total Staff</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Study Breakdown */}
                                {selectedLab.studyStats && (
                                    <div>
                                        <h4 className="text-md font-medium text-gray-900 mb-3">Study Breakdown</h4>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="text-center p-3 bg-yellow-50 rounded-lg">
                                                <div className="text-xl font-bold text-yellow-600">{selectedLab.studyStats.pending || 0}</div>
                                                <div className="text-sm text-gray-600">Pending</div>
                                            </div>
                                            <div className="text-center p-3 bg-orange-50 rounded-lg">
                                                <div className="text-xl font-bold text-orange-600">{selectedLab.studyStats.inProgress || 0}</div>
                                                <div className="text-sm text-gray-600">In Progress</div>
                                            </div>
                                            <div className="text-center p-3 bg-green-50 rounded-lg">
                                                <div className="text-xl font-bold text-green-600">{selectedLab.studyStats.completed || 0}</div>
                                                <div className="text-sm text-gray-600">Completed</div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Notes */}
                                {selectedLab.notes && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Notes</label>
                                        <p className="mt-1 text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{selectedLab.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div className="relative top-10 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
                        <div className="mt-3">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Lab</h3>
                            
                            <form onSubmit={handleUpdate} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Lab Name</label>
                                        <input
                                            type="text"
                                            value={editFormData.name}
                                            onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Identifier</label>
                                        <input
                                            type="text"
                                            value={editFormData.identifier}
                                            onChange={(e) => setEditFormData({...editFormData, identifier: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            required
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Contact Person</label>
                                        <input
                                            type="text"
                                            value={editFormData.contactPerson}
                                            onChange={(e) => setEditFormData({...editFormData, contactPerson: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Contact Email</label>
                                        <input
                                            type="email"
                                            value={editFormData.contactEmail}
                                            onChange={(e) => setEditFormData({...editFormData, contactEmail: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Contact Phone</label>
                                        <input
                                            type="text"
                                            value={editFormData.contactPhone}
                                            onChange={(e) => setEditFormData({...editFormData, contactPhone: e.target.value})}
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                                
                                {/* Address Fields */}
                                <div className="border-t pt-4">
                                    <h4 className="text-md font-medium text-gray-900 mb-3">Address</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Street</label>
                                            <input
                                                type="text"
                                                value={editFormData.address?.street || ''}
                                                onChange={(e) => setEditFormData({
                                                    ...editFormData, 
                                                    address: {...editFormData.address, street: e.target.value}
                                                })}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">City</label>
                                            <input
                                                type="text"
                                                value={editFormData.address?.city || ''}
                                                onChange={(e) => setEditFormData({
                                                    ...editFormData, 
                                                    address: {...editFormData.address, city: e.target.value}
                                                })}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">State</label>
                                            <input
                                                type="text"
                                                value={editFormData.address?.state || ''}
                                                onChange={(e) => setEditFormData({
                                                    ...editFormData, 
                                                    address: {...editFormData.address, state: e.target.value}
                                                })}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
                                            <input
                                                type="text"
                                                value={editFormData.address?.zipCode || ''}
                                                onChange={(e) => setEditFormData({
                                                    ...editFormData, 
                                                    address: {...editFormData.address, zipCode: e.target.value}
                                                })}
                                                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Notes</label>
                                    <textarea
                                        value={editFormData.notes}
                                        onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                                        rows={3}
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                    />
                                </div>
                                
                                <div className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={editFormData.isActive}
                                        onChange={(e) => setEditFormData({...editFormData, isActive: e.target.checked})}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <label className="ml-2 block text-sm text-gray-900">Lab Active</label>
                                </div>
                                
                                <div className="flex justify-end space-x-2 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700"
                                    >
                                        Update Lab
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
                            <h3 className="text-lg leading-6 font-medium text-gray-900 mt-4">Delete Lab</h3>
                            <div className="mt-2 px-7 py-3">
                                <p className="text-sm text-gray-500">
                                    Are you sure you want to delete {selectedLab?.name}? This action cannot be undone.
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

export default LabsManagement;