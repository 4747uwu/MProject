import express from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import websocketService from '../config/webSocket.js';

// Import Mongoose Models
import DicomStudy from '../models/dicomStudyModel.js';
import Patient from '../models/patientModel.js';
import Lab from '../models/labModel.js';

const router = express.Router();

// --- Configuration ---
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');

// --- Redis Setup ---
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  tls: {},
  lazyConnect: true,
});

// --- Simple Job Queue for Stable Studies ---
class StableStudyQueue {
  constructor() {
    this.jobs = new Map();
    this.processing = new Set();
    this.nextJobId = 1;
    this.isProcessing = false;
    this.concurrency = 10; // Process max 2 stable studies simultaneously
  }

  async add(jobData) {
    const jobId = this.nextJobId++;
    const job = {
      id: jobId,
      type: 'process-stable-study',
      data: jobData,
      status: 'waiting',
      createdAt: new Date(),
      progress: 0,
      result: null,
      error: null
    };
    
    this.jobs.set(jobId, job);
    console.log(`📝 Stable Study Job ${jobId} queued`);
    
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return job;
  }

  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    console.log('🚀 Stable Study Queue processor started');
    
    while (this.getWaitingJobs().length > 0 || this.processing.size > 0) {
      while (this.processing.size < this.concurrency && this.getWaitingJobs().length > 0) {
        const waitingJobs = this.getWaitingJobs();
        if (waitingJobs.length > 0) {
          const job = waitingJobs[0];
          this.processJob(job);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isProcessing = false;
    console.log('⏹️ Stable Study Queue processor stopped');
  }

  async processJob(job) {
    this.processing.add(job.id);
    job.status = 'active';
    
    console.log(`🚀 Processing Stable Study Job ${job.id}`);
    
    try {
      job.result = await processStableStudy(job);
      job.status = 'completed';
      console.log(`✅ Stable Study Job ${job.id} completed successfully`);
      
    } catch (error) {
      job.error = error.message;
      job.status = 'failed';
      console.error(`❌ Stable Study Job ${job.id} failed:`, error.message);
      console.error(`❌ Stack:`, error.stack);
    } finally {
      this.processing.delete(job.id);
    }
  }

  getWaitingJobs() {
    return Array.from(this.jobs.values()).filter(job => job.status === 'waiting');
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getJobByRequestId(requestId) {
    return Array.from(this.jobs.values()).find(job => job.data.requestId === requestId);
  }
}

const jobQueue = new StableStudyQueue();

// --- Helper Functions ---

function processDicomPersonName(dicomNameField) {
  if (!dicomNameField || typeof dicomNameField !== 'string') {
    return {
      fullName: 'Unknown Patient',
      firstName: '',
      lastName: 'Unknown',
      middleName: '',
      namePrefix: '',
      nameSuffix: '',
      originalDicomFormat: dicomNameField || '',
      formattedForDisplay: 'Unknown Patient'
    };
  }

  const nameString = dicomNameField.trim();
  
  // Handle empty or whitespace-only names
  if (nameString === '' || nameString === '^' || nameString === '^^^') {
    return {
      fullName: 'Anonymous Patient',
      firstName: '',
      lastName: 'Anonymous',
      middleName: '',
      namePrefix: '',
      nameSuffix: '',
      originalDicomFormat: nameString,
      formattedForDisplay: 'Anonymous Patient'
    };
  }

  // Split by ^ (DICOM person name format: Family^Given^Middle^Prefix^Suffix)
  const parts = nameString.split('^');
  const familyName = (parts[0] || '').trim();
  const givenName = (parts[1] || '').trim();
  const middleName = (parts[2] || '').trim();
  const namePrefix = (parts[3] || '').trim();
  const nameSuffix = (parts[4] || '').trim();

  // Create display name
  const nameParts = [];
  if (namePrefix) nameParts.push(namePrefix);
  if (givenName) nameParts.push(givenName);
  if (middleName) nameParts.push(middleName);
  if (familyName) nameParts.push(familyName);
  if (nameSuffix) nameParts.push(nameSuffix);

  const displayName = nameParts.length > 0 ? nameParts.join(' ') : 'Unknown Patient';

  return {
    fullName: displayName,
    firstName: givenName,
    lastName: familyName,
    middleName: middleName,
    namePrefix: namePrefix,
    nameSuffix: nameSuffix,
    originalDicomFormat: nameString,
    formattedForDisplay: displayName
  };
}

// 🔧 ENHANCED: Fix DICOM date parsing
function formatDicomDateToISO(dicomDate) {
  if (!dicomDate || typeof dicomDate !== 'string') return null;
  
  // Handle different DICOM date formats
  let cleanDate = dicomDate.trim();
  
  // Handle YYYYMMDD format (standard DICOM)
  if (cleanDate.length === 8 && /^\d{8}$/.test(cleanDate)) {
    try {
      const year = cleanDate.substring(0, 4);
      const month = cleanDate.substring(4, 6);
      const day = cleanDate.substring(6, 8);
      
      // Validate date components
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);
      const dayNum = parseInt(day);
      
      if (yearNum >= 1900 && yearNum <= 2100 && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
      }
    } catch (error) {
      console.warn('Error parsing DICOM date:', dicomDate, error);
    }
  }
  
  // Handle other formats or return current date as fallback
  try {
    const parsed = new Date(cleanDate);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
      return parsed;
    }
  } catch (error) {
    console.warn('Error parsing date:', dicomDate, error);
  }
  
  // Return current date as fallback
  return new Date();
}

async function findOrCreatePatientFromTags(tags) {
  const patientIdDicom = tags.PatientID;
  const nameInfo = processDicomPersonName(tags.PatientName);
  const patientSex = tags.PatientSex;
  const patientBirthDate = tags.PatientBirthDate;

  if (!patientIdDicom && !nameInfo.fullName) {
    let unknownPatient = await Patient.findOne({ mrn: 'UNKNOWN_STABLE_STUDY' });
    if (!unknownPatient) {
      unknownPatient = await Patient.create({
        mrn: 'UNKNOWN_STABLE_STUDY',
        patientID: 'UNKNOWN_PATIENT', // 🔧 FIXED: Use consistent unknown ID
        patientNameRaw: 'Unknown Patient (Stable Study)',
        firstName: '',
        lastName: '',
        gender: patientSex || '',
        dateOfBirth: patientBirthDate || '',
        isAnonymous: true
      });
    }
    return unknownPatient;
  }

  let patient = await Patient.findOne({ mrn: patientIdDicom });

  if (!patient) {
    // 🔧 FIXED: Use DICOM PatientID directly instead of generating new one
    patient = new Patient({
      mrn: patientIdDicom || `ANON_${Date.now()}`,
      patientID: patientIdDicom || `ANON_${Date.now()}`, // 🔧 FIXED: Use DICOM PatientID
      patientNameRaw: nameInfo.formattedForDisplay,
      firstName: nameInfo.firstName,
      lastName: nameInfo.lastName,
      computed: {
        fullName: nameInfo.formattedForDisplay,
        namePrefix: nameInfo.namePrefix,
        nameSuffix: nameInfo.nameSuffix,
        originalDicomName: nameInfo.originalDicomFormat
      },
      gender: patientSex || '',
      dateOfBirth: patientBirthDate ? formatDicomDateToISO(patientBirthDate) : ''
    });
    
    await patient.save();
    console.log(`👤 Created patient: ${nameInfo.formattedForDisplay} (${patientIdDicom})`);
  } else {
    // Update existing patient if name format has improved
    if (patient.patientNameRaw && patient.patientNameRaw.includes('^') && nameInfo.formattedForDisplay && !nameInfo.formattedForDisplay.includes('^')) {
      console.log(`🔄 Updating patient name format from "${patient.patientNameRaw}" to "${nameInfo.formattedForDisplay}"`);
      
      patient.patientNameRaw = nameInfo.formattedForDisplay;
      patient.firstName = nameInfo.firstName;
      patient.lastName = nameInfo.lastName;
      
      if (!patient.computed) patient.computed = {};
      patient.computed.fullName = nameInfo.formattedForDisplay;
      patient.computed.originalDicomName = nameInfo.originalDicomFormat;
      
      await patient.save();
    }
  }
  
  return patient;
}

async function findOrCreateSourceLab(tags) {
  const DEFAULT_LAB = {
    name: 'Unknown Lab (No Identifier Found)',
    identifier: 'UNKNOWN_LAB',
    isActive: true,
  };

  try {
    // 🎯 ONLY CHECK THESE SPECIFIC PRIVATE TAGS - NO FALLBACKS
    const privateTags = ["0013,0010", "0015,0010", "0021,0010", "0043,0010"];
    
    console.log(`[StableStudy] 🔍 Checking private tags for lab identifier...`);
    console.log(`[StableStudy] 📋 Available tags:`, {
      "0013,0010": tags["0013,0010"] || 'NOT_FOUND',
      "0015,0010": tags["0015,0010"] || 'NOT_FOUND', 
      "0021,0010": tags["0021,0010"] || 'NOT_FOUND',
      "0043,0010": tags["0043,0010"] || 'NOT_FOUND'
    });
    
    for (const tag of privateTags) {
      const tagValue = tags[tag];
      
      // 🔧 FIX: Check for "SRJ" or any valid lab identifier (not default values)
      if (tagValue && tagValue.trim() !== '' && tagValue !== 'xcenticlab') {
        const labIdentifier = tagValue.trim();
        console.log(`[StableStudy] ✅ Found lab identifier in tag [${tag}]: ${labIdentifier}`);
        
        try {
          // Direct lookup by identifier field (case insensitive)
          const labByIdentifier = await Lab.findOne({ 
            identifier: { $regex: new RegExp(`^${escapeRegex(labIdentifier)}$`, 'i') },
            isActive: true 
          });
          
          if (labByIdentifier) {
            console.log(`[StableStudy] ✅ Found lab: ${labByIdentifier.name} (${labByIdentifier.identifier})`);
            return labByIdentifier;
          } else {
            console.warn(`[StableStudy] ⚠️ No lab found with identifier: ${labIdentifier}`);
            
            // 🔧 CREATE LAB: Auto-create lab if identifier is found but lab doesn't exist
            console.log(`[StableStudy] 🆕 Creating new lab with identifier: ${labIdentifier}`);
            const newLab = new Lab({
              name: `${labIdentifier} Laboratory`,
              identifier: labIdentifier.toUpperCase(),
              isActive: true,
              notes: `Auto-created from private DICOM tag [${tag}] with value "${labIdentifier}" on ${new Date().toISOString()}`
            });
            await newLab.save();
            console.log(`[StableStudy] ✅ Created new lab: ${newLab.name} (${newLab.identifier})`);
            return newLab;
          }
          
        } catch (labLookupError) {
          console.error(`[StableStudy] ❌ Error looking up lab with identifier ${labIdentifier}:`, labLookupError.message);
        }
      } else {
        console.log(`[StableStudy] 📋 Tag [${tag}] is empty or contains default value: ${tagValue || 'EMPTY'}`);
      }
    }
    
    // 🚫 NO FALLBACKS - If no private tag found, use unknown lab
    console.warn(`[StableStudy] ⚠️ No valid lab identifier found in any private tags`);
    
    // Find or create the unknown lab
    let unknownLab = await Lab.findOne({ identifier: DEFAULT_LAB.identifier });
    
    if (!unknownLab) {
      console.log(`[StableStudy] 🆕 Creating unknown lab: ${DEFAULT_LAB.name}`);
      unknownLab = new Lab({
        ...DEFAULT_LAB,
        notes: `Unknown lab created because no valid lab identifier was found in private tags [0013,0010], [0015,0010], [0021,0010], [0043,0010]. Created on ${new Date().toISOString()}`
      });
      await unknownLab.save();
    }

    console.log(`[StableStudy] 🔄 Using unknown lab: ${unknownLab.name}`);
    return unknownLab;

  } catch (error) {
    console.error('❌ Error in findOrCreateSourceLab:', error);
    
    // Emergency fallback - find any active lab
    let emergencyLab = await Lab.findOne({ isActive: true });
    if (!emergencyLab) {
      emergencyLab = new Lab({
        name: 'Emergency Default Lab',
        identifier: 'EMERGENCY_DEFAULT',
        isActive: true,
        notes: `Emergency lab created due to system error. Created on ${new Date().toISOString()}`
      });
      await emergencyLab.save();
    }
    
    console.log(`[StableStudy] 🚨 Using emergency lab: ${emergencyLab.name}`);
    return emergencyLab;
  }
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Main Processing Function ---
async function processStableStudy(job) {
  const { orthancStudyId, requestId } = job.data;
  const startTime = Date.now();
  
  try {
    console.log(`[StableStudy] 🚀 Processing stable study: ${orthancStudyId}`);
    job.progress = 10;
    
    // Get study information from Orthanc
    const studyInfoUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}`;
    console.log(`[StableStudy] 🌐 Fetching from: ${studyInfoUrl}`);
    
    const studyResponse = await axios.get(studyInfoUrl, {
      headers: { 'Authorization': orthancAuth },
      timeout: 10000
    });
    
    const studyInfo = studyResponse.data;
    console.log(`[StableStudy] 📋 Raw study info:`, {
      ID: studyInfo.ID,
      MainDicomTags: studyInfo.MainDicomTags,
      SeriesLength: studyInfo.Series?.length,
      InstancesLength: studyInfo.Instances?.length,
      ParentPatient: studyInfo.ParentPatient
    });
    
    const studyInstanceUID = studyInfo.MainDicomTags?.StudyInstanceUID;
    
    if (!studyInstanceUID) {
      throw new Error('StudyInstanceUID not found in stable study');
    }
    
    console.log(`[StableStudy] 📋 Study: ${studyInstanceUID}`);
    console.log(`[StableStudy] 📊 Direct counts - Series: ${studyInfo.Series?.length || 0}, Instances: ${studyInfo.Instances?.length || 0}`);
    
    job.progress = 30;
    
    // 🔧 ENHANCED: Multiple methods to get instances
    let instancesArray = [];
    let firstInstanceId = null;
    let tags = {};
    
    // Method 1: Try /studies/{id}/instances endpoint
    console.log(`[StableStudy] 📁 Method 1: Direct instances API`);
    try {
      const instancesUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/instances`;
      const instancesResponse = await axios.get(instancesUrl, {
        headers: { 'Authorization': orthancAuth },
        timeout: 15000
      });
      
      instancesArray = instancesResponse.data || [];
      console.log(`[StableStudy] 📁 Method 1 result: ${instancesArray.length} instances`);
      
      if (instancesArray.length > 0) {
        firstInstanceId = typeof instancesArray[0] === 'string' 
          ? instancesArray[0] 
          : instancesArray[0].ID || instancesArray[0];
        console.log(`[StableStudy] 📁 Method 1 first instance: ${firstInstanceId}`);
      }
    } catch (instancesError) {
      console.warn(`[StableStudy] ⚠️ Method 1 failed:`, instancesError.message);
    }
    
    // Method 2: Get instances from each series individually
    if (instancesArray.length === 0 && studyInfo.Series && studyInfo.Series.length > 0) {
      console.log(`[StableStudy] 📁 Method 2: Series-by-series lookup`);
      
      for (const seriesId of studyInfo.Series) {
        try {
          console.log(`[StableStudy] 🔍 Checking series: ${seriesId}`);
          
          // Get series info
          const seriesUrl = `${ORTHANC_BASE_URL}/series/${seriesId}`;
          const seriesResponse = await axios.get(seriesUrl, {
            headers: { 'Authorization': orthancAuth },
            timeout: 5000
          });
          
          const seriesData = seriesResponse.data;
          console.log(`[StableStudy] 📋 Series ${seriesId}:`, {
            MainDicomTags: seriesData.MainDicomTags,
            InstancesLength: seriesData.Instances?.length,
            FirstInstance: seriesData.Instances?.[0]
          });
          
          const seriesInstances = seriesData.Instances || [];
          instancesArray.push(...seriesInstances);
          
          if (!firstInstanceId && seriesInstances.length > 0) {
            firstInstanceId = typeof seriesInstances[0] === 'string' 
              ? seriesInstances[0] 
              : seriesInstances[0].ID || seriesInstances[0];
            console.log(`[StableStudy] 📁 Method 2 first instance: ${firstInstanceId}`);
          }
          
          // Try to get series-level tags if available
          if (seriesData.MainDicomTags && Object.keys(tags).length === 0) {
            tags = { ...tags, ...seriesData.MainDicomTags };
          }
          
        } catch (seriesError) {
          console.warn(`[StableStudy] ⚠️ Could not get series ${seriesId}:`, seriesError.message);
        }
      }
      
      console.log(`[StableStudy] 📁 Method 2 result: ${instancesArray.length} instances total`);
    }
    
    // Method 3: If still no instances, try using series IDs as instance IDs (sometimes they're the same)
    if (instancesArray.length === 0 && studyInfo.Series && studyInfo.Series.length > 0) {
      console.log(`[StableStudy] 📁 Method 3: Trying series IDs as instance IDs`);
      
      for (const seriesId of studyInfo.Series) {
        try {
          // Sometimes in single-instance series, the series ID can be used to get instance info
          const instanceTestUrl = `${ORTHANC_BASE_URL}/instances/${seriesId}`;
          const instanceTestResponse = await axios.get(instanceTestUrl, {
            headers: { 'Authorization': orthancAuth },
            timeout: 3000
          });
          
          console.log(`[StableStudy] 📁 Method 3: Series ID ${seriesId} is also an instance!`);
          instancesArray.push(seriesId);
          
          if (!firstInstanceId) {
            firstInstanceId = seriesId;
          }
          
        } catch (instanceTestError) {
          // This is expected to fail most of the time
          console.log(`[StableStudy] 📁 Method 3: Series ID ${seriesId} is not an instance`);
        }
      }
      
      console.log(`[StableStudy] 📁 Method 3 result: ${instancesArray.length} instances`);
    }
    
    job.progress = 50;
    
    // 🔧 Get metadata - try multiple approaches
    if (firstInstanceId) {
      console.log(`[StableStudy] 🔍 Getting metadata from instance: ${firstInstanceId}`);
      
      try {
        // 🔧 FIX: Use /tags endpoint instead of /simplified-tags to get full tag structure
        const metadataUrl = `${ORTHANC_BASE_URL}/instances/${firstInstanceId}/tags`;
        const metadataResponse = await axios.get(metadataUrl, {
          headers: { 'Authorization': orthancAuth },
          timeout: 8000
        });
        
        const rawTags = metadataResponse.data;
        
        // 🔧 FIX: Extract Value field from each tag
        tags = {};
        for (const [tagKey, tagData] of Object.entries(rawTags)) {
          if (tagData && typeof tagData === 'object' && tagData.Value !== undefined) {
            tags[tagKey] = tagData.Value;
          } else if (typeof tagData === 'string') {
            tags[tagKey] = tagData;
          }
        }
        
        // 🔧 FIX: Also extract common DICOM fields with proper names
        tags.PatientName = rawTags["0010,0010"]?.Value || tags.PatientName;
        tags.PatientID = rawTags["0010,0020"]?.Value || tags.PatientID;
        tags.StudyDescription = rawTags["0008,1030"]?.Value || tags.StudyDescription;
        tags.Modality = rawTags["0008,0060"]?.Value || tags.Modality;
        tags.StudyDate = rawTags["0008,0020"]?.Value || tags.StudyDate;
        tags.StudyTime = rawTags["0008,0030"]?.Value || tags.StudyTime;
        tags.AccessionNumber = rawTags["0008,0050"]?.Value || tags.AccessionNumber;
        tags.InstitutionName = rawTags["0008,0080"]?.Value || tags.InstitutionName;
        
        console.log(`[StableStudy] ✅ Got instance metadata:`, {
          PatientName: tags.PatientName,
          PatientID: tags.PatientID,
          StudyDescription: tags.StudyDescription,
          Modality: tags.Modality,
          // 🔧 FIX: Log the private tag values
          PrivateTags: {
            "0013,0010": tags["0013,0010"],
            "0015,0010": tags["0015,0010"],
            "0021,0010": tags["0021,0010"],
            "0043,0010": tags["0043,0010"]
          }
        });
        
      } catch (metadataError) {
        console.warn(`[StableStudy] ⚠️ Could not get instance metadata:`, metadataError.message);
        
        // 🔧 FALLBACK: Try simplified-tags if /tags fails
        try {
          const simplifiedUrl = `${ORTHANC_BASE_URL}/instances/${firstInstanceId}/simplified-tags`;
          const simplifiedResponse = await axios.get(simplifiedUrl, {
            headers: { 'Authorization': orthancAuth },
            timeout: 8000
          });
          
          tags = { ...tags, ...simplifiedResponse.data };
          console.log(`[StableStudy] ✅ Got simplified metadata as fallback`);
        } catch (simplifiedError) {
          console.warn(`[StableStudy] ⚠️ Simplified tags also failed:`, simplifiedError.message);
        }
      }
    }
    
    // Fallback: use study-level tags if no instance metadata
    if (Object.keys(tags).length === 0 || !tags.PatientName) {
      console.log(`[StableStudy] 📋 Using study-level metadata as fallback`);
      tags = { ...studyInfo.MainDicomTags, ...tags };
    }
    
    // Final fallback: create minimal tags if still nothing
    if (!tags.PatientName && !tags.PatientID) {
      console.log(`[StableStudy] ⚠️ Creating minimal fallback metadata`);
      tags = {
        PatientName: 'Unknown Patient',
        PatientID: `UNKNOWN_${Date.now()}`,
        StudyDescription: 'Unknown Study',
        StudyInstanceUID: studyInstanceUID,
        StudyDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
        Modality: 'UNKNOWN',
        ...tags
      };
    }
    
    console.log(`[StableStudy] 📋 Final metadata for processing:`, {
      PatientName: tags.PatientName,
      PatientID: tags.PatientID,
      StudyDescription: tags.StudyDescription,
      Modality: tags.Modality,
      InstancesFound: instancesArray.length
    });
    
    job.progress = 60;
    
    // Continue with patient and lab creation
    const patientRecord = await findOrCreatePatientFromTags(tags);
    const labRecord = await findOrCreateSourceLab(tags);
    
    console.log(`[StableStudy] 👤 Patient: ${patientRecord.patientNameRaw}`);
    console.log(`[StableStudy] 🏥 Lab: ${labRecord.name}`);
    
    job.progress = 70;
    
    // Get modalities
    const modalitiesSet = new Set();
    if (tags.Modality) {
      modalitiesSet.add(tags.Modality);
    }
    
    // Check series for additional modalities
    for (const seriesId of studyInfo.Series || []) {
      try {
        const seriesUrl = `${ORTHANC_BASE_URL}/series/${seriesId}`;
        const seriesResponse = await axios.get(seriesUrl, {
          headers: { 'Authorization': orthancAuth },
          timeout: 3000
        });
        const modality = seriesResponse.data.MainDicomTags?.Modality;
        if (modality) modalitiesSet.add(modality);
      } catch (seriesError) {
        // Don't fail on this
      }
    }
    
    if (modalitiesSet.size === 0) {
      modalitiesSet.add('UNKNOWN');
    }
    
    job.progress = 80;
    
    // Create study record
    let dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID });
    
    const actualInstanceCount = instancesArray.length;
    const actualSeriesCount = studyInfo.Series?.length || 0;
    
    console.log(`[StableStudy] 📊 Final counts - Series: ${actualSeriesCount}, Instances: ${actualInstanceCount}`);
    
    const studyData = {
      orthancStudyID: orthancStudyId,
      studyInstanceUID: studyInstanceUID,
      accessionNumber: tags.AccessionNumber || '',
      patient: patientRecord._id,
      patientId: patientRecord.patientID,
      sourceLab: labRecord._id,
      studyDate: formatDicomDateToISO(tags.StudyDate),
      studyTime: tags.StudyTime || '',
      modalitiesInStudy: Array.from(modalitiesSet),
      examDescription: tags.StudyDescription || 'Unknown Study',
      institutionName: tags.InstitutionName || '',
      workflowStatus: actualInstanceCount > 0 ? 'new_study_received' : 'new_metadata_only',
      
      seriesCount: actualSeriesCount,
      instanceCount: actualInstanceCount,
      seriesImages: `${actualSeriesCount}/${actualInstanceCount}`,
      
      patientInfo: {
        patientID: patientRecord.patientID,
        patientName: patientRecord.patientNameRaw,
        gender: patientRecord.gender || '',
        dateOfBirth: tags.PatientBirthDate || ''
      },
      
      referringPhysicianName: tags.ReferringPhysicianName || '',
      physicians: {
        referring: {
          name: tags.ReferringPhysicianName || '',
          email: '',
          mobile: tags.ReferringPhysicianTelephoneNumbers || '',
          institution: tags.ReferringPhysicianAddress || ''
        },
        requesting: {
          name: tags.RequestingPhysician || '',
          email: '',
          mobile: '',
          institution: tags.RequestingService || ''
        }
      },
      
      technologist: {
        name: tags.OperatorName || tags.PerformingPhysicianName || '',
        mobile: '',
        comments: '',
        reasonToSend: tags.ReasonForStudy || tags.RequestedProcedureDescription || ''
      },
      
      studyPriority: tags.StudyPriorityID || 'SELECT',
      caseType: tags.RequestPriority || 'routine',
      
      equipment: {
        manufacturer: tags.Manufacturer || '',
        model: tags.ManufacturerModelName || '',
        stationName: tags.StationName || '',
        softwareVersion: tags.SoftwareVersions || ''
      },
      
      protocolName: tags.ProtocolName || '',
      bodyPartExamined: tags.BodyPartExamined || '',
      contrastBolusAgent: tags.ContrastBolusAgent || '',
      contrastBolusRoute: tags.ContrastBolusRoute || '',
      acquisitionDate: tags.AcquisitionDate || '',
      acquisitionTime: tags.AcquisitionTime || '',
      studyComments: tags.StudyComments || '',
      additionalPatientHistory: tags.AdditionalPatientHistory || '',
      
      // 🆕 ADD: Store custom Lab ID information
      customLabInfo: {
        dicomLabId: tags["0011,1010"] || null,
        labIdSource: tags["0011,1010"] ? 'dicom_custom_tag' : 'fallback_detection',
        labDetectionMethod: tags["0011,1010"] && mongoose.Types.ObjectId.isValid(tags["0011,1010"]) 
          ? 'mongodb_objectid' 
          : tags["0011,1010"] 
            ? 'identifier_lookup' 
            : 'dicom_tags_fallback'
      },
      
      storageInfo: {
        type: 'orthanc',
        orthancStudyId: orthancStudyId,
        receivedAt: new Date(),
        isStableStudy: true,
        instancesFound: actualInstanceCount,
        processingMethod: actualInstanceCount > 0 ? 'with_instances' : 'metadata_only',
        debugInfo: {
          apiInstancesFound: actualInstanceCount,
          webUIShowsInstances: true,
          apiMethodUsed: actualInstanceCount > 0 ? 'series_lookup' : 'study_metadata_only',
          customLabIdProvided: !!tags["0011,1010"], // 🆕 ADD: Track if custom Lab ID was provided
          customLabIdValue: tags["0011,1010"] || null
        }
      }
    };
    
   if (dicomStudyDoc) {
      console.log(`[StableStudy] 📝 Updating existing study`);
      Object.assign(dicomStudyDoc, studyData);
      dicomStudyDoc.statusHistory.push({
        status: studyData.workflowStatus,
        changedAt: new Date(),
        note: `Stable study updated: ${actualSeriesCount} series, ${actualInstanceCount} instances. Lab: ${labRecord.name} (Custom Lab ID: ${tags["0011,1010"] || 'Not provided'})`
      });
    } else {
      console.log(`[StableStudy] 🆕 Creating new study`);
      dicomStudyDoc = new DicomStudy({
        ...studyData,
        statusHistory: [{
          status: studyData.workflowStatus,
          changedAt: new Date(),
          note: `Stable study created: ${actualSeriesCount} series, ${actualInstanceCount} instances. Lab: ${labRecord.name} (Custom Lab ID: ${tags["0011,1010"] || 'Not provided'})`
        }]
      });
    }
    
    await dicomStudyDoc.save();
    console.log(`[StableStudy] ✅ Study saved with ID: ${dicomStudyDoc._id}`);
    
    job.progress = 90;
    
    // Send notification
    const studyNotificationData = {
      _id: dicomStudyDoc._id,
      patientName: patientRecord.patientNameRaw,
      patientId: patientRecord.patientID,
      modality: Array.from(modalitiesSet).join(', '),
      location: labRecord.name,
      labId: labRecord._id,
      institutionName: tags.InstitutionName || '',
      studyDate: tags.StudyDate,
      workflowStatus: dicomStudyDoc.workflowStatus,
      priority: dicomStudyDoc.caseType || 'routine',
      accessionNumber: dicomStudyDoc.accessionNumber,
      seriesImages: `${actualSeriesCount}/${actualInstanceCount}`,
      isNewLab: labRecord.createdAt > new Date(Date.now() - 5000),
      storageType: 'orthanc',
      notificationReason: 'Stable study processed',
      isCompleteStudy: actualInstanceCount > 0
    };
    
    try {
      await websocketService.notifySimpleNewStudy();
      console.log(`[StableStudy] ✅ Simple notification sent`);
    } catch (wsError) {
      console.warn(`[StableStudy] ⚠️ Notification failed:`, wsError.message);
    }
    
    job.progress = 100;
    
    const result = {
      success: true,
      orthancStudyId: orthancStudyId,
      studyDatabaseId: dicomStudyDoc._id,
      studyInstanceUID: studyInstanceUID,
      seriesCount: actualSeriesCount,
      instanceCount: actualInstanceCount,
      processedAt: new Date(),
      elapsedTime: Date.now() - startTime,
      processingMethod: actualInstanceCount > 0 ? 'with_instances' : 'metadata_only',
      metadataSummary: {
        patientName: patientRecord.patientNameRaw,
        patientId: patientRecord.patientID,
        modalities: Array.from(modalitiesSet),
        studyDate: tags.StudyDate || 'Unknown',
        labName: labRecord.name,
        institutionName: tags.InstitutionName || 'Unknown'
      }
    };
    
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(result));
    
    console.log(`[StableStudy] ✅ Completed in ${Date.now() - startTime}ms - Series: ${actualSeriesCount}, Instances: ${actualInstanceCount}`);
    return result;
    
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[StableStudy] ❌ Failed after ${elapsedTime}ms:`, error.message);
    console.error(`[StableStudy] ❌ Stack:`, error.stack);
    
    const errorResult = {
      success: false,
      error: error.message,
      elapsedTime: elapsedTime,
      orthancStudyId: orthancStudyId,
      failedAt: new Date()
    };
    
    await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(errorResult));
    throw error;
  }
}

// --- Redis Connection Setup ---
redis.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redis.on('ready', () => {
  console.log('✅ Redis is ready for operations');
});

redis.on('error', (error) => {
  console.error('❌ Redis connection error:', error.message);
});

// Test Redis connection
console.log('🧪 Testing Redis connection...');
redis.ping()
  .then(() => {
    console.log('✅ Redis ping successful');
    return redis.set('startup-test', 'stable-study-system');
  })
  .then(() => {
    console.log('✅ Redis write test successful');
    return redis.get('startup-test');
  })
  .then((value) => {
    console.log('✅ Redis read test successful, value:', value);
    return redis.del('startup-test');
  })
  .then(() => {
    console.log('✅ All Redis tests passed');
  })
  .catch(error => {
    console.error('❌ Redis test failed:', error.message);
  });

// --- Routes ---

// Test connection route
router.get('/test-connection', async (req, res) => {
  try {
    // Test Redis
    await redis.set('test-key', `test-${Date.now()}`);
    const redisResult = await redis.get('test-key');
    await redis.del('test-key');
    
    // Test Orthanc
    const orthancResponse = await axios.get(`${ORTHANC_BASE_URL}/system`, {
      headers: { 'Authorization': orthancAuth },
      timeout: 5000
    });
    
    res.json({
      redis: 'working',
      redisValue: redisResult,
      orthanc: 'working',
      orthancVersion: orthancResponse.data.Version,
      queue: 'working',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Connection test failed:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// Main stable study route
router.post('/stable-study', async (req, res) => {
  console.log('[StableStudy] 📋 Received stable study notification');
  console.log('[StableStudy] 📋 Body type:', typeof req.body);
  console.log('[StableStudy] 📋 Body content:', req.body);
  
  let orthancStudyId = null; 
  try {
    // Extract Orthanc study ID from request
    if (typeof req.body === 'string') {
      orthancStudyId = req.body.trim();
      console.log('[StableStudy] 📋 Extracted from string:', orthancStudyId);
    } else if (req.body && typeof req.body === 'object') {
      // Handle the case where body is an object like { '9442d79e-...': '' }
      const keys = Object.keys(req.body);
      if (keys.length > 0) {
        orthancStudyId = keys[0]; // Take the first key as the study ID
        console.log('[StableStudy] 📋 Extracted from object key:', orthancStudyId);
      } else if (req.body.studyId) {
        orthancStudyId = req.body.studyId;
        console.log('[StableStudy] 📋 Extracted from studyId field:', orthancStudyId);
      } else if (req.body.ID) {
        orthancStudyId = req.body.ID;
        console.log('[StableStudy] 📋 Extracted from ID field:', orthancStudyId);
      }
    }
    
    console.log('[StableStudy] 📋 Final extracted ID:', orthancStudyId);
    
    if (!orthancStudyId || orthancStudyId.trim() === '') {
      console.error('[StableStudy] ❌ No valid Orthanc Study ID found');
      return res.status(400).json({ 
        error: 'Invalid or missing Orthanc Study ID',
        receivedBody: req.body,
        bodyType: typeof req.body,
        keys: typeof req.body === 'object' ? Object.keys(req.body) : 'N/A'
      });
    }
    
    // Clean the study ID
    orthancStudyId = orthancStudyId.trim();
    console.log('[StableStudy] 📋 Using study ID:', orthancStudyId);
    
    const requestId = `stable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('[StableStudy] 📋 Generated request ID:', requestId);
    
    // Add job to process the complete stable study
    const job = await jobQueue.add({
      orthancStudyId: orthancStudyId,
      requestId: requestId,
      submittedAt: new Date(),
      originalBody: req.body
    });
    
    console.log(`[StableStudy] ✅ Job ${job.id} queued for stable study: ${orthancStudyId}`);
    
    // Immediate response
    res.status(202).json({
      message: 'Stable study queued for processing',
      jobId: job.id,
      requestId: requestId,
      orthancStudyId: orthancStudyId,
      status: 'queued',
      checkStatusUrl: `/orthanc/job-status/${requestId}`
    });
    
  } catch (error) {
    console.error('[StableStudy] ❌ Error in route handler:', error);
    console.error('[StableStudy] ❌ Error stack:', error.stack);
    res.status(500).json({
      message: 'Error queuing stable study for processing',
      error: error.message,
      receivedBody: req.body,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Job status route
router.get('/job-status/:requestId', async (req, res) => {
  const { requestId } = req.params;
  
  try {
    // Check Redis first
    const resultData = await redis.get(`job:result:${requestId}`);
    
    if (resultData) {
      const result = JSON.parse(resultData);
      res.json({
        status: result.success ? 'completed' : 'failed',
        result: result,
        requestId: requestId
      });
    } else {
      // Check in-memory queue
      const job = jobQueue.getJobByRequestId(requestId);
      
      if (job) {
        res.json({
          status: job.status,
          progress: job.progress,
          requestId: requestId,
          jobId: job.id,
          createdAt: job.createdAt,
          error: job.error
        });
      } else {
        res.status(404).json({
          status: 'not_found',
          message: 'Job not found or expired',
          requestId: requestId
        });
      }
    }
  } catch (error) {
    console.error('Error checking job status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Error checking job status',
      error: error.message
    });
  }
});

export default router;