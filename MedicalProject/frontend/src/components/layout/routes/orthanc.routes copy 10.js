import express from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import websocketService from '../config/webSocket.js';
import CloudflareR2ZipService from '../services/wasabi.zip.service.js';

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
  const patientNameRaw = tags.PatientName; // ✅ Use raw name as-is
  const patientSex = tags.PatientSex;
  const patientAge = tags.PatientAge;
  const patientBirthDate = tags.PatientBirthDate;

  // ✅ ALWAYS CREATE: No existence checks, always create new patient
  console.log(`👤 Creating new patient from DICOM tags - PatientID: ${patientIdDicom}, Name: ${patientNameRaw}`);

  try {
    // ✅ SIMPLE: Create patient with minimal processing - save name as-is
    const patient = new Patient({
      mrn: patientIdDicom || `UNKNOWN_${Date.now()}`,
      patientID: patientIdDicom || `UNKNOWN_${Date.now()}`, 
      patientNameRaw: patientNameRaw || 'Unknown Patient', // ✅ Save exactly as received
      firstName: '', // ✅ Leave empty - no name parsing
      lastName: patientNameRaw || 'Unknown Patient', // ✅ Put full name in lastName for backward compatibility
      computed: {
        fullName: patientNameRaw || 'Unknown Patient', // ✅ Use raw name
        originalDicomName: patientNameRaw || '' // ✅ Store original
      },
      gender: patientSex || '',
      age: patientAge || '',
      dateOfBirth: patientBirthDate ? formatDicomDateToISO(patientBirthDate) : null
    });
    
    await patient.save();
    console.log(`✅ Created new patient: ${patientNameRaw} (ID: ${patientIdDicom}) - MongoDB ID: ${patient._id}`);
    
    return patient;
    
  } catch (error) {
    console.error(`❌ Error creating patient:`, error);
    
    // ✅ FALLBACK: Create minimal patient if save fails
    const fallbackPatient = new Patient({
      mrn: `FALLBACK_${Date.now()}`,
      patientID: `FALLBACK_${Date.now()}`,
      patientNameRaw: patientNameRaw || 'Unknown Patient',
      firstName: '',
      lastName: patientNameRaw || 'Unknown Patient',
      computed: {
        fullName: patientNameRaw || 'Unknown Patient',
        originalDicomName: patientNameRaw || ''
      },
      gender: patientSex || '',
      age: patientAge || ''
    });
    
    await fallbackPatient.save();
    console.log(`⚠️ Created fallback patient due to error: ${fallbackPatient._id}`);
    
    return fallbackPatient;
  }
}

