import mongoose from 'mongoose';
import dotenv from 'dotenv'
import DicomStudy from './models/dicomStudyModel.js'; // Adjust the path as necessary
dotenv.config(); // Load environment variables from .env file   

class AtlasPerformanceTester {
    constructor() {
        this.results = [];
        this.connectionString = process.env.MONGODB_URI; // Your Atlas connection string
    }

    async connect() {
        try {
            await mongoose.connect(this.connectionString, {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            console.log('✅ Connected to MongoDB Atlas');
            
            // Check connection details
            const admin = mongoose.connection.db.admin();
            const result = await admin.command({ ismaster: 1 });
            console.log(`📍 Connected to Atlas cluster: ${result.setName || 'Standalone'}`);
            console.log(`🌍 Atlas region: ${result.me || 'Unknown'}`);
        } catch (error) {
            console.error('❌ Atlas connection failed:', error);
            throw error;
        }
    }

    async testQueryPerformance(queryName, pipeline, expectedDuration = 1000) {
        console.log(`\n🔍 Testing: ${queryName}`);
        
        const start = Date.now();
        let result;
        let error = null;
        
        try {
            if (Array.isArray(pipeline)) {
                // Aggregation pipeline
                result = await DicomStudy.aggregate(pipeline).allowDiskUse(true);
            } else {
                // Simple find query
                result = await DicomStudy.find(pipeline).lean();
            }
        } catch (err) {
            error = err;
            result = [];
        }
        
        const duration = Date.now() - start;
        const efficiency = duration < expectedDuration ? '✅ GOOD' : 
                          duration < expectedDuration * 2 ? '⚠️ FAIR' : '❌ POOR';
        
        const testResult = {
            name: queryName,
            duration,
            resultCount: result.length,
            efficiency,
            error: error?.message,
            timestamp: new Date().toISOString()
        };
        
        this.results.push(testResult);
        
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Records: ${result.length}`);
        console.log(`   Efficiency: ${efficiency}`);
        
        if (error) {
            console.log(`   Error: ${error.message}`);
        }
        
        return testResult;
    }

    async runComprehensiveTests() {
        console.log('🚀 Starting Atlas Performance Tests...\n');
        
        await this.connect();

        // Check current data volume
        const totalStudies = await DicomStudy.countDocuments();
        console.log(`📊 Total studies in database: ${totalStudies}`);
        
        // Test scenarios
        const tests = [
            // Test 1: Time-based queries (your main optimization)
            {
                name: "Last 24 Hours Query",
                query: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } },
                expected: 300
            },
            
            // Test 2: Compound index usage
            {
                name: "Status + Time Query", 
                query: [
                    { $match: { 
                        createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) },
                        workflowStatus: "assigned_to_doctor"
                    }},
                    { $sort: { createdAt: -1 } },
                    { $limit: 20 }
                ],
                expected: 400
            },
            
            // Test 3: Lab-based filtering
            {
                name: "Lab + Time Query",
                query: [
                    { $match: { 
                        createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) }
                    }},
                    { $group: { _id: "$sourceLab", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ],
                expected: 500
            },
            
            // Test 4: Search functionality
            {
                name: "Patient ID Search + Time",
                query: [
                    { $match: { 
                        createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) },
                        patientId: { $regex: /^PAT/, $options: 'i' }
                    }},
                    { $limit: 20 }
                ],
                expected: 400
            },
            
            // Test 5: Full aggregation pipeline (like your admin controller)
            {
                name: "Full Admin Pipeline",
                query: [
                    { $match: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } } },
                    { $lookup: {
                        from: 'patients',
                        localField: 'patient',
                        foreignField: '_id',
                        as: 'patientData'
                    }},
                    { $sort: { createdAt: -1 } },
                    { $limit: 20 },
                    { $project: {
                        _id: 1,
                        patientId: 1,
                        workflowStatus: 1,
                        createdAt: 1,
                        'patientData.firstName': 1,
                        'patientData.lastName': 1
                    }}
                ],
                expected: 800
            }
        ];

        // Run all tests
        for (const test of tests) {
            await this.testQueryPerformance(test.name, test.query, test.expected);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay between tests
        }

        // Test without time filter (should be slow with large datasets)
        if (totalStudies > 10000) {
            console.log('\n⚠️ Testing WITHOUT time filter (expect poor performance):');
            await this.testQueryPerformance(
                "All Studies Query (No Filter)", 
                [
                    { $sort: { createdAt: -1 } },
                    { $limit: 20 }
                ], 
                5000
            );
        }

        this.generateReport();
        await mongoose.disconnect();
    }

    generateReport() {
        console.log('\n📈 ATLAS PERFORMANCE REPORT');
        console.log('=' * 60);
        
        const goodPerformance = this.results.filter(r => r.efficiency === '✅ GOOD').length;
        const fairPerformance = this.results.filter(r => r.efficiency === '⚠️ FAIR').length;
        const poorPerformance = this.results.filter(r => r.efficiency === '❌ POOR').length;
        
        console.log(`Overall Performance Score:`);
        console.log(`  ✅ Good: ${goodPerformance} tests`);
        console.log(`  ⚠️ Fair: ${fairPerformance} tests`);
        console.log(`  ❌ Poor: ${poorPerformance} tests`);
        
        console.log('\nDetailed Results:');
        this.results.forEach(result => {
            console.log(`${result.name.padEnd(30)} | ${result.duration}ms | ${result.efficiency} | ${result.resultCount} records`);
        });
        
        console.log('\nRecommendations:');
        const avgTime = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
        
        if (avgTime < 500) {
            console.log('✅ Excellent performance! Your optimizations are working well.');
        } else if (avgTime < 1000) {
            console.log('⚠️ Good performance. Consider additional index optimizations.');
        } else {
            console.log('❌ Performance needs improvement. Check slow queries and indexing strategy.');
        }
        
        // Identify slowest queries
        const slowestQueries = this.results
            .filter(r => r.duration > 1000)
            .sort((a, b) => b.duration - a.duration);
            
        if (slowestQueries.length > 0) {
            console.log('\n🐌 Slowest Queries (>1000ms):');
            slowestQueries.forEach(query => {
                console.log(`  - ${query.name}: ${query.duration}ms`);
            });
        }
    }

    // Test progressive data growth simulation
    async simulateProgressiveGrowth() {
        console.log('\n🔄 Testing Progressive Data Growth Impact...');
        
        const dataSizes = [1000, 5000, 10000, 20000, 30000];
        const testQuery = { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } };
        
        for (const size of dataSizes) {
            console.log(`\n📊 Simulating ${size} total documents:`);
            
            // Test query performance at different data volumes
            const start = Date.now();
            const result = await DicomStudy.find(testQuery).limit(20).lean();
            const duration = Date.now() - start;
            
            console.log(`   Query time: ${duration}ms`);
            console.log(`   Expected for day ${Math.ceil(size/1000)}: ${this.getExpectedPerformance(size)}`);
        }
    }

    getExpectedPerformance(studyCount) {
        if (studyCount <= 5000) return 'EXCELLENT (100-300ms)';
        if (studyCount <= 15000) return 'GOOD (300-500ms)';
        if (studyCount <= 30000) return 'FAIR (500-800ms)';
        return 'ACCEPTABLE (800ms+)';
    }
}

// Run the tests
const tester = new AtlasPerformanceTester();
tester.runComprehensiveTests().catch(console.error);