// services/orthanc.service.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const orthancAxiosInstance = axios.create({
    baseURL: process.env.ORTHANC_URL,
});

if (process.env.ORTHANC_USERNAME && process.env.ORTHANC_PASSWORD) {
    orthancAxiosInstance.defaults.auth = {
        username: process.env.ORTHANC_USERNAME,
        password: process.env.ORTHANC_PASSWORD,
    };
}

const orthancService = {
    getSystemInfo: async () => {
        try {
             const response = await orthancAxiosInstance.get('/system');
             return response.data;
         } catch (error) {
             console.error('Error fetching Orthanc system info:', error.response ? error.response.data : error.message);
             throw error;
         }
    },
    getStudyDetails: async (orthancStudyId) => {
         try {
             const response = await orthancAxiosInstance.get(`/studies/${orthancStudyId}`);
             return response.data;
         } catch (error) {
             console.error(`Error fetching study details for ${orthancStudyId}:`, error.response ? error.response.data : error.message);
             throw error;
         }
    },

    extractStudyMetadataForDB: (orthancStudyDetails) => {
        if (!orthancStudyDetails || !orthancStudyDetails.PatientMainDicomTags || !orthancStudyDetails.MainDicomTags) {
            console.warn("Incomplete Orthanc study details received for metadata extraction. Orthanc Details:", JSON.stringify(orthancStudyDetails));
            return null;
        }

        const pTags = orthancStudyDetails.PatientMainDicomTags;
        const sTags = orthancStudyDetails.MainDicomTags;

        const parseToISODateString = (dcmDate) => {
            if (!dcmDate || typeof dcmDate !== 'string' || dcmDate.length !== 8) return undefined;
            try {
                const year = dcmDate.substring(0, 4);
                const month = dcmDate.substring(4, 6);
                const day = dcmDate.substring(6, 8);
                // Basic validation for year, month, day ranges if needed
                if (parseInt(month) < 1 || parseInt(month) > 12 || parseInt(day) < 1 || parseInt(day) > 31) {
                    console.warn(`Invalid date component in DICOM date: ${dcmDate}`);
                    return undefined;
                }
                return `${year}-${month}-${day}`;
            } catch (e) {
                console.warn(`Error parsing DICOM date string ${dcmDate}:`, e);
                return undefined;
            }
        };

        const safeToNumber = (val) => {
            if (val === null || val === undefined || val === '') return undefined;
            const num = parseFloat(val);
            return isNaN(num) ? undefined : num;
        };

        // --- Patient Metadata Extraction ---
        const patientMetadata = {
            // MRN from DICOM (0010,0020)
            mrn: pTags.PatientID, // This is crucial. Your Patient model has an 'mrn' field for this.
                                  // The application-specific 'patientID' in your Patient model will be generated
                                  // by your application or input manually, not directly from this DICOM tag.

            issuerOfPatientID: pTags.IssuerOfPatientID, // (0010,0021)
            patientNameRaw: pTags.PatientName,          // (0010,0010)
            // Salutation is not typically a standard DICOM tag, will be entered manually or derived.
            dateOfBirth: parseToISODateString(pTags.PatientBirthDate), // (0010,0030)
            gender: pTags.PatientSex,                   // (0010,0040)
            ageString: pTags.PatientAge,                // (0010,1010)
            // Optional demographics based on your Patient model:
            // patientWeightKg: safeToNumber(pTags.PatientWeight), // (0010,1030)
            // patientHeightM: safeToNumber(pTags.PatientSize),    // (0010,1020)
            // ethnicGroup: pTags.EthnicGroup,                     // (0010,2160)
            // patientComments: pTags.PatientComments,             // (0010,4000) - this might be study specific though
        };

        // --- Study Metadata Extraction ---
        const studyMetadata = {
            orthancStudyID: orthancStudyDetails.ID,
            studyInstanceUID: sTags.StudyInstanceUID,    // (0020,000D)
            accessionNumber: sTags.AccessionNumber,     // (0008,0050)
            studyDate: sTags.StudyDate,                 // (0008,0020) - Store as YYYYMMDD or parse
            studyTime: sTags.StudyTime,                 // (0008,0030)
            studyDescription: sTags.StudyDescription,   // (0008,1030)
            referringPhysicianName: sTags.ReferringPhysicianName, // (0008,0090)
            modalitiesInStudy: sTags.ModalitiesInStudy, // (0008,0061)
            institutionName: sTags.InstitutionName,     // (0008,0080)
            // numberOfImages & numberOfSeries are not standard top-level tags in studyDetails.
            // These are often calculated by Orthanc or available at series level.
            // If needed, you'd iterate through orthancStudyDetails.Series and sum up instances,
            // or check if Orthanc provides these counts directly in a different part of the JSON.
            // For now, we'll omit them from direct extraction here unless Orthanc adds them.
        };

        return {
            patient: patientMetadata,
            study: studyMetadata,
        };
    }
};

export default orthancService;