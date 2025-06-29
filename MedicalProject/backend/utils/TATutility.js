import mongoose from 'mongoose';

/**
 * 🔧 CENTRALIZED TAT CALCULATOR UTILITY
 * This utility ensures consistent TAT calculations across the entire application
 */

// 🔧 TAT CALCULATION PHASES
const TAT_PHASES = {
    STUDY_TO_UPLOAD: 'studyToUpload',
    UPLOAD_TO_ASSIGNMENT: 'uploadToAssignment', 
    ASSIGNMENT_TO_REPORT: 'assignmentToReport',
    STUDY_TO_REPORT: 'studyToReport',
    UPLOAD_TO_REPORT: 'uploadToReport',
    TOTAL_WORKFLOW: 'totalWorkflow'
};

// 🔧 HELPER: Parse DICOM date format (YYYYMMDD) to Date object
const parseStudyDate = (studyDate) => {
    if (!studyDate) return null;
    
    try {
        // Convert to string if it's not already
        const dateStr = String(studyDate).trim();
        
        // Check if it's in YYYYMMDD format (8 digits)
        if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            const parsedDate = new Date(`${year}-${month}-${day}`);
            
            if (!isNaN(parsedDate.getTime())) {
                return parsedDate;
            }
        }
        
        // Try parsing as regular date string
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
        
    } catch (error) {
        console.warn('⚠️ Error parsing study date:', studyDate, error.message);
        return null;
    }
};

// 🔧 HELPER: Calculate minutes between two dates
const calculateMinutes = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        
        const diffMs = end.getTime() - start.getTime();
        return Math.round(diffMs / (1000 * 60)); // Convert to minutes
    } catch (error) {
        console.warn('⚠️ Error calculating minutes:', error.message);
        return null;
    }
};

// 🔧 HELPER: Calculate days between two dates
const calculateDays = (startDate, endDate) => {
    if (!startDate || !endDate) return null;
    
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
        
        const diffMs = end.getTime() - start.getTime();
        return Math.round(diffMs / (1000 * 60 * 60 * 24)); // Convert to days
    } catch (error) {
        console.warn('⚠️ Error calculating days:', error.message);
        return null;
    }
};

// 🔧 HELPER: Format TAT for display
const formatTAT = (minutes) => {
    if (!minutes || minutes <= 0) return 'N/A';
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours === 0) {
        return `${remainingMinutes}m`;
    } else if (hours < 24) {
        return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        if (days < 7) {
            return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
        } else {
            const weeks = Math.floor(days / 7);
            const remainingDays = days % 7;
            return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
        }
    }
};

// 🔧 HELPER: Get empty TAT structure
const getEmptyTAT = () => ({
    // Raw values in minutes
    studyToUploadTAT: null,
    uploadToAssignmentTAT: null,
    assignmentToReportTAT: null,
    studyToReportTAT: null,
    uploadToReportTAT: null,
    totalTATMinutes: null,
    totalTATDays: null,
    
    // Reset-aware calculations
    resetAwareTATDays: null,
    resetAwareTATMinutes: null,
    
    // Formatted versions
    studyToUploadTATFormatted: 'N/A',
    uploadToAssignmentTATFormatted: 'N/A',
    assignmentToReportTATFormatted: 'N/A',
    studyToReportTATFormatted: 'N/A',
    uploadToReportTATFormatted: 'N/A',
    totalTATFormatted: 'N/A',
    
    // Status indicators
    isCompleted: false,
    isOverdue: false,
    phase: 'not_started',
    
    // Metadata
    calculatedAt: new Date(),
    calculatedBy: 'tatCalculator'
});