async function findOrCreateSourceLab(tags) {
  const DEFAULT_LAB = {
    name: 'N/A',
    identifier: 'n/a',
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
// ✅ HIGHLY OPTIMIZED: Minimal API calls version
async function processStableStudy(job) {
  const { orthancStudyId, requestId } = job.data;
  const startTime = Date.now();
  
  try {
    console.log(`[StableStudy] 🚀 OPTIMIZED Processing stable study: ${orthancStudyId}`);
    job.progress = 10;
    
    // ✅ STEP 1: SINGLE EFFICIENT CALL - Get ALL study data at once
    console.log(`[StableStudy] 🔍 Making SINGLE optimized call for all study data...`);
    const studyUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}`;
    const studyResponse = await axios.get(studyUrl, {
      headers: { 'Authorization': orthancAuth },
      timeout: 15000
    });
    
    const studyInfo = studyResponse.data;
    const studyInstanceUID = studyInfo.MainDicomTags?.StudyInstanceUID;
    
    if (!studyInstanceUID) {
      throw new Error('StudyInstanceUID not found in stable study');
    }
    
    console.log(`[StableStudy] 📋 Study UID: ${studyInstanceUID}`);
    console.log(`[StableStudy] 📊 Study level counts - Series: ${studyInfo.Series?.length || 0}`);
    
    job.progress = 30;
    
    // ✅ STEP 2: SINGLE CALL - Get expanded instances with ALL metadata we need
    let detailedInstances = [];
    let tags = {};

    try {
      console.log(`[StableStudy] 📁 Getting ALL instances with expanded metadata in ONE call...`);
      const instancesUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/instances?expand`;
      const instancesResponse = await axios.get(instancesUrl, {
        headers: { 'Authorization': orthancAuth },
        timeout: 20000 // Longer timeout for expanded data
      });
      
      detailedInstances = instancesResponse.data || [];
      console.log(`[StableStudy] ✅ Got ${detailedInstances.length} instances with full metadata in ONE call`);
      
      // ✅ Extract ALL metadata from the FIRST expanded instance (no additional calls needed)
      if (detailedInstances.length > 0) {
        const firstInstance = detailedInstances[0];
        
        // ✅ SMART: Extract from all available tag sources in the expanded instance
        const instanceTags = firstInstance.MainDicomTags || {};
        const patientTags = firstInstance.PatientMainDicomTags || {};
        const studyTags = firstInstance.StudyMainDicomTags || {};
        
        // ✅ FIX: Get modality from multiple sources with better fallback
        let modality = instanceTags.Modality || 
                       studyTags.Modality || 
                       patientTags.Modality ||
                       studyInfo.MainDicomTags?.Modality;
        
        // ✅ DEBUG: Log modality detection
        console.log(`[StableStudy] 🔬 Modality detection:`);
        console.log(`[StableStudy] 🔬 instanceTags.Modality: ${instanceTags.Modality || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 🔬 studyTags.Modality: ${studyTags.Modality || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 🔬 studyInfo.MainDicomTags.Modality: ${studyInfo.MainDicomTags?.Modality || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 🔬 Final modality: ${modality || 'STILL_UNKNOWN'}`);
        
        // ✅ Combine all tag sources for comprehensive metadata
        tags = {
          // Patient info from all sources
          PatientName: patientTags.PatientName || instanceTags.PatientName || studyTags.PatientName,
          PatientID: patientTags.PatientID || instanceTags.PatientID || studyTags.PatientID,
          PatientSex: patientTags.PatientSex || instanceTags.PatientSex,
          PatientAge: patientTags.PatientAge || instanceTags.PatientAge,
          PatientBirthDate: patientTags.PatientBirthDate || instanceTags.PatientBirthDate,
          
          // Study info
          StudyInstanceUID: studyInstanceUID,
          StudyDescription: studyTags.StudyDescription || instanceTags.StudyDescription || studyInfo.MainDicomTags?.StudyDescription,
          StudyDate: studyTags.StudyDate || instanceTags.StudyDate || studyInfo.MainDicomTags?.StudyDate,
          StudyTime: studyTags.StudyTime || instanceTags.StudyTime || studyInfo.MainDicomTags?.StudyTime,
          AccessionNumber: studyTags.AccessionNumber || instanceTags.AccessionNumber || studyInfo.MainDicomTags?.AccessionNumber,
          
          // ✅ FIX: Enhanced modality detection
          Modality: modality, // Use the enhanced modality detection above
          
          // Series/Instance info
          SeriesDescription: instanceTags.SeriesDescription,
          SeriesNumber: instanceTags.SeriesNumber,
          SeriesInstanceUID: instanceTags.SeriesInstanceUID,
          
          // Equipment info
          Manufacturer: instanceTags.Manufacturer,
          ManufacturerModelName: instanceTags.ManufacturerModelName,
          StationName: instanceTags.StationName,
          SoftwareVersions: instanceTags.SoftwareVersions,
          
          // Institution info
          InstitutionName: instanceTags.InstitutionName,
          
          // Additional metadata
          ReferringPhysicianName: studyTags.ReferringPhysicianName || instanceTags.ReferringPhysicianName,
          RequestingPhysician: studyTags.RequestingPhysician || instanceTags.RequestingPhysician,
          PerformingPhysicianName: instanceTags.PerformingPhysicianName,
          OperatorName: instanceTags.OperatorName,
          BodyPartExamined: instanceTags.BodyPartExamined,
          ProtocolName: instanceTags.ProtocolName,
          StudyComments: studyTags.StudyComments,
        };
        
        console.log(`[StableStudy] ✅ Extracted comprehensive metadata from expanded instance:`);
        console.log(`[StableStudy] 👤 Patient: ${tags.PatientName} (${tags.PatientID})`);
        console.log(`[StableStudy] 📋 Study: ${tags.StudyDescription}`);
        console.log(`[StableStudy] 🏥 Institution: ${tags.InstitutionName}`);
        console.log(`[StableStudy] 🔬 Modality: ${tags.Modality || 'STILL_NOT_FOUND'}`);
      }
      
    } catch (instancesError) {
      console.warn(`[StableStudy] ⚠️ Expanded instances call failed:`, instancesError.message);
      
      // ✅ FALLBACK: If expanded call fails, use study data + get instances normally
      console.log(`[StableStudy] 🔄 Falling back to study metadata...`);
      tags = { ...studyInfo.MainDicomTags };
      
      // ✅ FALLBACK DEBUG: Check study-level modality
      console.log(`[StableStudy] 🔬 FALLBACK Modality from study: ${tags.Modality || 'NOT_IN_STUDY_TAGS'}`);
      
      // Get basic instances list for counting
      try {
        const basicInstancesUrl = `${ORTHANC_BASE_URL}/studies/${orthancStudyId}/instances`;
        const basicInstancesResponse = await axios.get(basicInstancesUrl, {
          headers: { 'Authorization': orthancAuth },
          timeout: 10000
        });
        detailedInstances = basicInstancesResponse.data || [];
        console.log(`[StableStudy] 📁 Fallback: Got ${detailedInstances.length} basic instances`);
      } catch (basicError) {
        console.warn(`[StableStudy] ⚠️ Even basic instances failed:`, basicError.message);
        detailedInstances = [];
      }
    }
    
    job.progress = 50;
    
    // ✅ STEP 3: SINGLE CALL for private lab tags (only if we have instances)
    if (detailedInstances.length > 0) {
      try {
        const firstInstanceId = typeof detailedInstances[0] === 'string' 
          ? detailedInstances[0] 
          : detailedInstances[0].ID || detailedInstances[0];
        
        console.log(`[StableStudy] 🔍 Getting private tags from first instance: ${firstInstanceId}`);
        const tagsUrl = `${ORTHANC_BASE_URL}/instances/${firstInstanceId}/tags`;
        const tagsResponse = await axios.get(tagsUrl, {
          headers: { 'Authorization': orthancAuth },
          timeout: 8000
        });
        
        const rawTags = tagsResponse.data;
        
        // ✅ Extract private lab tags
        const privateTags = ["0013,0010", "0015,0010", "0021,0010", "0043,0010"];
        for (const tag of privateTags) {
          if (rawTags[tag]?.Value) {
            tags[tag] = rawTags[tag].Value;
          }
        }
        
        // ✅ ENHANCED: Fill in any missing standard tags from raw tags INCLUDING REFERRING PHYSICIAN
        const standardTagMap = {
          "0010,0010": "PatientName",
          "0010,0020": "PatientID", 
          "0010,0040": "PatientSex",
          "0010,1010": "PatientAge",
          "0008,1030": "StudyDescription",
          "0008,0060": "Modality",
          "0008,0020": "StudyDate",
          "0008,0030": "StudyTime",
          "0008,0050": "AccessionNumber",
          "0008,0080": "InstitutionName",
          "0008,0090": "ReferringPhysicianName", // ✅ CRITICAL: Main referring physician tag
          "0008,1070": "OperatorName",           // ✅ Additional: Operator name
          "0018,0015": "BodyPartExamined",       // ✅ Additional: Body part
          "0008,0070": "Manufacturer",           // ✅ Additional: Manufacturer
          "0008,1090": "ManufacturerModelName",  // ✅ Additional: Model
          "0008,1010": "StationName",            // ✅ Additional: Station name
          "0018,1020": "SoftwareVersions",       // ✅ Additional: Software versions
          "0020,0010": "StudyID",                // ✅ Additional: Study ID
          "0008,103e": "SeriesDescription"       // ✅ Additional: Series description
        };
        
        for (const [tagNum, tagName] of Object.entries(standardTagMap)) {
          if (!tags[tagName] && rawTags[tagNum]?.Value) {
            tags[tagName] = rawTags[tagNum].Value;
            console.log(`[StableStudy] 🔄 Filled missing ${tagName} from raw tag ${tagNum}: ${rawTags[tagNum].Value}`);
          }
        }
        
        // ✅ ENHANCED REFERRING PHYSICIAN EXTRACTION: Check multiple sources
        if (!tags.ReferringPhysicianName) {
          console.warn(`[StableStudy] ⚠️ No referring physician found in expanded data, checking raw tags...`);
          
          // Check alternative referring physician tags
          const referringPhysicianTags = [
            "0008,0090", // Standard referring physician (most common)
            "0032,1032", // Requesting physician
            "0008,1048", // Physician(s) of Record
            "0032,1033", // Requesting Service
            "0008,009C", // Consulting Physician's Name
            "0008,1060", // Name of Physician(s) Reading Study
            "0032,1034"  // Requesting Physician Institution
          ];
          
          for (const refTag of referringPhysicianTags) {
            if (rawTags[refTag]?.Value && rawTags[refTag].Value.trim() !== '') {
              tags.ReferringPhysicianName = rawTags[refTag].Value.trim();
              console.log(`[StableStudy] ✅ Found referring physician in tag ${refTag}: ${tags.ReferringPhysicianName}`);
              break;
            }
          }
        }
        
        // ✅ FINAL MODALITY CHECK: If still no modality, try to extract from any available source
        if (!tags.Modality) {
          console.warn(`[StableStudy] ⚠️ Still no modality found, checking all raw tags...`);
          
          // Check common modality locations in raw tags
          const modalityTags = ["0008,0060", "0018,0060", "0008,0070"];
          for (const modalityTag of modalityTags) {
            if (rawTags[modalityTag]?.Value) {
              tags.Modality = rawTags[modalityTag].Value;
              console.log(`[StableStudy] ✅ Found modality in raw tag ${modalityTag}: ${tags.Modality}`);
              break;
            }
          }
        }
        
        console.log(`[StableStudy] ✅ Enhanced metadata with private tags:`);
        console.log(`[StableStudy] 🏥 Private lab tags:`, {
          "0013,0010": tags["0013,0010"] || 'NOT_FOUND',
          "0015,0010": tags["0015,0010"] || 'NOT_FOUND',
          "0021,0010": tags["0021,0010"] || 'NOT_FOUND',
          "0043,0010": tags["0043,0010"] || 'NOT_FOUND'
        });
        console.log(`[StableStudy] 🔬 FINAL Modality after enhancement: ${tags.Modality || 'STILL_UNKNOWN'}`);
        console.log(`[StableStudy] 👨‍⚕️ FINAL Referring Physician: ${tags.ReferringPhysicianName || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 👨‍⚕️ Operator: ${tags.OperatorName || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 🏥 Institution: ${tags.InstitutionName || 'NOT_FOUND'}`);
        console.log(`[StableStudy] 🔬 Body Part: ${tags.BodyPartExamined || 'NOT_FOUND'}`);
        
        // ✅ DEBUG: Show all physician-related tags found
        const physicianTags = {};
        const physicianTagNumbers = ["0008,0090", "0032,1032", "0008,1048", "0008,1070", "0008,009C", "0008,1060"];
        for (const pTag of physicianTagNumbers) {
          if (rawTags[pTag]?.Value) {
            physicianTags[pTag] = rawTags[pTag].Value;
          }
        }
        console.log(`[StableStudy] 👥 All physician tags found:`, physicianTags);
        
        // ✅ DEBUG: Show all equipment/study tags found
        const equipmentTags = {};
        const equipmentTagNumbers = ["0008,0070", "0008,1090", "0008,1010", "0018,1020", "0008,0080"];
        for (const eTag of equipmentTagNumbers) {
          if (rawTags[eTag]?.Value) {
            equipmentTags[eTag] = rawTags[eTag].Value;
          }
        }
        console.log(`[StableStudy] 🏥 All equipment/institution tags found:`, equipmentTags);
        
      } catch (tagsError) {
        console.warn(`[StableStudy] ⚠️ Private tags call failed:`, tagsError.message);
        // Continue without private tags
      }
    }
    
    job.progress = 60;
    
    // ✅ STEP 4: Build series map from expanded instances (FIXED for multi-modality)
    const seriesMap = new Map();
    const modalitiesSet = new Set();

    if (Array.isArray(detailedInstances) && detailedInstances.length > 0 && detailedInstances[0].MainDicomTags) {
      // We have expanded instance data
      console.log(`[StableStudy] 📁 Building series map from expanded instance data...`);
      
      // 🔧 FIX: Track unique series and their modalities
      const seriesModalityMap = new Map();
      
      for (const instance of detailedInstances) {
        const seriesUID = instance.MainDicomTags?.SeriesInstanceUID;
        
        // ✅ FIX: Enhanced modality detection per instance
        const instanceModality = instance.MainDicomTags?.Modality || 
                                 instance.StudyMainDicomTags?.Modality ||
                                 tags.Modality;
        
        if (seriesUID) {
          // Track series and its modality
          if (!seriesModalityMap.has(seriesUID)) {
            seriesModalityMap.set(seriesUID, instanceModality || 'UNKNOWN');
            
            // 🆕 NEW: Only log when we discover a NEW series with its modality
            console.log(`[StableStudy] 🔬 Series ${seriesUID}: Modality = ${instanceModality || 'UNKNOWN'}`);
          }
          
          // Add modality to the set (this will automatically deduplicate)
          if (instanceModality) {
            modalitiesSet.add(instanceModality);
          }
          
          // Build series map
          if (!seriesMap.has(seriesUID)) {
            seriesMap.set(seriesUID, {
              modality: instanceModality || 'UNKNOWN',
              seriesNumber: instance.MainDicomTags?.SeriesNumber,
              seriesDescription: instance.MainDicomTags?.SeriesDescription,
              instanceCount: 0
            });
          }
          seriesMap.get(seriesUID).instanceCount++;
        }
      }
      
      // 🆕 NEW: Log summary of all modalities found
      console.log(`[StableStudy] ✅ Multi-modality detection complete:`);
      console.log(`[StableStudy] 📊 Total series found: ${seriesMap.size}`);
      console.log(`[StableStudy] 🔬 Unique modalities detected: ${Array.from(modalitiesSet).join(', ')}`);
      
      // 🆕 NEW: Log detailed series breakdown
      for (const [seriesUID, seriesInfo] of seriesMap.entries()) {
        console.log(`[StableStudy] 📋 Series: ${seriesUID.substring(0, 20)}... | Modality: ${seriesInfo.modality} | Instances: ${seriesInfo.instanceCount} | Description: ${seriesInfo.seriesDescription || 'N/A'}`);
      }
      
    } else {
      // Fallback: Use study-level series info and try to get modality from each series
      console.log(`[StableStudy] 📁 Using study-level series info with individual series lookup...`);
      
      if (studyInfo.Series && studyInfo.Series.length > 0) {
        for (const seriesId of studyInfo.Series) {
          try {
            // 🔧 FIX: Get modality from each series individually
            const seriesUrl = `${ORTHANC_BASE_URL}/series/${seriesId}`;
            const seriesResponse = await axios.get(seriesUrl, {
                headers: { 'Authorization': orthancAuth },
                timeout: 5000
            });
            
            const seriesData = seriesResponse.data;
            const seriesModality = seriesData.MainDicomTags?.Modality || 'UNKNOWN';
            
            // Add to modalities set
            modalitiesSet.add(seriesModality);
            
            console.log(`[StableStudy] 🔬 Series ${seriesId}: Modality = ${seriesModality}`);
            
            seriesMap.set(seriesId, {
                modality: seriesModality,
                seriesNumber: seriesData.MainDicomTags?.SeriesNumber || 'Unknown',
                seriesDescription: seriesData.MainDicomTags?.SeriesDescription || 'Unknown Series',
                instanceCount: seriesData.Instances?.length || Math.floor(detailedInstances.length / studyInfo.Series.length) // Estimate
            });
            
          } catch (seriesError) {
            console.warn(`[StableStudy] ⚠️ Could not get modality for series ${seriesId}:`, seriesError.message);
            
            // Fallback to study-level modality
            const fallbackModality = tags.Modality || 'UNKNOWN';
            modalitiesSet.add(fallbackModality);
            
            seriesMap.set(seriesId, {
                modality: fallbackModality,
                seriesNumber: 'Unknown',
                seriesDescription: 'Unknown Series',
                instanceCount: Math.floor(detailedInstances.length / studyInfo.Series.length)
            });
          }
        }
        
        console.log(`[StableStudy] ✅ Fallback modality detection complete:`);
        console.log(`[StableStudy] 🔬 Modalities found: ${Array.from(modalitiesSet).join(', ')}`);
      }
    }
    
    // ✅ FINAL FALLBACK: If no modalities found, add UNKNOWN
    if (modalitiesSet.size === 0) {
      modalitiesSet.add('UNKNOWN');
      console.warn(`[StableStudy] ⚠️ No modalities found anywhere, using UNKNOWN`);
    } else {
      console.log(`[StableStudy] ✅ FINAL modalities for study: ${Array.from(modalitiesSet).join(', ')}`);
      console.log(`[StableStudy] 📊 Total unique modalities: ${modalitiesSet.size}`);
    }
    
    // ✅ FIX: ADD MISSING VARIABLE DECLARATIONS
    const actualInstanceCount = detailedInstances.length;
    const actualSeriesCount = seriesMap.size || studyInfo.Series?.length || 0;

    console.log(`[StableStudy] 📊 OPTIMIZED Final counts - Series: ${actualSeriesCount}, Instances: ${actualInstanceCount}, Modalities: ${Array.from(modalitiesSet).join(', ')}`);

    job.progress = 70;
    
    // ✅ STEP 5: Create patient and lab records (existing logic)
    const patientRecord = await findOrCreatePatientFromTags(tags);
    const labRecord = await findOrCreateSourceLab(tags);
    
    console.log(`[StableStudy] 👤 Patient: ${patientRecord.patientNameRaw}`);
    console.log(`[StableStudy] 🏥 Lab: ${labRecord.name}`);
    
    job.progress = 80;
    
    // ✅ STEP 6: Create/update study record (existing logic but with better data)
    let dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID });
    
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
      examDescription: tags.StudyDescription || 'N/A',
      institutionName: tags.InstitutionName || '',
      workflowStatus: actualInstanceCount > 0 ? 'new_study_received' : 'new_metadata_only',
      
      seriesCount: actualSeriesCount,
      instanceCount: actualInstanceCount,
      seriesImages: `${actualSeriesCount}/${actualInstanceCount}`,
      
      patientInfo: {
        patientID: patientRecord.patientID,
        patientName: patientRecord.patientNameRaw,
        gender: patientRecord.gender || tags.PatientSex || '',
        dateOfBirth: tags.PatientBirthDate || ''
      },
      age: patientRecord.age || tags.PatientAge || '',
      gender: patientRecord.gender || tags.PatientSex || '',
      
      referringPhysicianName: tags.ReferringPhysicianName || '',
      physicians: {
        referring: {
          name: tags.ReferringPhysicianName || '',
          email: '',
          mobile: '',
          institution: ''
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

      clinicalHistory: dicomStudyDoc?.clinicalHistory || {
        clinicalHistory: '',
        previousInjury: '',
        previousSurgery: '',
        lastModifiedBy: null,
        lastModifiedAt: null,
        lastModifiedFrom: 'system',
        dataSource: 'dicom_study_primary'
    },
      
      protocolName: tags.ProtocolName || '',
      bodyPartExamined: tags.BodyPartExamined || '',
      contrastBolusAgent: tags.ContrastBolusAgent || '',
      contrastBolusRoute: tags.ContrastBolusRoute || '',
      acquisitionDate: tags.AcquisitionDate || '',
      acquisitionTime: tags.AcquisitionTime || '',
      studyComments: tags.StudyComments || '',
      additionalPatientHistory: tags.AdditionalPatientHistory || '',
      
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
        processingMethod: 'optimized_single_call',
        debugInfo: {
          apiInstancesFound: actualInstanceCount,
          webUIShowsInstances: true,
          apiMethodUsed: 'expanded_instances_optimized',
          customLabIdProvided: !!tags["0011,1010"],
          customLabIdValue: tags["0011,1010"] || null,
          apiCallsUsed: actualInstanceCount > 0 ? 3 : 2, // study + instances + tags (if instances exist)
          processingEfficiency: 'high'
        }
      }
    };
    
    // Around line 920-950, REPLACE the study update logic:

