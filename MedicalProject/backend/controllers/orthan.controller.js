// controllers/orthanc.controller.js
import orthancService from '../services/orthancServices.js';
import Patient from '../models/patientModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import Lab from '../models/labModel.js'; // Assuming you have Lab.model.js created
import mongoose from 'mongoose'; // Import mongoose for ObjectId generation
export const checkOrthancStatus = async (req, res) => {
    console.log("Checking Orthanc status...");
    try {
        const systemInfo = await orthancService.getSystemInfo();
        res.json({ success: true, message: "Orthanc is responsive.", data: systemInfo });
    } catch (error) {
        console.error("Error in checkOrthancStatus controller:", error);
        res.status(500).json({
            success: false,
            message: "Failed to connect to Orthanc or get system info.",
            errorDetails: error.message
        });
    }
};

export const processOrthancStudyAndSave = async (req, res) => {
    console.log("Processing Orthanc study and saving metadata...");
    const { orthancStudyId } = req.params;

    if (!orthancStudyId) {
        return res.status(400).json({ success: false, message: "Orthanc Study ID is required in URL parameter." });
    }

    try {
        const orthancStudyDetails = await orthancService.getStudyDetails(orthancStudyId);
        if (!orthancStudyDetails) { // Check if Orthanc returned anything
            return res.status(404).json({ success: false, message: `No study details found in Orthanc for ID: ${orthancStudyId}` });
        }

        const extractedData = orthancService.extractStudyMetadataForDB(orthancStudyDetails);

        if (!extractedData || !extractedData.patient || !extractedData.study) {
            return res.status(400).json({ success: false, message: `Could not extract valid metadata for Orthanc Study ID: ${orthancStudyId}. Orthanc might have incomplete tags.` });
        }

        const patientMeta = extractedData.patient;
        const studyMeta = extractedData.study;

        let patientDoc;
        if (patientMeta.mrn) { // Use MRN to find/create patient
            patientDoc = await Patient.findOneAndUpdate(
                { mrn: patientMeta.mrn },
                {
                    $setOnInsert: {
                        mrn: patientMeta.mrn,
                        patientID: new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase(), // Generate a simple app-specific ID for new patients
                        // patientNameRaw: patientMeta.patientNameRaw,
                        // dateOfBirth: patientMeta.dateOfBirth,
                        // gender: patientMeta.gender,
                        // issuerOfPatientID: patientMeta.issuerOfPatientID,
                        // ageString: patientMeta.ageString,
                        // Salutation and other manually entered fields would be empty here initially
                    },
                    $set: { // Fields to update if patient already exists (or also on insert for some)
                        patientNameRaw: patientMeta.patientNameRaw, // Keep raw name updated
                        dateOfBirth: patientMeta.dateOfBirth,
                        gender: patientMeta.gender,
                        issuerOfPatientID: patientMeta.issuerOfPatientID,
                        ageString: patientMeta.ageString,
                    }
                },
                { upsert: true, new: true, runValidators: true }
            );
            console.log(patientDoc.isNew ? `Created new patient with MRN: ${patientMeta.mrn}` : `Found existing patient with MRN: ${patientMeta.mrn}`);
        } else {
            console.warn(`MRN (DICOM PatientID) is missing for Orthanc Study ${orthancStudyId}. Cannot reliably upsert patient.`);
            return res.status(400).json({ success: false, message: "MRN (DICOM PatientID) missing in tags for this study." });
        }

        // For testing, ensure a default Lab exists or create one.
        // In a real app, Lab ID would come from context (e.g., Orthanc ping, user session).
        let labDoc = await Lab.findOne({ identifier: "DEFAULT_TEST_LAB" });
        if (!labDoc) {
            console.log("Default lab not found, creating one for testing...");
            labDoc = await Lab.create({ name: "Default Test Lab", identifier: "DEFAULT_TEST_LAB" });
            console.log("Created default lab:", labDoc._id);
        }

        const dicomStudyDoc = await DicomStudy.findOneAndUpdate(
            { orthancStudyID: studyMeta.orthancStudyID }, // Find by Orthanc's unique study ID
            {
                $set: {
                    studyInstanceUID: studyMeta.studyInstanceUID,
                    accessionNumber: studyMeta.accessionNumber,
                    studyDate: studyMeta.studyDate,
                    studyTime: studyMeta.studyTime,
                    studyDescription: studyMeta.studyDescription,
                    referringPhysicianName: studyMeta.referringPhysicianName,
                    modalitiesInStudy: studyMeta.modalitiesInStudy,
                    institutionName: studyMeta.institutionName,
                    patient: patientDoc._id,
                    sourceLab: labDoc._id,
                },
                $setOnInsert: {
                    orthancStudyID: studyMeta.orthancStudyID,
                    workflowStatus: 'new', // Initial status for a newly processed study
                }
            },
            { upsert: true, new: true, runValidators: true }
        );
        console.log(dicomStudyDoc.isNew ? `Created new DicomStudy: ${studyMeta.orthancStudyID}` : `Found existing DicomStudy: ${studyMeta.orthancStudyID}`);

        // If it's a new study for this patient, update patient's active study ref and status
        if (dicomStudyDoc.isNew || !patientDoc.activeDicomStudyRef || patientDoc.currentWorkflowStatus === 'no_active_study') {
            patientDoc.activeDicomStudyRef = dicomStudyDoc._id;
            patientDoc.currentWorkflowStatus = 'pending_assignment'; // Or 'new_study_received' then another step to 'pending_assignment'
            await patientDoc.save();
        }


        res.json({
            success: true,
            message: "Processed Orthanc study metadata and saved to DB.",
            data: {
                patient: patientDoc.toObject(), // .toObject() to convert Mongoose doc to plain JS object
                dicomStudy: dicomStudyDoc.toObject()
            }
        });

    } catch (error) {
        console.error("Error in processOrthancStudyAndSave controller:", error);
        res.status(500).json({
            success: false,
            message: "Error processing Orthanc study and saving metadata.",
            errorDetails: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};