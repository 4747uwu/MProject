import express from 'express';
import axios from 'axios';
import fs from 'fs/promises'; 
import path from 'path';
import mongoose from 'mongoose';
import Redis from 'ioredis';

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

// --- Simple Redis Setup (without Bull queue) ---
const REDIS_URL = 'rediss://default:ATDmAAIjcDFlY2U3MzZmZjIxNDQ0YmZmYmY0NmVlZTBhMjgwOTkyYnAxMA@just-pug-12518.upstash.io:6379';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  tls: {},
  lazyConnect: true,
});

// --- Simple In-Memory Queue ---
class SimpleJobQueue {
  constructor() {
    this.jobs = new Map();
    this.processing = new Set();
    this.nextJobId = 1;
    this.isProcessing = false;
    this.concurrency = 3; // Process max 3 jobs simultaneously
  }

  async add(jobType, data) {
    const jobId = this.nextJobId++;
    const job = {
      id: jobId,
      type: jobType,
      data: data,
      status: 'waiting',
      createdAt: new Date(),
      progress: 0,
      result: null,
      error: null
    };
    
    this.jobs.set(jobId, job);
    console.log(`📝 Job ${jobId} added to queue`);
    
    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return job;
  }

  async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    console.log('🚀 Queue processor started');
    
    while (this.getWaitingJobs().length > 0 || this.processing.size > 0) {
      // Process jobs up to concurrency limit
      while (this.processing.size < this.concurrency && this.getWaitingJobs().length > 0) {
        const waitingJobs = this.getWaitingJobs();
        if (waitingJobs.length > 0) {
          const job = waitingJobs[0];
          this.processJob(job);
        }
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isProcessing = false;
    console.log('⏹️ Queue processor stopped');
  }

  async processJob(job) {
    this.processing.add(job.id);
    job.status = 'active';
    
    console.log(`🚀 Job ${job.id} started processing`);
    
    try {
      if (job.type === 'process-dicom-instance') {
        job.result = await this.processDicomInstance(job);
        job.status = 'completed';
        console.log(`✅ Job ${job.id} completed successfully`);
      } else if (job.type === 'test-connection') {
        job.result = { success: true, processedAt: new Date() };
        job.status = 'completed';
        console.log(`✅ Test job ${job.id} completed`);
      }
      
    } catch (error) {
      job.error = error.message;
      job.status = 'failed';
      console.error(`❌ Job ${job.id} failed:`, error.message);
    } finally {
      this.processing.delete(job.id);
    }
  }

  async processDicomInstance(job) {
    const { orthancInstanceId, requestId } = job.data;
    const startTime = Date.now();
    
    try {
      console.log(`[Queue Worker] 🚀 Starting job ${job.id} for instance: ${orthancInstanceId}`);
      
      job.progress = 10;
      
      // Add timeout for Orthanc request
      const metadataUrl = `${ORTHANC_BASE_URL}/instances/${orthancInstanceId}/simplified-tags`;
      console.log(`[Queue Worker] 🌐 Fetching from: ${metadataUrl}`);
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Orthanc request timeout after 8 seconds')), 8000);
      });
      
      const fetchPromise = axios.get(metadataUrl, { 
        headers: { 'Authorization': orthancAuth },
        timeout: 7000
      });
      
      const metadataResponse = await Promise.race([fetchPromise, timeoutPromise]);
      
      const elapsedTime = Date.now() - startTime;
      console.log(`[Queue Worker] ✅ Metadata fetched in ${elapsedTime}ms`);
      
      job.progress = 30;
      
      const instanceTags = metadataResponse.data;
      const sopInstanceUID = instanceTags.SOPInstanceUID;
      const studyInstanceUID = instanceTags.StudyInstanceUID;

      if (!studyInstanceUID) {
        throw new Error('StudyInstanceUID is missing from instance metadata.');
      }

      const orthancStudyID = `DERIVED_${studyInstanceUID.replace(/\./g, '_')}`;
      
      job.progress = 50;
      
      // Database operations
      const patientRecord = await findOrCreatePatientFromTags(instanceTags);
      const labRecord = await findOrCreateSourceLab();
      
      job.progress = 70;
      
      // Simplified database update (without transactions for now)
      let dicomStudyDoc = await DicomStudy.findOne({ studyInstanceUID: studyInstanceUID });

      const modalitiesInStudySet = new Set(dicomStudyDoc?.modalitiesInStudy || []);
      if(instanceTags.Modality) modalitiesInStudySet.add(instanceTags.Modality);

      if (dicomStudyDoc) {
        console.log(`[Queue Worker] Updating existing study: ${studyInstanceUID}`);
        
        if (!dicomStudyDoc.orthancStudyID) {
          dicomStudyDoc.orthancStudyID = orthancStudyID;
        }
        
        dicomStudyDoc.patient = patientRecord._id;
        dicomStudyDoc.sourceLab = labRecord._id;
        dicomStudyDoc.modalitiesInStudy = Array.from(modalitiesInStudySet);
        dicomStudyDoc.accessionNumber = dicomStudyDoc.accessionNumber || instanceTags.AccessionNumber;
        dicomStudyDoc.studyDate = dicomStudyDoc.studyDate || instanceTags.StudyDate;
        dicomStudyDoc.studyTime = dicomStudyDoc.studyTime || instanceTags.StudyTime;
        dicomStudyDoc.examDescription = dicomStudyDoc.examDescription || instanceTags.StudyDescription;
        
        if (dicomStudyDoc.workflowStatus === 'no_active_study') {
          dicomStudyDoc.workflowStatus = 'new_study_received';
        }
        
        dicomStudyDoc.statusHistory.push({
          status: 'new_study_received',
          changedAt: new Date(),
          note: `Instance ${sopInstanceUID} processed asynchronously (Job ${job.id}).`
        });
      } else {
        console.log(`[Queue Worker] Creating new study: ${studyInstanceUID}`);
        
        dicomStudyDoc = new DicomStudy({
          orthancStudyID: orthancStudyID,
          studyInstanceUID: studyInstanceUID,
          accessionNumber: instanceTags.AccessionNumber || '',
          patient: patientRecord._id,
          sourceLab: labRecord._id,
          studyDate: instanceTags.StudyDate || '',
          studyTime: instanceTags.StudyTime || '',
          modalitiesInStudy: Array.from(modalitiesInStudySet),
          examDescription: instanceTags.StudyDescription || '',
          workflowStatus: 'new_study_received',
          statusHistory: [{
            status: 'new_study_received',
            changedAt: new Date(),
            note: `First instance ${sopInstanceUID} for new study processed asynchronously (Job ${job.id}).`
          }],
        });
      }
      
      await dicomStudyDoc.save();
      
      job.progress = 100;
      
      // Store result in Redis
      const result = {
        success: true,
        orthancInstanceId: orthancInstanceId,
        studyDatabaseId: dicomStudyDoc._id,
        patientId: patientRecord._id,
        sopInstanceUID: sopInstanceUID,
        studyInstanceUID: studyInstanceUID,
        processedAt: new Date(),
        elapsedTime: Date.now() - startTime,
        metadataSummary: {
          patientName: patientRecord.patientNameRaw,
          patientId: patientRecord.patientID,
          modality: instanceTags.Modality || 'Unknown',
          studyDate: instanceTags.StudyDate || 'Unknown'
        }
      };
      
      // Store result for 1 hour
      await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(result));
      