if (dicomStudyDoc) {
    console.log(`[StableStudy] 📝 Updating existing study - preserving clinical history`);
    
    // 🔧 PRESERVE CRITICAL USER DATA
    const preservedFields = {
        // 🆕 NEW: Preserve clinical history (primary goal)
        clinicalHistory: dicomStudyDoc.clinicalHistory,
        legacyClinicalHistoryRef: dicomStudyDoc.legacyClinicalHistoryRef,
        
        // 🔧 PRESERVE OTHER USER DATA
        assignment: dicomStudyDoc.assignment,
        reportInfo: dicomStudyDoc.reportInfo,
        uploadedReports: dicomStudyDoc.uploadedReports,
        doctorReports: dicomStudyDoc.doctorReports,
        discussions: dicomStudyDoc.discussions,
        calculatedTAT: dicomStudyDoc.calculatedTAT,
        timingInfo: dicomStudyDoc.timingInfo,
        workflowStatus: dicomStudyDoc.workflowStatus // Preserve workflow status too
    };
    
    // Update with new DICOM data but preserve critical fields
    Object.assign(dicomStudyDoc, studyData, preservedFields);
    
    dicomStudyDoc.statusHistory.push({
        status: preservedFields.workflowStatus || studyData.workflowStatus,
        changedAt: new Date(),
        note: `OPTIMIZED stable study updated (preserved clinical history): ${actualSeriesCount} series, ${actualInstanceCount} instances. Lab: ${labRecord.name}. API calls: ${studyData.storageInfo.debugInfo.apiCallsUsed}`
    });
    
    console.log(`[StableStudy] ✅ Preserved clinical history: ${dicomStudyDoc.clinicalHistory?.clinicalHistory ? 'HAS_DATA' : 'EMPTY'}`);
} else {
    console.log(`[StableStudy] 🆕 Creating new study with empty clinical history`);
    dicomStudyDoc = new DicomStudy({
        ...studyData,
        statusHistory: [{
            status: studyData.workflowStatus,
            changedAt: new Date(),
            note: `OPTIMIZED stable study created: ${actualSeriesCount} series, ${actualInstanceCount} instances. Lab: ${labRecord.name}. API calls: ${studyData.storageInfo.debugInfo.apiCallsUsed}`
        }]
    });
}
    
    await dicomStudyDoc.save();
    console.log(`[StableStudy] ✅ Study saved with ID: ${dicomStudyDoc._id}`);
    
    // ✅ STEP 7: Queue ZIP creation if study has instances
    if (actualInstanceCount > 0) {
        console.log(`[StableStudy] 📦 Queuing OPTIMIZED ZIP creation for study: ${orthancStudyId}`);
        
        try {
            const zipJob = await CloudflareR2ZipService.addZipJob({
                orthancStudyId: orthancStudyId,
                studyDatabaseId: dicomStudyDoc._id,
                studyInstanceUID: studyInstanceUID,
                instanceCount: actualInstanceCount,
                seriesCount: actualSeriesCount
            });
            
            console.log(`[StableStudy] 📦 ZIP Job ${zipJob.id} queued for study: ${orthancStudyId}`);
        } catch (zipError) {
            console.error(`[StableStudy] ❌ Failed to queue ZIP job:`, zipError.message);
        }
    } else {
        console.log(`[StableStudy] ⚠️ Skipping ZIP creation - no instances found`);
    }
    
    job.progress = 90;
    
    // ✅ STEP 8: Send notification and complete
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
      notificationReason: 'OPTIMIZED stable study processed',
      isCompleteStudy: actualInstanceCount > 0
    };
    
    try {
      await websocketService.notifySimpleNewStudy();
      console.log(`[StableStudy] ✅ Simple notification sent`);
    } catch (wsError) {
      console.warn(`[StableStudy] ⚠️ Notification failed:`, wsError.message);
    }
    
    const result = {
      success: true,
      orthancStudyId: orthancStudyId,
      studyDatabaseId: dicomStudyDoc._id,
      studyInstanceUID: studyInstanceUID,
      seriesCount: actualSeriesCount,
      instanceCount: actualInstanceCount,
      processedAt: new Date(),
      elapsedTime: Date.now() - startTime,
      processingMethod: 'optimized_minimal_calls',
      apiCallsUsed: actualInstanceCount > 0 ? 3 : 2,
      efficiency: 'high',
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
    
    console.log(`[StableStudy] ✅ OPTIMIZED processing completed in ${Date.now() - startTime}ms`);
    console.log(`[StableStudy] 📊 API Efficiency: ${result.apiCallsUsed} total calls vs ${actualInstanceCount + 10}+ in old method`);
    console.log(`[StableStudy] 📋 Series: ${actualSeriesCount}, Instances: ${actualInstanceCount}`);
    
    return result;
    
  } catch (error) {
    const elapsedTime = Date.now() - startTime;
    console.error(`[StableStudy] ❌ OPTIMIZED processing failed after ${elapsedTime}ms:`, error.message);
    console.error(`[StableStudy] ❌ Stack:`, error.stack);
    
    const errorResult = {
      success: false,
      error: error.message,
      elapsedTime: elapsedTime,
      orthancStudyId: orthancStudyId,
      failedAt: new Date(),
      processingMethod: 'optimized_minimal_calls'
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

// 🆕 NEW: Manual ZIP creation endpoint
router.post('/create-zip/:orthancStudyId', async (req, res) => {
    try {
        const { orthancStudyId } = req.params;
        
        console.log(`[Manual ZIP] 📦 Manual ZIP creation requested for: ${orthancStudyId}`);
        
        // Find study in database
        const study = await DicomStudy.findOne({ orthancStudyID: orthancStudyId });
        
        if (!study) {
            return res.status(404).json({
                success: false,
                message: 'Study not found in database'
            });
        }
        
        // Check if ZIP is already being processed or completed
        if (study.preProcessedDownload?.zipStatus === 'processing') {
            return res.json({
                success: false,
                message: 'ZIP creation already in progress',
                status: 'processing',
                jobId: study.preProcessedDownload.zipJobId
            });
        }
        
        if (study.preProcessedDownload?.zipStatus === 'completed' && study.preProcessedDownload?.zipUrl) {
            return res.json({
                success: true,
                message: 'ZIP already exists',
                status: 'completed',
                zipUrl: study.preProcessedDownload.zipUrl,
                zipSizeMB: study.preProcessedDownload.zipSizeMB,
                createdAt: study.preProcessedDownload.zipCreatedAt
            });
        }
        
        // Queue new ZIP creation job
        const zipJob = await CloudflareR2ZipService.addZipJob({
            orthancStudyId: orthancStudyId,
            studyDatabaseId: study._id,
            studyInstanceUID: study.studyInstanceUID,
            instanceCount: study.instanceCount || 0,
            seriesCount: study.seriesCount || 0
        });
        
        res.json({
            success: true,
            message: 'ZIP creation queued',
            jobId: zipJob.id,
            status: 'queued',
            checkStatusUrl: `/orthanc/zip-status/${zipJob.id}`
        });
        
    } catch (error) {
        console.error('[Manual ZIP] ❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to queue ZIP creation',
            error: error.message
        });
    }
});

// 🆕 NEW: ZIP job status endpoint
router.get('/zip-status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const job = CloudflareR2ZipService.getJob(parseInt(jobId));
        
        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'ZIP job not found'
            });
        }
        
        res.json({
            success: true,
            jobId: job.id,
            status: job.status,
            progress: job.progress,
            createdAt: job.createdAt,
            result: job.result,
            error: job.error
        });
        
    } catch (error) {
        console.error('[ZIP Status] ❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get ZIP status',
            error: error.message
        });
    }
});

// 🆕 NEW: Initialize Wasabi bucket on startup
router.get('/init-r2', async (req, res) => {
    try {
        await CloudflareR2ZipService.ensureR2Bucket();
        res.json({
            success: true,
            message: 'R2 bucket initialized successfully'
        });
    } catch (error) {
        console.error('[R2 Init] ❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize R2 bucket',
            error: error.message
        });
    }
});

export default router;