// 🔧 MAIN: Calculate comprehensive TAT for a study
export const calculateStudyTAT = (study, options = {}) => {
    const { 
        includeFormatting = true, 
        includeMetadata = true,
        currentTime = new Date()
    } = options;
    
    if (!study) {
        console.warn('⚠️ No study provided for TAT calculation');
        return getEmptyTAT();
    }

    console.log(`[TAT Calc] 🔄 Calculating TAT for study: ${study.studyInstanceUID || study._id}`);

    // 🔧 EXTRACT: Key dates from study
    const studyDate = parseStudyDate(study.studyDate);
    const uploadDate = study.createdAt ? new Date(study.createdAt) : null;
    
    // 🔧 FIXED: Handle assignment array structure
    let assignedDate = null;
    
    if (study.assignment && Array.isArray(study.assignment) && study.assignment.length > 0) {
        // Get the LATEST assignment (most recent)
        const sortedAssignments = study.assignment
            .filter(a => a.assignedAt) // Only assignments with dates
            .sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt)); // Latest first
        
        if (sortedAssignments.length > 0) {
            assignedDate = new Date(sortedAssignments[0].assignedAt);
            console.log(`[TAT Calc] Using latest assignment date: ${assignedDate.toISOString()}`);
        }
    } else if (study.assignment?.assignedAt) {
        // Legacy single assignment structure
        assignedDate = new Date(study.assignment.assignedAt);
    } else if (study.lastAssignmentAt) {
        // Fallback to legacy field
        assignedDate = new Date(study.lastAssignmentAt);
    }

    // Handle different report date structures
    let reportDate = null;
    if (study.reportInfo?.finalizedAt) {
        reportDate = new Date(study.reportInfo.finalizedAt);
    } else if (study.reportFinalizedAt) {
        reportDate = new Date(study.reportFinalizedAt);
    } else if (study.reportDate) {
        reportDate = new Date(study.reportDate);
    }

    // 🔧 CALCULATE: TAT phases
    const result = {
        // Phase 1: Study conducted to upload
        studyToUploadTAT: studyDate && uploadDate ? calculateMinutes(studyDate, uploadDate) : null,
        
        // Phase 2: Upload to assignment
        uploadToAssignmentTAT: uploadDate && assignedDate ? calculateMinutes(uploadDate, assignedDate) : null,
        
        // Phase 3: Assignment to report finalization
        assignmentToReportTAT: assignedDate && reportDate ? calculateMinutes(assignedDate, reportDate) : null,
        
        // End-to-end calculations
        studyToReportTAT: studyDate && reportDate ? calculateMinutes(studyDate, reportDate) : null,
        uploadToReportTAT: uploadDate && reportDate ? calculateMinutes(uploadDate, reportDate) : null,
        
        // Total workflow TAT (baseline is upload date)
        totalTATMinutes: null,
        totalTATDays: null,
        
        // Reset-aware TAT (considers TAT resets)
        resetAwareTATMinutes: null,
        resetAwareTATDays: null
    };

    // 🔧 DETERMINE: Current workflow endpoint
    const workflowEndpoint = reportDate || currentTime;
    
    if (uploadDate) {
        result.totalTATMinutes = calculateMinutes(uploadDate, workflowEndpoint);
        result.totalTATDays = calculateDays(uploadDate, workflowEndpoint);
        
        // Reset-aware calculation
        result.resetAwareTATMinutes = calculateMinutes(uploadDate, currentTime);
        result.resetAwareTATDays = calculateDays(uploadDate, currentTime);
    }

    // 🔧 DETERMINE: Current phase and status
    result.isCompleted = !!reportDate;
    result.phase = reportDate ? 'completed' : 
                   assignedDate ? 'assigned' : 
                   uploadDate ? 'uploaded' : 'not_started';

    // 🔧 DETERMINE: Overdue status (more than 24 hours in current phase)
    result.isOverdue = false;
    if (!reportDate && result.totalTATMinutes > 1440) { // 24 hours
        result.isOverdue = true;
    }

    // 🔧 FORMAT: TAT values for display
    if (includeFormatting) {
        result.studyToUploadTATFormatted = result.studyToUploadTAT ? formatTAT(result.studyToUploadTAT) : 'N/A';
        result.uploadToAssignmentTATFormatted = result.uploadToAssignmentTAT ? formatTAT(result.uploadToAssignmentTAT) : 'N/A';
        result.assignmentToReportTATFormatted = result.assignmentToReportTAT ? formatTAT(result.assignmentToReportTAT) : 'N/A';
        result.studyToReportTATFormatted = result.studyToReportTAT ? formatTAT(result.studyToReportTAT) : 'N/A';
        result.uploadToReportTATFormatted = result.uploadToReportTAT ? formatTAT(result.uploadToReportTAT) : 'N/A';
        result.totalTATFormatted = result.totalTATDays !== null ? `${result.totalTATDays} days` : 'N/A';
    }

    // 🔧 METADATA: Add calculation metadata
    if (includeMetadata) {
        result.calculatedAt = currentTime;
        result.calculatedBy = 'tatCalculator';
        result.studyId = study._id || study.studyInstanceUID;
        result.workflowStatus = study.workflowStatus;
        
        // Key dates for reference
        result.keyDates = {
            studyDate: studyDate,
            uploadDate: uploadDate,
            assignedDate: assignedDate,
            reportDate: reportDate,
            calculationTime: currentTime
        };
    }

    console.log(`[TAT Calc] ✅ TAT calculated - Phase: ${result.phase}, Total: ${result.totalTATFormatted}`);
    return result;
};

// 🔧 LEGACY: Legacy field mapping for backward compatibility
export const getLegacyTATFields = (tat) => {
    return {
        // Legacy field names used in existing frontend
        diffStudyAndReportTAT: tat.studyToReportTAT && tat.studyToReportTAT > 0 ? 
                             `${Math.round(tat.studyToReportTAT)} Minutes` : 'N/A',
        diffUploadAndReportTAT: tat.uploadToReportTAT && tat.uploadToReportTAT > 0 ? 
                              `${Math.round(tat.uploadToReportTAT)} Minutes` : 'N/A',
        diffAssignAndReportTAT: tat.assignmentToReportTAT && tat.assignmentToReportTAT > 0 ? 
                              `${Math.round(tat.assignmentToReportTAT)} Minutes` : 'N/A',
        
        // Additional legacy fields
        turnaroundTime: tat.uploadToReportTATFormatted || 'Pending',
        totalTATDays: tat.totalTATDays,
        totalTATMinutes: tat.totalTATMinutes
    };
};