      console.log(`[Queue Worker] Successfully processed job ${job.id} for study: ${studyInstanceUID}`);
      return result;
      
    } catch (error) {
      const elapsedTime = Date.now() - startTime;
      console.error(`[Queue Worker] ❌ Job ${job.id} failed after ${elapsedTime}ms:`, error.message);
      
      const errorResult = {
        success: false,
        error: error.message,
        elapsedTime: elapsedTime,
        orthancInstanceId: orthancInstanceId,
        failedAt: new Date()
      };
      
      await redis.setex(`job:result:${requestId}`, 3600, JSON.stringify(errorResult));
      throw error;
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

// Create the simple queue instance
const jobQueue = new SimpleJobQueue();

// Redis connection listeners
redis.on('connect', () => {
  console.log('✅ Redis connected successfully to Upstash');
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
    console.log('✅ Redis ping successful - connection working');
    return redis.set('startup-test', 'hello-world');
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
router.get('/test-connection', async (req, res) => {
  try {
    // Test Redis
    await redis.set('test-key', `test-${Date.now()}`);
    const redisResult = await redis.get('test-key');
    await redis.del('test-key');
    
    // Test queue
    const testJob = await jobQueue.add('test-connection', {
      message: 'connection test',
      timestamp: new Date()
    });
    
    res.json({
      redis: 'working',
      redisValue: redisResult,
      queue: 'working', 
      testJobId: testJob.id,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Connection test failed:', error);
    res.status(500).json({
      error: error.message
    });
  }
});

// --- ASYNC ROUTE ---
router.post('/new-dicom', async (req, res) => {
  const routeName = '/new-dicom';
  console.log(`[NodeApp ${routeName}] Received async request. Body:`, req.body);

  let receivedOrthancInstanceId = null;

  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    if (req.body.ID) {
        receivedOrthancInstanceId = req.body.ID;
    } else if (req.body.instanceId) {
        receivedOrthancInstanceId = req.body.instanceId;
    } else {
        const keys = Object.keys(req.body);
        if (keys.length > 0) {
            receivedOrthancInstanceId = keys[0];
        }
    }
  }

  if (!receivedOrthancInstanceId || typeof receivedOrthancInstanceId !== 'string' || receivedOrthancInstanceId.trim() === '') {
    return res.status(400).json({ 
      error: 'Invalid or empty Orthanc Instance ID',
      receivedBody: req.body 
    });
  }

  const orthancInstanceId = receivedOrthancInstanceId.trim();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // Add job to simple queue
    const job = await jobQueue.add('process-dicom-instance', {
      orthancInstanceId: orthancInstanceId,
      requestId: requestId,
      submittedAt: new Date()
    });

    console.log(`[NodeApp ${routeName}] ✅ Job ${job.id} queued for instance: ${orthancInstanceId}`);

    // Immediate response
    res.status(202).json({
      message: 'DICOM instance queued for asynchronous processing',
      jobId: job.id,
      requestId: requestId,
      orthancInstanceId: orthancInstanceId,
      status: 'queued',
      estimatedProcessingTime: '5-30 seconds',
      checkStatusUrl: `/orthanc/job-status/${requestId}`
    });

  } catch (error) {
    console.error(`[NodeApp ${routeName}] ❌ Error queuing job:`, error);
    res.status(500).json({
      message: 'Error queuing DICOM instance for processing',
      error: error.message,
      orthancInstanceId: orthancInstanceId
    });
  }
});

// --- Job Status Route ---
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

// --- Keep all your existing helper functions ---
async function findOrCreatePatientFromTags(instanceTags) {
  const patientIdDicom = instanceTags.PatientID;
  const patientNameDicomObj = instanceTags.PatientName;
  let patientNameString = 'Unknown Patient';
  if (patientNameDicomObj && typeof patientNameDicomObj === 'object' && patientNameDicomObj.Alphabetic) {
    patientNameString = patientNameDicomObj.Alphabetic.replace(/\^/g, ' ');
  } else if (typeof patientNameDicomObj === 'string') {
    patientNameString = patientNameDicomObj;
  }

  const patientSex = instanceTags.PatientSex;
  const patientBirthDate = instanceTags.PatientBirthDate;

  if (!patientIdDicom && !patientNameString) {
    let unknownPatient = await Patient.findOne({ mrn: 'UNKNOWN_HTTP_PULL' });
    if (!unknownPatient) {
        unknownPatient = await Patient.create({
            mrn: 'UNKNOWN_HTTP_PULL',
            patientID: new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase(),
            patientNameRaw: 'Unknown Patient (HTTP Pull)',
            gender: patientSex || '',
            dateOfBirth: patientBirthDate || '',
            isAnonymous: true
        });
    }
    return unknownPatient;
  }

  let patient = await Patient.findOne({ mrn: patientIdDicom });

  if (!patient) {
    const generatedPatientID = new mongoose.Types.ObjectId().toString().slice(0,8).toUpperCase();
    
    patient = new Patient({
      mrn: patientIdDicom || `ANON_${Date.now()}`,
      patientID: generatedPatientID,
      patientNameRaw: patientNameString,
      gender: patientSex || '',
      dateOfBirth: patientBirthDate ? formatDicomDateToISO(patientBirthDate) : ''
    });
    
    await patient.save();
  }
  return patient;
}

function formatDicomDateToISO(dicomDate) {
  if (!dicomDate || typeof dicomDate !== 'string' || dicomDate.length !== 8) return '';
  try {
    const year = dicomDate.substring(0, 4);
    const month = dicomDate.substring(4, 6);
    const day = dicomDate.substring(6, 8);
    return `${year}-${month}-${day}`;
  } catch {
    return '';
  }
}

async function findOrCreateSourceLab() {
  const labIdentifier = 'ORTHANC_HTTP_SOURCE';
  let lab = await Lab.findOne({ identifier: labIdentifier });
  if (!lab) {
    lab = new Lab({
      name: 'Primary Orthanc Instance (HTTP Source)',
      identifier: labIdentifier,
      isActive: true,
    });
    await lab.save();
  }
  return lab;
}

export default router;