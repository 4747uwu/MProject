import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import mongoose from 'mongoose';
import cookie from 'cookie';
import dotenv from 'dotenv';

dotenv.config();

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'jwtAuthToken';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.adminConnections = new Map();
    this.connectionCount = 0;
    this.studyCache = new Map(); // Cache for fast study lookups
  }

  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/admin',
      perMessageDeflate: false,
      maxPayload: 32 * 1024 * 1024, // 32MB for full study data
      clientTracking: true
    });

    this.wss.on('connection', async (ws, request) => {
      try {
        console.log('🔌 New WebSocket connection attempt...');
        
        // Extract token from cookies
        let token = null;
        if (request.headers.cookie) {
          const cookies = cookie.parse(request.headers.cookie);
          token = cookies[COOKIE_NAME];
        }

        if (!token) {
          console.log('❌ WebSocket connection rejected: No authentication token found');
          ws.close(4001, 'Authentication required');
          return;
        }

        // Verify JWT token
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
          console.error('❌ JWT verification failed:', jwtError.message);
          ws.close(4007, 'Invalid token');
          return;
        }

        // Find user
        const user = await User.findById(decoded.id)
                              .select('-password')
                              .populate({
                                path: 'lab',
                                select: 'name identifier isActive'
                              });

        if (!user || !user.isActive) {
          console.log('❌ WebSocket connection rejected: User not found or inactive');
          ws.close(4002, 'Invalid user');
          return;
        }

        // Check if user is admin
        if (user.role !== 'admin') {
          console.log(`❌ WebSocket connection rejected: User ${user.email} is not admin`);
          ws.close(4003, 'Admin access required');
          return;
        }

        // Generate unique connection ID
        this.connectionCount++;
        const connectionId = `admin_${user._id}_${this.connectionCount}_${Date.now()}`;
        
        // Store connection with enhanced settings
        this.adminConnections.set(connectionId, {
          ws,
          user,
          connectionId,
          connectedAt: new Date(),
          lastPing: new Date(),
          subscribedToStudies: true,
          subscribedToLiveData: false,
          subscribedToFullStudyStream: false, // 🆕 NEW: Full study streaming
          isAlive: true,
          lastDataSent: null,
          filters: {
            category: 'all',
            location: 'all',
            modality: 'all',
            dateRange: 'week',
            includeCompletedStudies: false,
            maxStudiesPerBatch: 50
          },
          preferences: {
            sendFullStudyData: true,
            includePatientInfo: true,
            includeDicomMetadata: true,
            compressData: false
          }
        });

        console.log(`✅ Admin WebSocket connected: ${user.fullName || user.email} (${connectionId})`);

        // Set up connection handlers
        ws.isAlive = true;
        
        // Handle pong responses
        ws.on('pong', () => {
          ws.isAlive = true;
          const connection = this.adminConnections.get(connectionId);
          if (connection) {
            connection.lastPing = new Date();
            connection.isAlive = true;
          }
        });

        // Send connection confirmation with capabilities
        ws.send(JSON.stringify({
          type: 'connection_established',
          message: 'Connected to admin notifications with live study streaming',
          userId: user._id,
          connectionId,
          userInfo: {
            name: user.fullName || user.email,
            role: user.role
          },
          capabilities: {
            liveStudyStreaming: true,
            fullStudyData: true,
            realTimeNotifications: true,
            batchUpdates: true
          },
          timestamp: new Date()
        }));

        // Handle client messages
        ws.on('message', (data) => {
          try {
            const connection = this.adminConnections.get(connectionId);
            if (connection) {
              connection.lastPing = new Date();
              connection.isAlive = true;
            }
            
            const message = JSON.parse(data);
            this.handleClientMessage(connectionId, message);
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
          }
        });

        // Handle disconnection
        ws.on('close', (code, reason) => {
          console.log(`❌ Admin WebSocket disconnected: ${user.fullName || user.email} (Code: ${code}, Reason: ${reason})`);
          this.adminConnections.delete(connectionId);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.adminConnections.delete(connectionId);
        });

        // 🆕 NEW: Send current studies immediately
        await this.sendCurrentStudies(connectionId);

      } catch (error) {
        console.error('❌ WebSocket connection error:', error);
        ws.close(4004, 'Connection failed');
      }
    });

    // Start heartbeat
    this.startHeartbeat();

    console.log('🔌 WebSocket server initialized with live study streaming');
  }

  async handleClientMessage(connectionId, message) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'ping':
      case 'heartbeat':
        connection.lastPing = new Date();
        connection.isAlive = true;
        connection.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date()
        }));
        break;
      
      // 🆕 NEW: Subscribe to full study streaming
      case 'subscribe_to_full_study_stream':
        connection.subscribedToFullStudyStream = true;
        if (message.filters) {
          connection.filters = { ...connection.filters, ...message.filters };
        }
        if (message.preferences) {
          connection.preferences = { ...connection.preferences, ...message.preferences };
        }
        
        // Send immediate acknowledgment with current data
        await this.sendFullStudyDataSnapshot(connectionId);
        
        connection.ws.send(JSON.stringify({
          type: 'subscribed_to_full_study_stream',
          message: 'Subscribed to real-time full study data stream',
          timestamp: new Date(),
          filters: connection.filters,
          preferences: connection.preferences
        }));
        console.log(`📡 Admin ${connection.user.fullName || connection.user.email} subscribed to full study stream`);
        break;

      case 'subscribe_to_studies':
        connection.subscribedToStudies = true;
        connection.ws.send(JSON.stringify({
          type: 'subscribed_to_studies',
          message: 'Subscribed to study notifications',
          timestamp: new Date()
        }));
        break;

      case 'update_stream_filters':
        if (message.filters) {
          connection.filters = { ...connection.filters, ...message.filters };
          // Immediately send filtered data
          await this.sendFilteredStudyData(connectionId);
        }
        break;

      case 'update_stream_preferences':
        if (message.preferences) {
          connection.preferences = { ...connection.preferences, ...message.preferences };
        }
        break;

      case 'request_study_details':
        if (message.studyId) {
          await this.sendStudyDetails(connectionId, message.studyId);
        }
        break;

      case 'request_full_refresh':
        await this.sendFullStudyDataSnapshot(connectionId);
        break;
      
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  // 🆕 NEW: Send current studies immediately on connection
  async sendCurrentStudies(connectionId) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    try {
      console.log(`📡 WebSocket: Sending current studies to ${connection.user.email}`);
      
      // 🔧 FIXED: Use more inclusive filters for initial load
      const inclusiveFilters = {
        ...connection.filters,
        category: 'all', // 🔧 Always start with all studies
        dateRange: 'week', // 🔧 Get last week's data
        includeCompletedStudies: true,
        maxStudiesPerBatch: 100
      };
      
      const studies = await this.fetchFullStudyData(inclusiveFilters, connection.preferences);
      
      connection.ws.send(JSON.stringify({
        type: 'current_studies_snapshot',
        data: studies,
        timestamp: new Date(),
        connectionId: connectionId,
        message: `Loaded ${studies.data.length} studies`
      }));
      
      console.log(`✅ WebSocket: Sent ${studies.data.length} studies to ${connection.user.email}`);
    } catch (error) {
      console.error('❌ WebSocket: Error sending current studies:', error);
      
      // Send error message to client
      connection.ws.send(JSON.stringify({
        type: 'error',
        message: 'Failed to load studies',
        error: error.message,
        timestamp: new Date()
      }));
    }
  }

  // 🆕 NEW: Send full study data snapshot
  async sendFullStudyDataSnapshot(connectionId) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    try {
      const studies = await this.fetchFullStudyData(connection.filters, connection.preferences);
      
      connection.ws.send(JSON.stringify({
        type: 'full_study_data_snapshot',
        data: studies,
        timestamp: new Date(),
        filters: connection.filters,
        preferences: connection.preferences
      }));
      
      connection.lastDataSent = Date.now();
      console.log(`📡 Sent full study data snapshot to ${connection.user.email}`);
    } catch (error) {
      console.error('Error sending full study data snapshot:', error);
    }
  }

  // 🆕 NEW: Send filtered study data
  async sendFilteredStudyData(connectionId) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    try {
      const studies = await this.fetchFullStudyData(connection.filters, connection.preferences);
      
      connection.ws.send(JSON.stringify({
        type: 'filtered_study_data',
        data: studies,
        timestamp: new Date(),
        appliedFilters: connection.filters
      }));
      
      console.log(`🔍 Sent filtered study data to ${connection.user.email}`);
    } catch (error) {
      console.error('Error sending filtered study data:', error);
    }
  }

  // 🆕 NEW: Send individual study details
  async sendStudyDetails(connectionId, studyId) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    try {
      const study = await DicomStudy.findById(studyId)
        .populate('patient')
        .populate('sourceLab')
        .populate({
          path: 'lastAssignedDoctor',
          populate: {
            path: 'userAccount',
            select: 'fullName email'
          }
        })
        .lean();

      if (study) {
        const formattedStudy = this.formatStudyForTransmission(study, connection.preferences);
        
        connection.ws.send(JSON.stringify({
          type: 'study_details',
          data: formattedStudy,
          studyId: studyId,
          timestamp: new Date()
        }));
        
        console.log(`📋 Sent study details for ${studyId} to ${connection.user.email}`);
      }
    } catch (error) {
      console.error('Error sending study details:', error);
    }
  }

  // 🔧 FIXED: Enhanced study data fetching with proper aggregation
  async fetchFullStudyData(filters = {}, preferences = {}) {
    try {
      const { 
        category = 'all', 
        location = 'all',
        modality = 'all',
        dateRange = 'today',
        includeCompletedStudies = true, // 🔧 CHANGED: Include completed by default
        maxStudiesPerBatch = 100 // 🔧 INCREASED: Get more studies
      } = filters;

      // 🔧 ENHANCED: Build aggregation pipeline for better performance
      const pipeline = [];

      // Stage 1: Match conditions
      const matchConditions = {};
      
      // Category filter with proper status mapping
      if (category !== 'all') {
        const statusMap = {
          pending: ['new_study_received', 'study_needs_review', 'pending_assignment'],
          inprogress: ['assigned_to_doctor', 'report_in_progress', 'doctor_opened_report'],
          completed: ['report_finalized', 'final_report_downloaded', 'report_downloaded']
        };
        
        if (statusMap[category]) {
          matchConditions.workflowStatus = { $in: statusMap[category] };
        }
      }

      // Date range filter - be more inclusive
      if (dateRange !== 'all') {
        const now = new Date();
        let startDate;
        
        switch (dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            // For 'today' and others, get last 24 hours to be safe
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        
        if (startDate) {
          matchConditions.createdAt = { $gte: startDate };
        }
      }

      // Location filter
      if (location !== 'all') {
        matchConditions['sourceLab'] = new mongoose.Types.ObjectId(location);
      }

      // Modality filter
      if (modality !== 'all') {
        matchConditions.$or = [
          { modality: modality },
          { modalitiesInStudy: { $in: [modality] } }
        ];
      }

      // Add match stage
      pipeline.push({ $match: matchConditions });

      // Stage 2: Lookup related data
      pipeline.push(
        {
          $lookup: {
            from: 'patients',
            localField: 'patient',
            foreignField: '_id',
            as: 'patient',
            pipeline: [{
              $project: {
                patientID: 1,
                patientNameRaw: 1,
                gender: 1,
                dateOfBirth: 1,
                ageString: 1,
                computed: 1
              }
            }]
          }
        },
        {
          $lookup: {
            from: 'labs',
            localField: 'sourceLab',
            foreignField: '_id',
            as: 'sourceLab',
            pipeline: [{
              $project: {
                name: 1,
                identifier: 1,
                contactInfo: 1
              }
            }]
          }
        },
        {
          $lookup: {
            from: 'doctors',
            localField: 'lastAssignedDoctor',
            foreignField: '_id',
            as: 'lastAssignedDoctor',
            pipeline: [{
              $lookup: {
                from: 'users',
                localField: 'userAccount',
                foreignField: '_id',
                as: 'userAccount',
                pipeline: [{
                  $project: {
                    fullName: 1,
                    email: 1
                  }
                }]
              }
            }, {
              $project: {
                specialization: 1,
                userAccount: { $arrayElemAt: ['$userAccount', 0] }
              }
            }]
          }
        }
      );

      // Stage 3: Project fields
      pipeline.push({
        $project: {
          _id: 1,
          studyInstanceUID: 1,
          orthancStudyID: 1,
          accessionNumber: 1,
          patientId: 1,
          studyDate: 1,
          studyTime: 1,
          modality: 1,
          modalitiesInStudy: 1,
          workflowStatus: 1,
          caseType: 1,
          examDescription: 1,
          studyDescription: 1,
          seriesCount: 1,
          instanceCount: 1,
          createdAt: 1,
          reportFinalizedAt: 1,
          uploadedReportsData: 1,
          
          // Populated data
          patient: { $arrayElemAt: ['$patient', 0] },
          sourceLab: { $arrayElemAt: ['$sourceLab', 0] },
          lastAssignedDoctor: { $arrayElemAt: ['$lastAssignedDoctor', 0] }
        }
      });

      // Stage 4: Sort and limit
      pipeline.push(
        { $sort: { createdAt: -1 } },
        { $limit: maxStudiesPerBatch }
      );

      // Execute aggregation
      console.log('🔍 WebSocket: Executing study aggregation with conditions:', JSON.stringify(matchConditions, null, 2));
      
      const [studies, totalCount] = await Promise.all([
        DicomStudy.aggregate(pipeline).allowDiskUse(true),
        DicomStudy.countDocuments(matchConditions)
      ]);

      console.log(`📊 WebSocket: Found ${studies.length} studies out of ${totalCount} total`);
      
      // Format studies for transmission
      const formattedStudies = studies.map(study => 
        this.formatStudyForTransmission(study, preferences)
      );

      // Get category counts
      const categoryCounts = await this.getCategoryCounts();

      const result = {
        success: true,
        data: formattedStudies,
        totalRecords: totalCount,
        totalPages: Math.ceil(totalCount / maxStudiesPerBatch),
        summary: {
          byCategory: categoryCounts,
          totalShown: formattedStudies.length,
          hasMore: totalCount > maxStudiesPerBatch
        },
        filters: filters,
        fetchedAt: new Date()
      };

      console.log(`✅ WebSocket: Returning ${result.data.length} formatted studies`);
      return result;

    } catch (error) {
      console.error('❌ WebSocket: Error fetching full study data:', error);
      throw error;
    }
  }

  // 🔧 ENHANCED: Format study for transmission with proper field mapping
  formatStudyForTransmission(study, preferences = {}) {
    const {
      includePatientInfo = true,
      includeDicomMetadata = false,
      includeFullHistory = false
    } = preferences;

    // 🔧 CRITICAL: Ensure proper data extraction
    const patient = study.patient || {};
    const sourceLab = study.sourceLab || {};
    const assignedDoctor = study.lastAssignedDoctor || {};

    const formattedStudy = {
      _id: study._id,
      studyInstanceUID: study.studyInstanceUID,
      orthancStudyID: study.orthancStudyID,
      accessionNumber: study.accessionNumber || 'N/A',
      
      // 🔧 FIXED: Patient ID mapping
      patientId: study.patientId || patient.patientID || 'N/A',
      
      // 🔧 FIXED: Patient name mapping
      patientName: patient.patientNameRaw || 
                   (patient.computed?.fullName) || 
                   'Unknown Patient',
      
      // 🔧 FIXED: Age/Gender formatting
      ageGender: patient.ageString && patient.gender ? 
                 `${patient.ageString}/${patient.gender}` : 
                 `${patient.ageString || 'N/A'}/${patient.gender || 'U'}`,
      
      // 🔧 FIXED: Modality handling
      modality: Array.isArray(study.modalitiesInStudy) && study.modalitiesInStudy.length > 0 ? 
                study.modalitiesInStudy.join(', ') : 
                (study.modality || 'N/A'),
      
      // 🔧 FIXED: Description mapping
      description: study.examDescription || 
                   study.studyDescription || 
                   'No Description',
      
      // 🔧 FIXED: Series/Instance formatting
      seriesImages: study.seriesCount && study.instanceCount ? 
                    `${study.seriesCount}/${study.instanceCount}` : 
                    '1/1',
      
      // Dates and times
      studyDate: study.studyDate,
      studyTime: study.studyTime,
      studyDateTime: study.studyDate && study.studyTime ? 
                     `${study.studyDate} ${study.studyTime}` : 
                     study.studyDate,
      uploadDateTime: study.createdAt,
      reportedDateTime: study.reportFinalizedAt,
      
      // Status and workflow
      workflowStatus: study.workflowStatus || 'new_study_received',
      
      // 🔧 FIXED: Priority mapping
      priority: study.caseType || 'ROUTINE',
      caseType: study.caseType || 'ROUTINE',
      
      // 🔧 FIXED: Location mapping
      location: sourceLab.name || 'Unknown Location',
      labIdentifier: sourceLab.identifier || 'Unknown',
      
      // 🔧 ENHANCED: Current category calculation
      currentCategory: this.calculateStudyCategory(study.workflowStatus),
      
      // Counts
      seriesCount: study.seriesCount || 0,
      instanceCount: study.instanceCount || 0,
      
      // 🔧 FIXED: Report status
      ReportAvailable: study.uploadedReportsData && 
                       Array.isArray(study.uploadedReportsData) && 
                       study.uploadedReportsData.length > 0,
      
      uploadedReportsCount: study.uploadedReportsData ? 
                            study.uploadedReportsData.length : 0
    };

    // Include patient info if requested
    if (includePatientInfo && patient) {
      formattedStudy.patient = {
        name: patient.patientNameRaw || 'Unknown',
        id: patient.patientID || 'Unknown',
        gender: patient.gender || 'U',
        dateOfBirth: patient.dateOfBirth,
        ageString: patient.ageString,
        fullName: patient.computed?.fullName
      };
    }

    // Include assigned doctor info
    if (assignedDoctor && assignedDoctor.userAccount) {
      formattedStudy.assignedDoctor = {
        name: assignedDoctor.userAccount.fullName || 'Unknown',
        email: assignedDoctor.userAccount.email,
        specialization: assignedDoctor.specialization
      };
      formattedStudy.seenBy = assignedDoctor.userAccount.fullName || 'Not Assigned';
      formattedStudy.reportedBy = assignedDoctor.userAccount.fullName || 'N/A';
    } else {
      formattedStudy.seenBy = 'Not Assigned';
      formattedStudy.reportedBy = 'N/A';
    }

    // 🔧 FIXED: Instance ID for OHIF viewer
    formattedStudy.instanceID = study.studyInstanceUID;

    return formattedStudy;
  }

  // 🔧 NEW: Helper method to calculate study category
  calculateStudyCategory(workflowStatus) {
    if (!workflowStatus) return 'pending';
    
    const categoryMap = {
      'new_study_received': 'pending',
      'study_needs_review': 'pending', 
      'pending_assignment': 'pending',
      'assigned_to_doctor': 'inprogress',
      'report_in_progress': 'inprogress',
      'doctor_opened_report': 'inprogress',
      'report_finalized': 'completed',
      'final_report_downloaded': 'completed',
      'report_downloaded': 'completed'
    };
    
    return categoryMap[workflowStatus] || 'pending';
  }

  // 🆕 NEW: Get category counts efficiently
  async getCategoryCounts() {
    try {
      const categoryCounts = await DicomStudy.aggregate([
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $in: ['$workflowStatus', ['new_study_received', 'study_needs_review']] }, then: 'pending' },
                  { case: { $in: ['$workflowStatus', ['assigned_to_doctor', 'report_in_progress']] }, then: 'inprogress' },
                  { case: { $in: ['$workflowStatus', ['report_finalized', 'final_report_downloaded']] }, then: 'completed' }
                ],
                default: 'other'
              }
            },
            count: { $sum: 1 }
          }
        }
      ]);

      const total = categoryCounts.reduce((sum, item) => sum + item.count, 0);

      return {
        all: total,
        pending: categoryCounts.find(c => c._id === 'pending')?.count || 0,
        inprogress: categoryCounts.find(c => c._id === 'inprogress')?.count || 0,
        completed: categoryCounts.find(c => c._id === 'completed')?.count || 0
      };
    } catch (error) {
      console.error('Error getting category counts:', error);
      return { all: 0, pending: 0, inprogress: 0, completed: 0 };
    }
  }

  // 🆕 ENHANCED: Real-time study notification with full data
  async notifyNewStudyWithFullData(studyData) {
    // First, get the full study from database
    try {
      const fullStudy = await DicomStudy.findById(studyData._id)
        .populate('patient')
        .populate('sourceLab')
        .populate({
          path: 'lastAssignedDoctor',
          populate: {
            path: 'userAccount',
            select: 'fullName email'
          }
        })
        .lean();

      if (!fullStudy) {
        console.error('Study not found for notification:', studyData._id);
        return;
      }

      // Send notifications to all connected admins
      let notificationsSent = 0;
      let fullDataSent = 0;

      this.adminConnections.forEach((connection, connectionId) => {
        if (connection.ws.readyState === connection.ws.OPEN) {
          
          // Send basic notification
          if (connection.subscribedToStudies) {
            try {
              connection.ws.send(JSON.stringify({
                type: 'new_study_notification',
                timestamp: new Date(),
                data: {
                  studyId: studyData._id,
                  patientName: studyData.patientName,
                  patientId: studyData.patientId,
                  modality: studyData.modality,
                  location: studyData.location,
                  studyDate: studyData.studyDate,
                  workflowStatus: studyData.workflowStatus,
                  priority: studyData.priority,
                  accessionNumber: studyData.accessionNumber,
                  seriesImages: studyData.seriesImages || '1/1'
                }
              }));
              notificationsSent++;
            } catch (error) {
              console.error(`Error sending notification to ${connectionId}:`, error);
            }
          }

          // Send full study data if subscribed to stream
          if (connection.subscribedToFullStudyStream) {
            try {
              const formattedStudy = this.formatStudyForTransmission(fullStudy, connection.preferences);
              
              connection.ws.send(JSON.stringify({
                type: 'new_study_full_data',
                timestamp: new Date(),
                data: formattedStudy,
                streamUpdate: true
              }));
              fullDataSent++;
            } catch (error) {
              console.error(`Error sending full study data to ${connectionId}:`, error);
            }
          }
        }
      });

      console.log(`📢 New study notifications: ${notificationsSent} basic, ${fullDataSent} full data - ${studyData.patientName}`);

    } catch (error) {
      console.error('Error in notifyNewStudyWithFullData:', error);
    }
  }

  startHeartbeat() {
    const interval = setInterval(() => {
      this.adminConnections.forEach((connection, connectionId) => {
        if (connection.ws.readyState === connection.ws.OPEN) {
          if (connection.isAlive === false) {
            console.log(`Terminating unresponsive connection: ${connectionId}`);
            connection.ws.terminate();
            this.adminConnections.delete(connectionId);
            return;
          }

          connection.isAlive = false;
          connection.ws.ping();
        } else {
          this.adminConnections.delete(connectionId);
        }
      });
    }, 30000); // Every 30 seconds

    return interval;
  }

  // Get connection stats
  getStats() {
    return {
      totalConnections: this.adminConnections.size,
      activeConnections: Array.from(this.adminConnections.values()).filter(
        conn => conn.ws.readyState === conn.ws.OPEN
      ).length,
      subscribedToStudies: Array.from(this.adminConnections.values()).filter(
        conn => conn.subscribedToStudies && conn.ws.readyState === conn.ws.OPEN
      ).length,
      subscribedToFullStream: Array.from(this.adminConnections.values()).filter(
        conn => conn.subscribedToFullStudyStream && conn.ws.readyState === conn.ws.OPEN
      ).length
    };
  }
}

// Export singleton instance
export default new WebSocketService();