// 🔧 BATCH: Calculate TAT for multiple studies
export const calculateBatchTAT = (studies, options = {}) => {
    if (!Array.isArray(studies)) {
        console.warn('⚠️ Invalid studies array provided for batch TAT calculation');
        return [];
    }

    console.log(`[TAT Calc] 🔄 Calculating TAT for ${studies.length} studies`);
    
    const startTime = Date.now();
    const results = studies.map(study => calculateStudyTAT(study, options));
    const processingTime = Date.now() - startTime;
    
    console.log(`[TAT Calc] ✅ Batch TAT calculation completed in ${processingTime}ms`);
    return results;
};

// 🔧 UPDATE: Update study with calculated TAT
export const updateStudyTAT = async (studyId, tatData, session = null) => {
    try {
        console.log(`[TAT Update] 🔄 Updating TAT for study: ${studyId}`);
        
        const DicomStudy = mongoose.model('DicomStudy');
        
        const updateData = {
            $set: {
                // Set the entire calculatedTAT object at once.
                // The tatData object from calculateStudyTAT already contains all necessary fields.
                'calculatedTAT': tatData, 
                
                // Update the legacy timingInfo object for backward compatibility.
                'timingInfo.uploadToAssignmentMinutes': tatData.uploadToAssignmentTAT,
                'timingInfo.assignmentToReportMinutes': tatData.assignmentToReportTAT,
                'timingInfo.totalTATMinutes': tatData.totalTATMinutes,
                'timingInfo.lastCalculated': new Date()
            }
        };

        const options = { new: true, runValidators: false };
        if (session) options.session = session;

        const updatedStudy = await DicomStudy.findByIdAndUpdate(
            studyId,
            updateData, // Use the corrected update object
            options
        );

        if (updatedStudy) {
            console.log(`[TAT Update] ✅ TAT updated for study: ${studyId}`);
            return { success: true, study: updatedStudy };
        } else {
            console.warn(`[TAT Update] ⚠️ Study not found: ${studyId}`);
            return { success: false, error: 'Study not found' };
        }

    } catch (error) {
        console.error(`[TAT Update] ❌ Error updating TAT for study ${studyId}:`, error);
        return { success: false, error: error.message };
    }
};

// 🔧 TRIGGER: Auto-calculate and update TAT when study changes
export const autoUpdateStudyTAT = async (study, session = null) => {
    try {
        const tat = calculateStudyTAT(study);
        const result = await updateStudyTAT(study._id, tat, session);
        return result;
    } catch (error) {
        console.error(`[TAT Auto-Update] ❌ Error auto-updating TAT:`, error);
        return { success: false, error: error.message };
    }
};

// 🔧 VALIDATION: Validate TAT data structure
export const validateTAT = (tat) => {
    const required = ['studyToUploadTAT', 'uploadToAssignmentTAT', 'assignmentToReportTAT', 'totalTATMinutes'];
    const missing = required.filter(field => tat[field] === undefined);
    
    return {
        isValid: missing.length === 0,
        missingFields: missing,
        warnings: []
    };
};

// 🔧 RESET: Reset TAT calculation (for TAT reset functionality)
export const resetStudyTAT = async (studyId, resetReason = 'manual_reset', session = null) => {
    try {
        console.log(`[TAT Reset] 🔄 Resetting TAT for study: ${studyId}`);
        
        const DicomStudy = mongoose.model('DicomStudy');
        const resetTime = new Date();
        
        const resetData = {
            'calculatedTAT': getEmptyTAT(),
            'calculatedTAT.resetAt': resetTime,
            'calculatedTAT.resetReason': resetReason,
            'calculatedTAT.resetCount': { $inc: 1 },
            
            // Reset timing info
            'timingInfo.uploadToAssignmentMinutes': 0,
            'timingInfo.assignmentToReportMinutes': 0,
            'timingInfo.totalTATMinutes': 0,
            'timingInfo.tatResetAt': resetTime,
            'timingInfo.tatResetReason': resetReason,
            
            // Reset key timestamps
            createdAt: resetTime
        };

        const options = { new: true, runValidators: false };
        if (session) options.session = session;

        const updatedStudy = await DicomStudy.findByIdAndUpdate(
            studyId,
            resetData,
            options
        );

        if (updatedStudy) {
            console.log(`[TAT Reset] ✅ TAT reset for study: ${studyId}`);
            return { success: true, study: updatedStudy, resetAt: resetTime };
        } else {
            return { success: false, error: 'Study not found' };
        }

    } catch (error) {
        console.error(`[TAT Reset] ❌ Error resetting TAT for study ${studyId}:`, error);
        return { success: false, error: error.message };
    }
};

export default {
    calculateStudyTAT,
    calculateBatchTAT,
    updateStudyTAT,
    autoUpdateStudyTAT,
    resetStudyTAT,
    getLegacyTATFields,
    validateTAT,
    TAT_PHASES,
    formatTAT,
    parseStudyDate
};