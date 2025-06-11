import axios from 'axios';

class OrthancService {
  constructor() {
    this.orthancUrl = process.env.ORTHANC_URL || 'http://localhost:8042';
    this.orthancUsername = process.env.ORTHANC_USERNAME || 'alice';
    this.orthancPassword = process.env.ORTHANC_PASSWORD || 'alicePassword';
    
    this.authHeader = {
      'Authorization': `Basic ${Buffer.from(`${this.orthancUsername}:${this.orthancPassword}`).toString('base64')}`
    };
  }

  // 🔧 GET STUDY DETAILS
  async getStudy(studyId) {
    try {
      console.log(`📡 Fetching study from Orthanc: ${studyId}`);
      
      const response = await axios.get(
        `${this.orthancUrl}/studies/${studyId}`,
        {
          headers: this.authHeader,
          timeout: 10000
        }
      );
      
      console.log('✅ Retrieved study from Orthanc');
      return response.data;
      
    } catch (error) {
      console.error(`❌ Failed to get study from Orthanc: ${error.message}`);
      
      if (error.response?.status === 404) {
        throw new Error(`Study not found in Orthanc: ${studyId}`);
      }
      
      throw new Error(`Orthanc request failed: ${error.message}`);
    }
  }

  // 🔧 GET STUDY METADATA
  async getStudyMetadata(studyId) {
    try {
      const response = await axios.get(
        `${this.orthancUrl}/studies/${studyId}/metadata`,
        {
          headers: this.authHeader,
          timeout: 10000
        }
      );
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Failed to get study metadata: ${error.message}`);
    }
  }

  // 🔧 DOWNLOAD STUDY ARCHIVE (STREAMING)
  async downloadStudyArchive(studyId, res) {
    try {
      console.log(`📥 Streaming study archive: ${studyId}`);
      
      const response = await axios.get(
        `${this.orthancUrl}/studies/${studyId}/archive`,
        {
          headers: this.authHeader,
          responseType: 'stream',
          timeout: 60000
        }
      );
      
      // Set response headers
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="study_${studyId}.zip"`);
      
      // Pipe the stream
      response.data.pipe(res);
      
    } catch (error) {
      throw new Error(`Failed to download study archive: ${error.message}`);
    }
  }

  // 🔧 FIND STUDY BY STUDY INSTANCE UID
  async findStudyByUID(studyInstanceUID) {
    try {
      console.log(`🔍 Searching for study by UID: ${studyInstanceUID}`);
      
      const response = await axios.post(
        `${this.orthancUrl}/tools/find`,
        {
          Level: 'Study',
          Query: {
            StudyInstanceUID: studyInstanceUID
          }
        },
        {
          headers: this.authHeader,
          timeout: 10000
        }
      );
      
      if (response.data.length === 0) {
        throw new Error(`Study not found with UID: ${studyInstanceUID}`);
      }
      
      console.log(`✅ Found study: ${response.data[0]}`);
      return response.data[0]; // Return Orthanc study ID
      
    } catch (error) {
      throw new Error(`Failed to find study by UID: ${error.message}`);
    }
  }

  // 🔧 SEARCH STUDIES
  async searchStudies(searchParams) {
    try {
      const query = {};
      
      // Build query from search parameters
      if (searchParams.patientName) query.PatientName = `*${searchParams.patientName}*`;
      if (searchParams.patientId) query.PatientID = searchParams.patientId;
      if (searchParams.studyDate) query.StudyDate = searchParams.studyDate;
      if (searchParams.modality) query.ModalitiesInStudy = searchParams.modality;
      
      const response = await axios.post(
        `${this.orthancUrl}/tools/find`,
        {
          Level: 'Study',
          Query: query,
          Expand: true
        },
        {
          headers: this.authHeader,
          timeout: 15000
        }
      );
      
      return response.data;
      
    } catch (error) {
      throw new Error(`Orthanc search failed: ${error.message}`);
    }
  }

  // 🔧 GET ORTHANC STATUS
  async getStatus() {
    try {
      const response = await axios.get(`${this.orthancUrl}/system`, {
        headers: this.authHeader,
        timeout: 5000
      });
      
      return {
        connected: true,
        url: this.orthancUrl,
        username: this.orthancUsername,
        system: response.data
      };
      
    } catch (error) {
      return {
        connected: false,
        url: this.orthancUrl,
        error: error.message
      };
    }
  }
}

export default OrthancService;