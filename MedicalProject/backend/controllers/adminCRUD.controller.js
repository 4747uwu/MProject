import mongoose from 'mongoose';
import User from '../models/userModel.js';
import Doctor from '../models/doctorModel.js';
import Lab from '../models/labModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import sharp from 'sharp';
import multer from 'multer';

const storage = multer.memoryStorage();

// 🔧 Signature upload middleware
export const uploadDoctorSignature = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
}).single('signature');

// 🆕 GET ALL DOCTORS (FIXED SEARCH)
export const getAllDoctorsForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'inactive', or undefined for all
        
        const skip = (page - 1) * limit;
        
        // 🔧 FIXED: Build aggregation pipeline for proper search
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            }
        ];
        
        // Add search and status filters
        const matchConditions = {};
        
        if (search) {
            matchConditions.$or = [
                { 'userAccount.fullName': { $regex: search, $options: 'i' } },
                { 'userAccount.email': { $regex: search, $options: 'i' } },
                { specialization: { $regex: search, $options: 'i' } },
                { licenseNumber: { $regex: search, $options: 'i' } },
                { department: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) {
            matchConditions['userAccount.isActive'] = status === 'active';
        }
        
        if (Object.keys(matchConditions).length > 0) {
            pipeline.push({ $match: matchConditions });
        }
        
        // Add sorting and pagination
        pipeline.push(
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        );
        
        // Get doctors
        const doctors = await Doctor.aggregate(pipeline);
        
        // Get total count for pagination
        const countPipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            }
        ];
        
        if (Object.keys(matchConditions).length > 0) {
            countPipeline.push({ $match: matchConditions });
        }
        
        countPipeline.push({ $count: 'total' });
        
        const countResult = await Doctor.aggregate(countPipeline);
        const totalDoctors = countResult[0]?.total || 0;
        
        // Get statistics
        const stats = await Doctor.aggregate([
            {
                $lookup: {
                    from: 'users',
                    localField: 'userAccount',
                    foreignField: '_id',
                    as: 'userAccount'
                }
            },
            {
                $unwind: '$userAccount'
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: ['$userAccount.isActive', 1, 0] } },
                    inactive: { $sum: { $cond: ['$userAccount.isActive', 0, 1] } }
                }
            }
        ]);
        
        res.status(200).json({
            success: true,
            data: doctors,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalDoctors / limit),
                totalRecords: totalDoctors,
                limit,
                hasNextPage: page < Math.ceil(totalDoctors / limit),
                hasPrevPage: page > 1
            },
            stats: stats[0] || { total: 0, active: 0, inactive: 0 }
        });
        
    } catch (error) {
        console.error('❌ Error fetching doctors:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctors',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 GET SINGLE DOCTOR
export const getDoctorForAdmin = async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        const doctor = await Doctor.findById(doctorId)
            .populate('userAccount', 'fullName email username isActive createdAt')
            .lean();
        
        if (!doctor) {
            return res.status(404).json({
                success: false,
                message: 'Doctor not found'
            });
        }
        
        // Get doctor's study statistics
        const studyStats = await DicomStudy.aggregate([
            {
                $match: {
                    'lastAssignedDoctor.doctorId': new mongoose.Types.ObjectId(doctorId)
                }
            },
            {
                $group: {
                    _id: null,
                    totalAssigned: { $sum: 1 },
                    completed: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['report_finalized', 'final_report_downloaded']] },
                                1,
                                0
                            ]
                        }
                    },
                    pending: {
                        $sum: {
                            $cond: [
                                { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);
        
        const stats = studyStats[0] || { totalAssigned: 0, completed: 0, pending: 0 };
        
        res.status(200).json({
            success: true,
            data: {
                ...doctor,
                stats
            }
        });
        
    } catch (error) {
        console.error('❌ Error fetching doctor:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch doctor details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 UPDATE DOCTOR (FIXED FOR MONGODB SIGNATURES)
export const updateDoctorForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            const {
                fullName,
                email,
                username,
                specialization,
                licenseNumber,
                department,
                qualifications,
                yearsOfExperience,
                contactPhoneOffice,
                isActiveProfile,
                isActive
            } = req.body;
            
            const doctor = await Doctor.findById(doctorId).populate('userAccount').session(session);
            
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            
            // 🔧 FIXED: Handle signature upload for MongoDB storage
            let signatureUpdates = {};
            if (req.file) {
                try {
                    console.log('📝 Processing signature update for MongoDB storage...');
                    
                    // Optimize signature image
                    const optimizedSignature = await sharp(req.file.buffer)
                        .resize(400, 200, {
                            fit: 'contain',
                            background: { r: 255, g: 255, b: 255, alpha: 1 }
                        })
                        .png({ quality: 90, compressionLevel: 6 })
                        .toBuffer();
                    
                    // Convert to base64 for MongoDB storage
                    const base64Signature = optimizedSignature.toString('base64');
                    
                    signatureUpdates = {
                        signature: base64Signature,
                        signatureMetadata: {
                            uploadedAt: new Date(),
                            originalSize: req.file.size || 0,
                            optimizedSize: optimizedSignature.length,
                            originalName: req.file.originalname || 'signature.png',
                            mimeType: 'image/png',
                            lastUpdated: new Date()
                        }
                    };
                    
                    console.log('✅ Signature converted to base64 for MongoDB storage');
                } catch (signatureError) {
                    console.error('❌ Error processing signature:', signatureError);
                    // Continue without signature update
                }
            }
            
            // Update user account
            const userUpdates = {};
            if (fullName) userUpdates.fullName = fullName;
            if (email) userUpdates.email = email;
            if (username) userUpdates.username = username;
            if (isActive !== undefined) userUpdates.isActive = isActive === 'true' || isActive === true;
            
            if (Object.keys(userUpdates).length > 0) {
                await User.findByIdAndUpdate(
                    doctor.userAccount._id,
                    userUpdates,
                    { session, runValidators: true }
                );
            }
            
            // Update doctor profile
            const doctorUpdates = {
                ...signatureUpdates
            };
            
            if (specialization) doctorUpdates.specialization = specialization;
            if (licenseNumber) doctorUpdates.licenseNumber = licenseNumber;
            if (department) doctorUpdates.department = department;
            if (qualifications) {
                doctorUpdates.qualifications = Array.isArray(qualifications) 
                    ? qualifications 
                    : qualifications.split(',').map(q => q.trim()).filter(q => q);
            }
            if (yearsOfExperience !== undefined) doctorUpdates.yearsOfExperience = parseInt(yearsOfExperience) || 0;
            if (contactPhoneOffice) doctorUpdates.contactPhoneOffice = contactPhoneOffice;
            if (isActiveProfile !== undefined) doctorUpdates.isActiveProfile = isActiveProfile === 'true' || isActiveProfile === true;
            
            await Doctor.findByIdAndUpdate(
                doctorId,
                doctorUpdates,
                { session, runValidators: true }
            );
            
            console.log('✅ Doctor updated successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Doctor updated successfully'
        });
        
    } catch (error) {
        console.error('❌ Error updating doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update doctor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};

// 🆕 DELETE DOCTOR (FIXED FOR MONGODB SIGNATURES)
export const deleteDoctorForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { doctorId } = req.params;
            
            const doctor = await Doctor.findById(doctorId).populate('userAccount').session(session);
            
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            
            // Update assigned studies to remove doctor assignment
            const assignedStudies = await DicomStudy.updateMany(
                {
                    'lastAssignedDoctor.doctorId': new mongoose.Types.ObjectId(doctorId),
                    workflowStatus: { $in: ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress'] }
                },
                {
                    $pull: { lastAssignedDoctor: { doctorId: new mongoose.Types.ObjectId(doctorId) } },
                    $set: { 
                        workflowStatus: 'pending_assignment'
                    }
                },
                { session }
            );
            
            console.log(`✅ Updated ${assignedStudies.modifiedCount} studies to pending_assignment status`);
            
            // Delete doctor profile (signature is stored in MongoDB, so no external cleanup needed)
            await Doctor.findByIdAndDelete(doctorId).session(session);
            
            // Delete user account
            await User.findByIdAndDelete(doctor.userAccount._id).session(session);
            
            console.log('✅ Doctor deleted successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Doctor deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting doctor:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete doctor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};

// 🆕 GET ALL LABS (ALREADY OPTIMIZED)
export const getAllLabsForAdmin = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const status = req.query.status; // 'active', 'inactive', or undefined for all
        
        // Build query
        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { identifier: { $regex: search, $options: 'i' } },
                { contactEmail: { $regex: search, $options: 'i' } },
                { contactPerson: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (status) {
            query.isActive = status === 'active';
        }
        
        const skip = (page - 1) * limit;
        
        // Get labs without heavy aggregation
        const labs = await Lab.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Get total count
        const totalLabs = await Lab.countDocuments(query);
        
        // Get basic statistics separately (optimized)
        const [studyStats, staffStats, generalStats] = await Promise.all([
            // Study counts per lab (only get counts, not full documents)
            DicomStudy.aggregate([
                {
                    $group: {
                        _id: '$sourceLab',
                        totalStudies: { $sum: 1 },
                        pending: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['new_study_received', 'pending_assignment']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        inProgress: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        completed: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$workflowStatus', 'final_report_downloaded'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]).allowDiskUse(true),
            
            // Staff counts per lab
            User.aggregate([
                {
                    $match: {
                        lab: { $exists: true, $ne: null }
                    }
                },
                {
                    $group: {
                        _id: '$lab',
                        totalStaff: { $sum: 1 },
                        activeStaff: {
                            $sum: {
                                $cond: ['$isActive', 1, 0]
                            }
                        }
                    }
                }
            ]).allowDiskUse(true),
            
            // General lab statistics
            Lab.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: ['$isActive', 1, 0] } },
                        inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
                    }
                }
            ])
        ]);
        
        // Create lookup maps for efficient data merging
        const studyStatsMap = new Map();
        studyStats.forEach(stat => {
            if (stat._id) {
                studyStatsMap.set(stat._id.toString(), {
                    totalStudies: stat.totalStudies,
                    pending: stat.pending,
                    inProgress: stat.inProgress,
                    completed: stat.completed
                });
            }
        });
        
        const staffStatsMap = new Map();
        staffStats.forEach(stat => {
            if (stat._id) {
                staffStatsMap.set(stat._id.toString(), {
                    totalStaff: stat.totalStaff,
                    activeStaff: stat.activeStaff
                });
            }
        });
        
        // Enhance labs with statistics
        const enhancedLabs = labs.map(lab => {
            const labId = lab._id.toString();
            const studyStat = studyStatsMap.get(labId) || { totalStudies: 0, pending: 0, inProgress: 0, completed: 0 };
            const staffStat = staffStatsMap.get(labId) || { totalStaff: 0, activeStaff: 0 };
            
            return {
                ...lab,
                totalStudies: studyStat.totalStudies,
                activeStaff: staffStat.activeStaff,
                totalStaff: staffStat.totalStaff,
                studyStats: {
                    pending: studyStat.pending,
                    inProgress: studyStat.inProgress,
                    completed: studyStat.completed
                },
                staffStats: {
                    total: staffStat.totalStaff,
                    active: staffStat.activeStaff
                }
            };
        });
        
        res.status(200).json({
            success: true,
            data: enhancedLabs,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalLabs / limit),
                totalRecords: totalLabs,
                limit,
                hasNextPage: page < Math.ceil(totalLabs / limit),
                hasPrevPage: page > 1
            },
            stats: generalStats[0] || { total: 0, active: 0, inactive: 0 }
        });
        
    } catch (error) {
        console.error('❌ Error fetching labs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch labs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 GET SINGLE LAB (FIXED MEMORY ERROR)
export const getLabForAdmin = async (req, res) => {
    try {
        const { labId } = req.params;
        
        // Get lab basic info
        const lab = await Lab.findById(labId).lean();
        
        if (!lab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        // Get statistics separately to avoid memory issues
        const [studyStats, staffStats] = await Promise.all([
            // Study statistics
            DicomStudy.aggregate([
                { $match: { sourceLab: new mongoose.Types.ObjectId(labId) } },
                {
                    $group: {
                        _id: null,
                        totalStudies: { $sum: 1 },
                        pending: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['new_study_received', 'pending_assignment']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        inProgress: {
                            $sum: {
                                $cond: [
                                    { $in: ['$workflowStatus', ['assigned_to_doctor', 'doctor_opened_report', 'report_in_progress']] },
                                    1,
                                    0
                                ]
                            }
                        },
                        completed: {
                            $sum: {
                                $cond: [
                                    { $eq: ['$workflowStatus', 'final_report_downloaded'] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),
            
            // Staff statistics
            User.aggregate([
                { $match: { lab: new mongoose.Types.ObjectId(labId) } },
                {
                    $group: {
                        _id: null,
                        totalStaff: { $sum: 1 },
                        activeStaff: {
                            $sum: {
                                $cond: ['$isActive', 1, 0]
                            }
                        }
                    }
                }
            ])
        ]);
        
        const studyData = studyStats[0] || { totalStudies: 0, pending: 0, inProgress: 0, completed: 0 };
        const staffData = staffStats[0] || { totalStaff: 0, activeStaff: 0 };
        
        // Combine data
        const labDetails = {
            ...lab,
            totalStudies: studyData.totalStudies,
            studyStats: {
                pending: studyData.pending,
                inProgress: studyData.inProgress,
                completed: studyData.completed
            },
            staffStats: {
                total: staffData.totalStaff,
                active: staffData.activeStaff
            }
        };
        
        res.status(200).json({
            success: true,
            data: labDetails
        });
        
    } catch (error) {
        console.error('❌ Error fetching lab:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch lab details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 UPDATE LAB
export const updateLabForAdmin = async (req, res) => {
    try {
        const { labId } = req.params;
        const {
            name,
            identifier,
            contactPerson,
            contactEmail,
            contactPhone,
            address,
            isActive,
            notes
        } = req.body;
        
        const updateData = {};
        
        if (name) updateData.name = name;
        if (identifier) updateData.identifier = identifier;
        if (contactPerson) updateData.contactPerson = contactPerson;
        if (contactEmail) updateData.contactEmail = contactEmail;
        if (contactPhone) updateData.contactPhone = contactPhone;
        if (address) updateData.address = address;
        if (isActive !== undefined) updateData.isActive = isActive === 'true' || isActive === true;
        if (notes !== undefined) updateData.notes = notes;
        
        const updatedLab = await Lab.findByIdAndUpdate(
            labId,
            updateData,
            { new: true, runValidators: true }
        );
        
        if (!updatedLab) {
            return res.status(404).json({
                success: false,
                message: 'Lab not found'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Lab updated successfully',
            data: updatedLab
        });
        
    } catch (error) {
        console.error('❌ Error updating lab:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update lab',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// 🆕 DELETE LAB
export const deleteLabForAdmin = async (req, res) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            const { labId } = req.params;
            
            const lab = await Lab.findById(labId).session(session);
            
            if (!lab) {
                throw new Error('Lab not found');
            }
            
            // Check if lab has any studies
            const studyCount = await DicomStudy.countDocuments({
                sourceLab: labId
            }).session(session);
            
            if (studyCount > 0) {
                throw new Error('Cannot delete lab with existing studies');
            }
            
            // Check if lab has any staff members
            const staffCount = await User.countDocuments({
                lab: labId
            }).session(session);
            
            if (staffCount > 0) {
                throw new Error('Cannot delete lab with existing staff members. Please reassign or delete staff first.');
            }
            
            // Delete lab
            await Lab.findByIdAndDelete(labId).session(session);
            
            console.log('✅ Lab deleted successfully');
        });
        
        res.status(200).json({
            success: true,
            message: 'Lab deleted successfully'
        });
        
    } catch (error) {
        console.error('❌ Error deleting lab:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to delete lab',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        await session.endSession();
    }
};