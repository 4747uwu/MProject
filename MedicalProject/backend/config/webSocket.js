import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import DicomStudy from '../models/dicomStudyModel.js';
import cookie from 'cookie';
import dotenv from 'dotenv';
import url from "url";

dotenv.config();

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'jwtAuthToken';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.adminConnections = new Map();
    this.connectionCount = 0;
    this.lastDataSnapshot = null;
    this.dataUpdateInterval = null;
  }

  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      // path: '/ws/admin',
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024, // 16MB
      clientTracking: true
    });

    this.wss.on('connection', async (ws, request) => {
      try {
        console.log('🔌 New WebSocket connection attempt...');
        // console.log(request.headers);
        
        // Extract token from cookies
        let token = null;
        
        // if (request.headers.cookie) {
        //   const cookies = cookie.parse(request.headers.cookie);
        //   token = cookies[COOKIE_NAME];
        // }
        console.log(request.url);
        if (!token) {
          const parsedUrl = url.parse(request.url, true);
          token = parsedUrl.query.token;
          console.log(parsedUrl);
          console.log('🔑 Extracted token:', token ? 'Present' : 'Not found');
        }

        // if (!token) {
        //   console.log('❌ WebSocket connection rejected: No authentication token found');
        //   ws.close(4001, 'Authentication required');
        //   return;
        // }

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
        
        // Store connection
        this.adminConnections.set(connectionId, {
          ws,
          user,
          connectionId,
          connectedAt: new Date(),
          lastPing: new Date(),
          subscribedToStudies: true, // Auto-subscribe to studies
          subscribedToLiveData: false,
          isAlive: true,
          lastDataSent: null,
          filters: {
            category: 'all',
            page: 1,
            limit: 50
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

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connection_established',
          message: 'Connected to admin notifications',
          userId: user._id,
          connectionId,
          userInfo: {
            name: user.fullName || user.email,
            role: user.role
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
          
          // Stop data streaming if no connections left
          if (this.adminConnections.size === 0 && this.dataUpdateInterval) {
            clearInterval(this.dataUpdateInterval);
            this.dataUpdateInterval = null;
            console.log('🛑 Stopped data streaming - no connections');
          }
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.adminConnections.delete(connectionId);
        });

        // Send initial data if requested
        await this.sendInitialStudyData(connectionId);

      } catch (error) {
        console.error('❌ WebSocket connection error:', error);
        ws.close(4004, 'Connection failed');
      }
    });

    // Start heartbeat
    this.startHeartbeat();
    
    // Start periodic data updates
    this.startDataStreaming();

    console.log('🔌 WebSocket server initialized for admin notifications and live data');
  }

  async handleClientMessage(connectionId, message) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'ping':
      case 'heartbeat': // Add heartbeat handling
        connection.lastPing = new Date();
        connection.isAlive = true;
        connection.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date()
        }));
        break;
      
      case 'subscribe_to_live_data':
        connection.subscribedToLiveData = true;
        if (message.filters) {
          connection.filters = { ...connection.filters, ...message.filters };
        }
        await this.sendStudyData(connectionId, true); // Force send
        connection.ws.send(JSON.stringify({
          type: 'subscribed_to_live_data',
          message: 'Subscribed to live study data',
          timestamp: new Date()
        }));
        console.log(`📊 Admin ${connection.user.fullName || connection.user.email} subscribed to live data`);
        break;

      // 🆕 ADD: Handle subscribe_to_studies message
      case 'subscribe_to_studies':
        connection.subscribedToStudies = true;
        connection.ws.send(JSON.stringify({
          type: 'subscribed_to_studies',
          message: 'Subscribed to study notifications',
          timestamp: new Date()
        }));
        console.log(`📢 Admin ${connection.user.fullName || connection.user.email} subscribed to study notifications`);
        break;

      case 'unsubscribe_from_studies':
        connection.subscribedToStudies = false;
        connection.ws.send(JSON.stringify({
          type: 'unsubscribed_from_studies',
          message: 'Unsubscribed from study notifications',
          timestamp: new Date()
        }));
        break;
      
      case 'unsubscribe_from_live_data':
        connection.subscribedToLiveData = false;
        connection.ws.send(JSON.stringify({
          type: 'unsubscribed_from_live_data',
          message: 'Unsubscribed from live data',
          timestamp: new Date()
        }));
        break;
      
      case 'update_filters':
        if (connection.subscribedToLiveData && message.filters) {
          connection.filters = { ...connection.filters, ...message.filters };
          await this.sendStudyData(connectionId, true); // Send filtered data immediately
        }
        break;
      
      case 'request_data_refresh':
        await this.sendStudyData(connectionId, true);
        break;
      
      default:
        console.log(`Unknown message type: ${message.type}`);
        // Send unknown message response
        connection.ws.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
          timestamp: new Date()
        }));
    }
  }

  async sendInitialStudyData(connectionId) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    try {
      const studyData = await this.fetchStudyData(connection.filters);
      
      connection.ws.send(JSON.stringify({
        type: 'initial_study_data',
        data: studyData,
        timestamp: new Date()
      }));
      
      connection.lastDataSent = Date.now();
      console.log(`📊 Sent initial study data to ${connection.user.email}`);
    } catch (error) {
      console.error('Error sending initial study data:', error);
    }
  }

  async sendStudyData(connectionId, forceUpdate = false) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection || !connection.subscribedToLiveData) return;

    try {
      const studyData = await this.fetchStudyData(connection.filters);
      const dataHash = JSON.stringify(studyData).length; // Simple hash
      
      // Only send if data changed or forced
      if (forceUpdate || connection.lastDataSent !== dataHash) {
        connection.ws.send(JSON.stringify({
          type: 'study_data_update',
          data: studyData,
          timestamp: new Date(),
          forced: forceUpdate
        }));
        
        connection.lastDataSent = dataHash;
      }
    } catch (error) {
      console.error(`Error sending study data to ${connectionId}:`, error);
    }
  }

  async fetchStudyData(filters = {}) {
    try {
      const { category = 'all', page = 1, limit = 50 } = filters;
      
      // Build filter conditions
      let filterConditions = {};
      
      switch (category) {
        case 'pending':
          filterConditions.workflowStatus = { $in: ['new_study_received', 'study_needs_review'] };
          break;
        case 'inprogress':
          filterConditions.workflowStatus = { $in: ['assigned_to_doctor', 'report_in_progress'] };
          break;
        case 'completed':
          filterConditions.workflowStatus = { $in: ['report_finalized', 'final_report_downloaded'] };
          break;
        // 'all' shows everything
      }

      // Fetch studies with corrected population
      const studies = await DicomStudy.find(filterConditions)
        .populate('patient', 'patientID patientNameRaw gender dateOfBirth')
        .populate('sourceLab', 'name identifier')
        .populate({
          path: 'lastAssignedDoctor',
          select: 'specialization',
          populate: {
            path: 'userAccount',
            select: 'firstName lastName email fullName'
          }
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();

      // Get total count
      const totalRecords = await DicomStudy.countDocuments(filterConditions);
      const totalPages = Math.ceil(totalRecords / limit);

      // Get category counts for dashboard stats
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

      const summary = {
        byCategory: {
          all: totalRecords,
          pending: categoryCounts.find(c => c._id === 'pending')?.count || 0,
          inprogress: categoryCounts.find(c => c._id === 'inprogress')?.count || 0,
          completed: categoryCounts.find(c => c._id === 'completed')?.count || 0
        },
        activeLabs: [...new Set(studies.map(s => s.sourceLab?._id).filter(Boolean))].length,
        activeDoctors: [...new Set(studies.map(s => s.lastAssignedDoctor?._id).filter(Boolean))].length
      };

      return {
        success: true,
        data: studies,
        totalPages,
        totalRecords,
        currentPage: page,
        summary,
        fetchedAt: new Date()
      };

    } catch (error) {
      console.error('Error fetching study data:', error);
      throw error;
    }
  }

  startDataStreaming() {
    // Send data updates every 5 seconds to subscribed connections
    this.dataUpdateInterval = setInterval(async () => {
      const activeConnections = Array.from(this.adminConnections.values())
        .filter(conn => conn.ws.readyState === conn.ws.OPEN && conn.subscribedToLiveData);
      
      if (activeConnections.length === 0) return;

      for (const connection of activeConnections) {
        await this.sendStudyData(connection.connectionId);
      }
    }, 5000); // Every 5 seconds

    console.log('📊 Started data streaming interval');
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

  // Enhanced study notifications
  async notifyNewStudy(studyData) {
    const notification = {
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
    };

    let sentCount = 0;
    this.adminConnections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === connection.ws.OPEN && connection.subscribedToStudies) {
        try {
          connection.ws.send(JSON.stringify(notification));
          sentCount++;
        } catch (error) {
          console.error(`Error sending notification to ${connectionId}:`, error);
        }
      }
    });

    console.log(`📢 New study notification sent to ${sentCount} admin(s): ${studyData.patientName}`);
    
    // Also trigger data refresh for live data subscribers
    await this.broadcastDataRefresh();
  }

  async broadcastDataRefresh() {
    const liveDataConnections = Array.from(this.adminConnections.values())
      .filter(conn => conn.ws.readyState === conn.ws.OPEN && conn.subscribedToLiveData);
    
    for (const connection of liveDataConnections) {
      await this.sendStudyData(connection.connectionId, true);
    }
  }

  // 🆕 NEW: Simple New Study Notification (no data)
  async notifySimpleNewStudy() {
    const notification = {
      type: 'simple_new_study_notification',
      timestamp: new Date(),
      message: 'New Study Arrived'
    };

    let sentCount = 0;
    this.adminConnections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === connection.ws.OPEN && connection.subscribedToStudies) {
        try {
          connection.ws.send(JSON.stringify(notification));
          sentCount++;
        } catch (error) {
          console.error(`Error sending simple notification to ${connectionId}:`, error);
        }
      }
    });

    console.log(`📢 Simple "New Study Arrived" notification sent to ${sentCount} admin(s)`);
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
      subscribedToLiveData: Array.from(this.adminConnections.values()).filter(
        conn => conn.subscribedToLiveData && conn.ws.readyState === conn.ws.OPEN
      ).length
    };
  }
}

// Export singleton instance
export default new WebSocketService();