// config/db.js - Optimized for DigitalOcean Droplet (2vCPU, 16GB RAM, MongoDB Replica Set)
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
    try {
        console.log('🔗 Connecting to MongoDB replica set...');
        const MONGODB_URI ='mongodb://alice:alicePassword@64.227.187.164:27017/medical_project?authSource=admin&replicaSet=rs0'
        // const MONGODB_URI ='mongodb://alice:alicePassword@64.227.187.164:27017/medical_project?authSource=admin&directConnection=true'
        
        const conn = await mongoose.connect(MONGODB_URI, {
            // 🎯 OPTIMIZED for 2vCPU, 16GB RAM droplet
            maxPoolSize: 8,              // ✅ Reasonable for 2vCPU
            minPoolSize: 2,              // ✅ Conservative minimum
            maxIdleTimeMS: 300000,        // ✅ Good for cloud deployment
            
            // 🚀 LOCAL TIMEOUTS (both Node.js and MongoDB on same droplet)
            serverSelectionTimeoutMS: 30000,   // ✅ Fast local connection
            socketTimeoutMS: 45000,            // ✅ Local network speed
            connectTimeoutMS: 100000,            // ✅ Quick local connection
            
            // 🔄 REPLICA SET SETTINGS (Required for transactions)
            readPreference: 'primary',         // ✅ Required for transactions
            readConcern: { level: 'majority' }, // ✅ Strong consistency for transactions
            writeConcern: { 
                w: 'majority',  // ✅ Required for transactions
                j: true         // ✅ Journal writes for durability
            },
            
            // 🔄 RELIABILITY for local MongoDB with replica set
            retryWrites: true,                 // ✅ Essential for replica sets
            retryReads: true,                  // ✅ Handle any local issues
            heartbeatFrequencyMS: 5000,        // ✅ Frequent checks for local setup
            
            // 🗜️ COMPRESSION for network efficiency
            compressors: ['zlib'],             // ✅ Reduce network traffic
        });
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}:${conn.connection.port}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        console.log(`🔄 Replica Set: ${conn.connection.name ? 'rs0' : 'N/A'}`);
        
        // 🎯 PRODUCTION SETTINGS
        mongoose.set('debug', process.env.NODE_ENV !== 'production');
        mongoose.set('strictQuery', false);
        mongoose.set('autoIndex', false);  // ✅ Disabled for production
        
        // 🔄 CONNECTION MONITORING
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });
        
        mongoose.connection.on('disconnected', () => {
            console.log('⚠️  MongoDB disconnected - attempting reconnection...');
        });
        
        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected');
        });
        
        // 🔄 TRANSACTION VALIDATION
        mongoose.connection.once('open', async () => {
            try {
                // Test transaction capability
                const session = await mongoose.startSession();
                await session.withTransaction(async () => {
                    // Simple test transaction
                });
                await session.endSession();
                console.log('✅ Transaction support confirmed');
            } catch (transactionError) {
                console.error('❌ Transaction test failed:', transactionError.message);
            }
        });
        
        // 🛑 GRACEFUL SHUTDOWN
        const gracefulShutdown = async (signal) => {
            console.log(`\n📴 Received ${signal}. Shutting down MongoDB connection...`);
            try {
                await mongoose.connection.close(false);
                console.log('✅ MongoDB connection closed gracefully');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };
        
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        
    } catch (error) {
        console.error(`❌ MongoDB Connection Failed: ${error.message}`);
        
        if (error.name === 'MongoServerSelectionError') {
            console.log('💡 Troubleshooting for same-machine deployment:');
            console.log('   1. Check MongoDB service: sudo systemctl status mongod');
            console.log('   2. Verify replica set: mongosh --eval "rs.status()"');
            console.log('   3. Check local connection: mongosh "mongodb://localhost:27017/admin"');
            console.log('   4. Verify auth: mongosh "mongodb://alice:alicePassword@localhost:27017/medical_project?authSource=admin"');
        }
        
        process.exit(1);
    }
};

// 🏥 SIMPLIFIED HEALTH CHECK
export const checkDBHealth = async () => {
    try {
        const state = mongoose.connection.readyState;
        const states = { 
            0: 'DISCONNECTED', 
            1: 'CONNECTED', 
            2: 'CONNECTING', 
            3: 'DISCONNECTING' 
        };
        
        if (state === 1) {
            const start = Date.now();
            await mongoose.connection.db.admin().ping();
            const pingTime = Date.now() - start;
            
            return {
                healthy: true,
                pingTime,
                state: states[state],
                database: mongoose.connection.name,
                replicaSet: 'rs0'
            };
        }
        
        return { 
            healthy: false, 
            state: states[state] 
        };
        
    } catch (error) {
        return { 
            healthy: false, 
            error: error.message 
        };
    }
};

export default connectDB;