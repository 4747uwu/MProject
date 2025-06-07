import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DicomStudy from './models/dicomStudyModel.js';
import Patient from './models/patientModel.js'; // Assuming you have this
import { faker } from '@faker-js/faker';

dotenv.config();

class LoadTestSimulator {
    constructor() {
        this.results = [];
        
        // 🔧 ENHANCED SAFETY: Use dedicated test URI if available
        this.connectionString = process.env.MONGODB_TEST_URI;
        this.testDatabaseName = 'medical_project_load_test';
        this.testCollectionName = 'dicom_studies_test';
        
        this.totalStudies = 40000;
        this.studiesPerDay = 1000;
        this.totalDays = 40;
        this.batchSize = 500;
        
        this.maxTestDocuments = 50000;
        this.dryRun = false;
        
        // 🔧 SAFETY: Log which database we're using
        console.log('🔗 Database configuration:');
        console.log(`   Using URI: ${this.connectionString.replace(/:[^:@]*@/, ':***@')}`);
        console.log(`   Target database: ${this.testDatabaseName}`);
    }

    async connect() {
        try {
            // 🔧 ENHANCED: Direct connection to test database
            let testConnectionString;
            
            if (process.env.MONGODB_TEST_URI) {
                // Use dedicated test URI
                testConnectionString = process.env.MONGODB_TEST_URI;
                console.log('✅ Using dedicated test database URI');
            } else {
                // Modify main URI to use test database
                testConnectionString = this.connectionString.replace(
                    /\/[^\/]*(\?|$)/, 
                    `/${this.testDatabaseName}$1`
                );
                console.log('⚠️ Modified main URI for test database');
            }
            
            await mongoose.connect(testConnectionString, {
                maxPoolSize: 20,
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                // bufferMaxEntries: 0
            });
            
            console.log('✅ Connected to SEPARATE TEST DATABASE:', this.testDatabaseName);
            console.log('🛡️ Your main database (medicalproject) is safe!');
            
            // 🔧 VERIFY: Confirm we're in test database
            const dbName = mongoose.connection.name;
            console.log(`📍 Confirmed database: ${dbName}`);
            
            if (dbName !== this.testDatabaseName) {
                throw new Error(`Safety check failed! Connected to ${dbName} instead of ${this.testDatabaseName}`);
            }
            
            // Show collections to confirm isolation
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log(`📦 Collections in test database: ${collections.length}`);
            
        } catch (error) {
            console.error('❌ Test database connection failed:', error);
            throw error;
        }
    }

    async safetyCheck() {
        console.log('\n🛡️ Running safety checks...');
        
        // Check 1: Verify test database
        const dbName = mongoose.connection.name;
        console.log(`   Database: ${dbName}`);
        
        if (dbName.includes('production') || dbName.includes('prod')) {
            throw new Error('❌ SAFETY ABORT: Cannot run load test on production database!');
        }
        
        // Check 2: Check existing document count
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const existingCount = await collection.countDocuments();
        console.log(`   Existing test documents: ${existingCount}`);
        
        if (existingCount + this.totalStudies > this.maxTestDocuments) {
            throw new Error(`❌ SAFETY ABORT: Would exceed max test documents (${this.maxTestDocuments})`);
        }
        
        // Check 3: Disk space estimation (updated for 10KB documents)
        const estimatedSizeGB = (this.totalStudies * 10) / 1024 / 1024; // ~10KB per document
        console.log(`   Estimated storage needed: ${estimatedSizeGB.toFixed(2)} GB`);
        console.log(`   Document size target: ~10KB each (realistic DICOM metadata)`);
        
        if (estimatedSizeGB > 10) {
            console.log('   ⚠️ WARNING: Large storage requirement. Continue? (This is a safety check)');
        }
        
        console.log('   ✅ All safety checks passed');
    }

    generateRealisticStudyData(dayOffset = 0) {
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - dayOffset);
        
        const modalities = ['CT', 'MRI', 'X-RAY', 'ULTRASOUND', 'MAMMOGRAPHY', 'PET', 'SPECT', 'DX', 'CR', 'NM'];
        const statuses = ['pending_assignment', 'assigned_to_doctor', 'in_review', 'completed', 'pending_report', 'report_finalized', 'archived'];
        const priorities = ['routine', 'urgent', 'emergent', 'stat', 'critical'];
        const departments = ['Radiology', 'Emergency', 'Cardiology', 'Neurology', 'Orthopedics', 'Oncology', 'Pediatrics', 'ICU'];
        const bodyParts = ['HEAD', 'NECK', 'CHEST', 'ABDOMEN', 'PELVIS', 'SPINE', 'EXTREMITY', 'HEART', 'BRAIN'];
        const manufacturers = ['SIEMENS', 'GE MEDICAL SYSTEMS', 'PHILIPS MEDICAL SYSTEMS', 'TOSHIBA', 'CANON', 'HITACHI'];
        const institutionTypes = ['Hospital', 'Medical Center', 'Clinic', 'Imaging Center', 'University Hospital'];

        // Generate extensive DICOM metadata to reach ~10KB per document
        const studyUID = `1.2.826.0.1.3680043.8.498.${faker.string.numeric(10)}`;
        const patientNumber = faker.string.numeric(6);
        const modality = faker.helpers.arrayElement(modalities);
        const manufacturer = faker.helpers.arrayElement(manufacturers);
        
        return {
            // Core identifiers
            studyInstanceUID: studyUID,
            accessionNumber: `ACC${faker.string.numeric(8)}`,
            patientId: `PAT${patientNumber}`,
            
            // Extended Patient Demographics
            patientInfo: {
                patientID: `PAT${patientNumber}`,
                patientName: `${faker.person.lastName()}^${faker.person.firstName()}^${faker.person.middleName()}^^`,
                patientBirthDate: faker.date.birthdate({ min: 1, max: 100, mode: 'age' }),
                patientAge: faker.number.int({ min: 1, max: 100 }).toString().padStart(3, '0') + 'Y',
                patientSex: faker.helpers.arrayElement(['M', 'F', 'O', 'U']),
                patientWeight: faker.number.int({ min: 3, max: 200 }),
                patientHeight: faker.number.int({ min: 50, max: 220 }),
                patientAddress: {
                    street: faker.location.streetAddress(),
                    city: faker.location.city(),
                    state: faker.location.state(),
                    zipCode: faker.location.zipCode(),
                    country: faker.location.country()
                },
                patientTelephone: faker.phone.number(),
                medicalRecordNumber: `MRN${faker.string.numeric(8)}`,
                insuranceInfo: {
                    primaryInsurance: faker.company.name() + ' Insurance',
                    policyNumber: faker.string.alphanumeric(12),
                    groupNumber: faker.string.numeric(6),
                    authorization: faker.string.alphanumeric(10)
                },
                allergies: faker.helpers.arrayElements([
                    'No known allergies', 'Penicillin', 'Shellfish', 'Latex', 'Iodine contrast', 
                    'Gadolinium', 'Aspirin', 'NSAIDs', 'Bee stings', 'Peanuts'
                ], { min: 1, max: 3 }),
                emergencyContact: {
                    name: `${faker.person.firstName()} ${faker.person.lastName()}`,
                    relationship: faker.helpers.arrayElement(['Spouse', 'Parent', 'Child', 'Sibling', 'Friend']),
                    phone: faker.phone.number()
                }
            },
            
            // Study Information
            modality: modality,
            modalitiesInStudy: faker.helpers.arrayElements(modalities, { min: 1, max: 3 }),
            workflowStatus: faker.helpers.arrayElement(statuses),
            currentCategory: faker.helpers.arrayElement(statuses),
            studyDate: faker.date.between({
                from: new Date(baseDate.getTime() - 24*60*60*1000),
                to: baseDate
            }),
            studyTime: faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, ''),
            createdAt: faker.date.between({
                from: new Date(baseDate.getTime() - 23*60*60*1000),
                to: new Date(baseDate.getTime() - 1*60*60*1000)
            }),
            updatedAt: new Date(),
            
            // Extended Study Details
            studyDescription: faker.helpers.arrayElement([
                'CT Head without contrast for trauma evaluation',
                'MRI Brain with and without gadolinium contrast',
                'Chest X-Ray PA and Lateral views',
                'CT Chest Abdomen Pelvis with IV contrast',
                'MRI Lumbar Spine without contrast',
                'Ultrasound Abdomen Complete with Doppler',
                'Mammography Bilateral Screening',
                'PET/CT Whole Body with F-18 FDG',
                'SPECT Myocardial Perfusion Study',
                'CT Angiography Head and Neck'
            ]),
            studyComments: faker.lorem.paragraph(),
            clinicalHistory: faker.lorem.sentences(2),
            indication: faker.helpers.arrayElement([
                'Rule out acute intracranial abnormality',
                'Chest pain, rule out pulmonary embolism',
                'Abdominal pain, evaluate for appendicitis',
                'Back pain, evaluate for disc herniation',
                'Screening mammography',
                'Follow-up known lesion',
                'Staging workup',
                'Post-operative evaluation'
            ]),
            
            // Technical DICOM Information
            institutionName: `${faker.location.city()} ${faker.helpers.arrayElement(institutionTypes)}`,
            institutionAddress: {
                street: faker.location.streetAddress(),
                city: faker.location.city(),
                state: faker.location.state(),
                zipCode: faker.location.zipCode()
            },
            stationName: `${modality}_${faker.string.numeric(2)}`,
            manufacturer: manufacturer,
            manufacturerModelName: `${manufacturer.split(' ')[0]} ${faker.helpers.arrayElement(['Discovery', 'Optima', 'Revolution', 'Signa', 'Ingenuity', 'Brilliance'])} ${faker.string.numeric(3)}`,
            deviceSerialNumber: faker.string.alphanumeric(10),
            softwareVersions: `${faker.number.int({ min: 1, max: 9 })}.${faker.number.int({ min: 0, max: 99 })}.${faker.number.int({ min: 0, max: 999 })}`,
            
            // Acquisition Parameters (varies by modality)
            acquisitionParameters: this.generateModalitySpecificParams(modality),
            
            // Series Information
            seriesCount: faker.number.int({ min: 1, max: 20 }),
            instanceCount: faker.number.int({ min: 50, max: 2000 }),
            seriesData: Array.from({length: faker.number.int({ min: 1, max: 8 })}, (_, index) => ({
                seriesInstanceUID: `1.2.826.0.1.3680043.8.498.${faker.string.numeric(10)}.${index + 1}`,
                seriesNumber: index + 1,
                seriesDescription: faker.helpers.arrayElement([
                    'Axial T1', 'Axial T2', 'Sagittal T1', 'Coronal FLAIR',
                    'Pre-contrast', 'Post-contrast', 'Delayed phase',
                    'Arterial phase', 'Portal venous phase', 'Equilibrium phase'
                ]),
                modality: modality,
                bodyPartExamined: faker.helpers.arrayElement(bodyParts),
                imageCount: faker.number.int({ min: 10, max: 200 }),
                sliceThickness: faker.number.float({ min: 0.5, max: 10, precision: 0.1 }),
                pixelSpacing: [faker.number.float({ min: 0.1, max: 2, precision: 0.01 }), faker.number.float({ min: 0.1, max: 2, precision: 0.01 })],
                imageOrientationPatient: [1, 0, 0, 0, 1, 0],
                acquisitionTime: faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, ''),
                protocolName: faker.helpers.arrayElement(['Routine', 'High Resolution', 'Fast Scan', 'Contrast Enhanced']),
                reconstructionDiameter: faker.number.int({ min: 200, max: 500 }),
                imageComments: faker.lorem.sentence(),
                windowCenter: faker.number.int({ min: -1000, max: 4000 }),
                windowWidth: faker.number.int({ min: 100, max: 8000 })
            })),
            
            // Workflow and Assignment Data
            assignment: {
                assignedTo: Math.random() > 0.3 ? new mongoose.Types.ObjectId() : null,
                assignedAt: Math.random() > 0.3 ? faker.date.recent() : null,
                assignedBy: new mongoose.Types.ObjectId(),
                priority: faker.helpers.arrayElement(priorities),
                dueDate: faker.date.future(),
                specialInstructions: Math.random() > 0.7 ? faker.lorem.sentence() : null,
                urgencyReason: Math.random() > 0.8 ? faker.lorem.sentence() : null
            },
            
            // Status History (detailed workflow tracking)
            statusHistory: Array.from({length: faker.number.int({ min: 1, max: 5 })}, () => ({
                status: faker.helpers.arrayElement(statuses),
                changedAt: faker.date.recent(),
                changedBy: new mongoose.Types.ObjectId(),
                note: faker.lorem.sentence(),
                systemInfo: {
                    userAgent: faker.internet.userAgent(),
                    ipAddress: faker.internet.ip(),
                    sessionId: faker.string.uuid()
                }
            })),
            
            // Report Information
            reportInfo: {
                startedAt: Math.random() > 0.7 ? faker.date.recent() : null,
                finalizedAt: Math.random() > 0.8 ? faker.date.recent() : null,
                downloadedAt: Math.random() > 0.9 ? faker.date.recent() : null,
                reporterName: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                reporterId: new mongoose.Types.ObjectId(),
                reportType: faker.helpers.arrayElement(['Preliminary', 'Final', 'Addendum', 'Corrected']),
                transcriptionStatus: faker.helpers.arrayElement(['Not Started', 'In Progress', 'Complete', 'Reviewed']),
                reportTemplate: faker.helpers.arrayElement(['Standard', 'Structured', 'Voice Recognition', 'Custom']),
                estimatedReadTime: faker.number.int({ min: 5, max: 45 }),
                actualReadTime: faker.number.int({ min: 3, max: 60 }),
                reportComplexity: faker.helpers.arrayElement(['Simple', 'Moderate', 'Complex', 'Highly Complex']),
                impressionLength: faker.number.int({ min: 50, max: 500 }),
                findingsCount: faker.number.int({ min: 0, max: 15 })
            },
            
            // Referring Provider Information
            referringPhysician: {
                name: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                id: new mongoose.Types.ObjectId(),
                department: faker.helpers.arrayElement(departments),
                institution: `${faker.location.city()} Medical Group`,
                phone: faker.phone.number(),
                email: faker.internet.email(),
                address: {
                    street: faker.location.streetAddress(),
                    city: faker.location.city(),
                    state: faker.location.state(),
                    zipCode: faker.location.zipCode()
                },
                npi: faker.string.numeric(10),
                specialty: faker.helpers.arrayElement(['Internal Medicine', 'Emergency Medicine', 'Cardiology', 'Neurology', 'Orthopedics', 'Oncology'])
            },
            
            // Quality and Compliance
            qualityMetrics: {
                imageQualityScore: faker.number.int({ min: 1, max: 5 }),
                motionArtifacts: faker.helpers.arrayElement(['None', 'Minimal', 'Moderate', 'Severe']),
                contrastQuality: Math.random() > 0.5 ? faker.helpers.arrayElement(['Excellent', 'Good', 'Fair', 'Poor']) : null,
                technicalIssues: Math.random() > 0.8 ? faker.lorem.sentence() : null,
                retakeRequired: Math.random() > 0.95,
                radiationDose: modality.includes('CT') || modality.includes('X') ? faker.number.float({ min: 0.1, max: 50, precision: 0.1 }) : null,
                contrastVolume: Math.random() > 0.6 ? faker.number.int({ min: 50, max: 200 }) : null
            },
            
            // File Storage Information
            storageInfo: {
                primaryStorage: {
                    path: `/dicom/studies/${faker.string.uuid()}`,
                    server: `storage-${faker.number.int({ min: 1, max: 10 })}`,
                    fileSize: faker.number.int({ min: 10000000, max: 2000000000 }), // 10MB to 2GB
                    compressionRatio: faker.number.float({ min: 1.2, max: 4.5, precision: 0.1 }),
                    checksumMD5: faker.string.hexadecimal({ length: 32 }),
                    checksumSHA256: faker.string.hexadecimal({ length: 64 })
                },
                backupStorage: {
                    path: `/backup/studies/${faker.string.uuid()}`,
                    server: `backup-${faker.number.int({ min: 1, max: 5 })}`,
                    lastBackup: faker.date.recent(),
                    verified: Math.random() > 0.1
                },
                archiveStatus: faker.helpers.arrayElement(['Active', 'Near-line', 'Offline', 'Archived']),
                retentionDate: faker.date.future({ years: faker.number.int({ min: 7, max: 25 }) })
            },
            
            // Performance Metrics
            timingInfo: {
                uploadToAssignmentMinutes: faker.number.int({ min: 5, max: 120 }),
                assignmentToReportMinutes: faker.number.int({ min: 30, max: 480 }),
                reportToDownloadMinutes: faker.number.int({ min: 10, max: 60 }),
                totalTATMinutes: faker.number.int({ min: 60, max: 600 }),
                firstImageAvailableAt: faker.date.recent(),
                lastImageAvailableAt: faker.date.recent(),
                processingTime: faker.number.int({ min: 1, max: 30 }),
                reconstructionTime: faker.number.int({ min: 5, max: 180 })
            },
            
            // Integration and System Info
            systemInfo: {
                orthancStudyID: faker.string.alphanumeric(8),
                pacsSystemId: faker.string.alphanumeric(12),
                worklist: {
                    mwlItemId: faker.string.alphanumeric(10),
                    scheduledDateTime: faker.date.recent(),
                    requestedProcedure: faker.helpers.arrayElement(['CT Head', 'MRI Brain', 'Chest X-Ray', 'Ultrasound']),
                    schedulingAET: `SCH_${faker.string.alphanumeric(4)}`,
                    performingAET: `PERF_${faker.string.alphanumeric(4)}`
                },
                hl7Messages: Array.from({length: faker.number.int({ min: 1, max: 3 })}, () => ({
                    messageType: faker.helpers.arrayElement(['ADT^A04', 'ORM^O01', 'ORU^R01']),
                    timestamp: faker.date.recent(),
                    messageId: faker.string.alphanumeric(12),
                    status: faker.helpers.arrayElement(['Processed', 'Pending', 'Error'])
                })),
                auditTrail: Array.from({length: faker.number.int({ min: 3, max: 10 })}, () => ({
                    action: faker.helpers.arrayElement(['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT']),
                    user: faker.internet.username(), // Changed from userName() to username()
                    timestamp: faker.date.recent(),
                    details: faker.lorem.sentence(),
                    ipAddress: faker.internet.ip()
                }))
            },
            
            // Extended metadata for search and analytics
            searchMetadata: {
                searchText: `${faker.person.lastName()} ${faker.person.firstName()} ${modality} PAT${patientNumber} ${faker.helpers.arrayElement(bodyParts)}`,
                keywords: faker.helpers.arrayElements([
                    'contrast', 'emergency', 'follow-up', 'screening', 'diagnostic', 
                    'therapeutic', 'pre-operative', 'post-operative', 'staging', 'monitoring'
                ], { min: 1, max: 4 }),
                procedureCodes: {
                    cpt: faker.string.numeric(5),
                    icd10: faker.helpers.arrayElement(['Z12.31', 'R06.02', 'M54.5', 'N39.0', 'K59.00']),
                    snomed: faker.string.numeric(8)
                },
                departmentCode: faker.string.alphanumeric(4),
                costCenter: faker.string.numeric(6)
            },
            
            // Additional fields for comprehensive testing
            sourceLab: new mongoose.Types.ObjectId(),
            department: faker.helpers.arrayElement(departments),
            ReportAvailable: Math.random() > 0.7,
            caseType: faker.helpers.arrayElement(['routine', 'stat', 'emergency', 'urgent']),
            isActive: true,
            lastModifiedBy: new mongoose.Types.ObjectId(),
            version: faker.number.int({ min: 1, max: 5 }),
            
            // Custom fields for testing various scenarios
            testMetadata: {
                batchNumber: faker.string.alphanumeric(8),
                dataSource: 'load_test_simulation',
                generatedAt: new Date(),
                simulationDay: dayOffset,
                uniqueIdentifier: faker.string.uuid()
            }
        };
    }

    // Add helper method for modality-specific parameters
    generateModalitySpecificParams(modality) {
        const params = {
            modality: modality,
            acquisitionDate: faker.date.recent(),
            acquisitionTime: faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, '')
        };
        
        switch(modality) {
            case 'CT':
                return {
                    ...params,
                    kvp: faker.number.int({ min: 80, max: 140 }),
                    mas: faker.number.int({ min: 50, max: 500 }),
                    sliceThickness: faker.number.float({ min: 0.5, max: 10, precision: 0.1 }),
                    pitch: faker.number.float({ min: 0.5, max: 2.0, precision: 0.1 }),
                    reconstructionKernel: faker.helpers.arrayElement(['B30f', 'B45f', 'B70f', 'H60f']),
                    ctdiVol: faker.number.float({ min: 1, max: 50, precision: 0.1 }),
                    dlp: faker.number.int({ min: 100, max: 2000 }),
                    contrastAgent: Math.random() > 0.6 ? 'Iohexol 350mg/mL' : null
                };
                
            case 'MRI':
                return {
                    ...params,
                    magneticFieldStrength: faker.helpers.arrayElement([1.5, 3.0, 7.0]),
                    sequenceName: faker.helpers.arrayElement(['T1SE', 'T2SE', 'FLAIR', 'DWI', 'T1_MPRAGE']),
                    repetitionTime: faker.number.int({ min: 400, max: 8000 }),
                    echoTime: faker.number.int({ min: 5, max: 150 }),
                    flipAngle: faker.number.int({ min: 5, max: 180 }),
                    numberOfAverages: faker.number.int({ min: 1, max: 4 }),
                    contrastAgent: Math.random() > 0.5 ? 'Gadolinium' : null
                };
                
            case 'X-RAY':
            case 'DX':
            case 'CR':
                return {
                    ...params,
                    kvp: faker.number.int({ min: 50, max: 120 }),
                    mas: faker.number.int({ min: 1, max: 100 }),
                    exposureTime: faker.number.int({ min: 1, max: 1000 }),
                    grid: faker.helpers.arrayElement(['Yes', 'No']),
                    viewPosition: faker.helpers.arrayElement(['PA', 'AP', 'LAT', 'LPO', 'RPO'])
                };
                
            default:
                return params;
        }
    }

    async simulateDataLoad() {
        console.log(`🚀 Simulating ${this.totalStudies} DICOM studies over ${this.totalDays} days...`);
        
        await this.safetyCheck();
        
        if (this.dryRun) {
            console.log('🧪 DRY RUN MODE: No actual data will be inserted');
            return;
        }
        
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        
        // 🔧 SAFE CLEANUP: Only clear test collection in test database
        console.log('🧹 Clearing existing test data in TEST DATABASE ONLY...');
        await collection.deleteMany({});
        
        let totalInserted = 0;
        const startTime = Date.now();

        for (let day = 0; day < this.totalDays; day++) {
            console.log(`📅 Generating data for day ${day + 1}/${this.totalDays}...`);
            
            const dayStudies = [];
            for (let i = 0; i < this.studiesPerDay; i++) {
                dayStudies.push(this.generateRealisticStudyData(day));
            }

            // 🔧 SAFE INSERTION: Insert in smaller batches with error handling
            for (let i = 0; i < dayStudies.length; i += this.batchSize) {
                const batch = dayStudies.slice(i, i + this.batchSize);
                
                try {
                    await collection.insertMany(batch, { 
                        ordered: false,
                        writeConcern: { w: 1, j: true } // Ensure writes are acknowledged
                    });
                    totalInserted += batch.length;
                    
                    if (totalInserted % 5000 === 0) {
                        console.log(`   📊 Inserted ${totalInserted}/${this.totalStudies} studies`);
                        
                        // 🆕 PROGRESS SAFETY: Check memory usage
                        const memUsage = process.memoryUsage();
                        if (memUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
                            console.log('   ⚠️ High memory usage, pausing...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                } catch (error) {
                    console.error(`   ❌ Batch insertion failed: ${error.message}`);
                    // Continue with next batch
                }
            }
            
            // 🆕 BREATHING ROOM: Small delay between days
            if (day % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Data simulation complete! ${totalInserted} studies in ${duration}ms`);
        console.log(`📈 Insertion rate: ${Math.round((totalInserted / duration) * 1000)} studies/second`);
    }

    async testQueryPerformance(queryName, query, expectedDuration = 1000) {
        console.log(`\n🔍 Testing: ${queryName}`);
        
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const start = Date.now();
        let result;
        let error = null;
        
        try {
            if (Array.isArray(query)) {
                // Aggregation pipeline
                result = await collection.aggregate(query, { allowDiskUse: true }).toArray();
            } else {
                // Find query
                result = await collection.find(query).limit(100).toArray();
            }
        } catch (err) {
            error = err;
            result = [];
        }
        
        const duration = Date.now() - start;
        const efficiency = duration < expectedDuration ? '✅ EXCELLENT' : 
                          duration < expectedDuration * 2 ? '⚠️ GOOD' : 
                          duration < expectedDuration * 4 ? '🔶 FAIR' : '❌ POOR';
        
        const testResult = {
            name: queryName,
            duration,
            resultCount: result.length,
            efficiency,
            error: error?.message,
            timestamp: new Date().toISOString()
        };
        
        this.results.push(testResult);
        
        console.log(`   Duration: ${duration}ms (Expected: <${expectedDuration}ms)`);
        console.log(`   Records: ${result.length}`);
        console.log(`   Performance: ${efficiency}`);
        
        if (error) {
            console.log(`   ❌ Error: ${error.message}`);
        }
        
        return testResult;
    }

    async runLoadTests() {
        console.log('🧪 Running comprehensive load tests on 40,000 studies...\n');
        
        await this.connect();
        await this.createTestIndexes();
        
        // Check if we need to generate data
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const existingCount = await collection.countDocuments();
        
        if (existingCount < this.totalStudies) {
            console.log(`📊 Found ${existingCount} studies, generating ${this.totalStudies - existingCount} more...`);
            await this.simulateDataLoad();
        } else {
            console.log(`📊 Using existing ${existingCount} test studies`);
        }

        // Test Suite 1: Core Admin Queries (your main use case)
        console.log('\n🎯 === CORE ADMIN QUERY TESTS ===');
        
        await this.testQueryPerformance(
            "Last 24 Hours - No Filter",
            { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } },
            200
        );

        await this.testQueryPerformance(
            "Last 24 Hours + Status",
            [
                { $match: { 
                    createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) },
                    workflowStatus: "pending_assignment"
                }},
                { $sort: { createdAt: -1 } },
                { $limit: 50 }
            ],
            300
        );

        await this.testQueryPerformance(
            "Last 24 Hours + Modality",
            [
                { $match: { 
                    createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) },
                    modality: "CT"
                }},
                { $sort: { createdAt: -1 } },
                { $limit: 50 }
            ],
            300
        );

        // Test Suite 2: Search and Filter Performance
        console.log('\n🔍 === SEARCH & FILTER TESTS ===');
        
        await this.testQueryPerformance(
            "Patient ID Search",
            [
                { $match: { 
                    createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) },
                    patientId: { $regex: /^PAT1/, $options: 'i' }
                }},
                { $limit: 20 }
            ],
            400
        );

        await this.testQueryPerformance(
            "Accession Number Lookup",
            { accessionNumber: { $regex: /^ACC1/, $options: 'i' } },
            200
        );

        await this.testQueryPerformance(
            "Complex Multi-Filter",
            [
                { $match: { 
                    createdAt: { $gte: new Date(Date.now() - 72*60*60*1000) },
                    workflowStatus: { $in: ["pending_assignment", "assigned_to_doctor"] },
                    modality: { $in: ["CT", "MRI"] },
                    "assignment.priority": "urgent"
                }},
                { $sort: { createdAt: -1, "assignment.priority": 1 } },
                { $limit: 30 }
            ],
            500
        );

        // Test Suite 3: Aggregation and Analytics
        console.log('\n📊 === ANALYTICS & AGGREGATION TESTS ===');
        
        await this.testQueryPerformance(
            "Daily Study Count",
            [
                { $match: { createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } } },
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    count: { $sum: 1 },
                    modalities: { $addToSet: "$modality" }
                }},
                { $sort: { _id: -1 } }
            ],
            600
        );

        await this.testQueryPerformance(
            "Status Distribution",
            [
                { $match: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } } },
                { $group: {
                    _id: "$workflowStatus",
                    count: { $sum: 1 },
                    avgFileSize: { $avg: "$fileSize" }
                }},
                { $sort: { count: -1 } }
            ],
            400
        );

        // Test Suite 4: Stress Tests
        console.log('\n💪 === STRESS TESTS ===');
        
        await this.testQueryPerformance(
            "Large Date Range (7 days)",
            [
                { $match: { createdAt: { $gte: new Date(Date.now() - 7*24*60*60*1000) } } },
                { $sort: { createdAt: -1 } },
                { $limit: 100 }
            ],
            800
        );

        await this.testQueryPerformance(
            "Full Text Search Simulation",
            [
                { $match: { 
                    $and: [
                        { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } },
                        { $or: [
                            { patientName: { $regex: /Smith/, $options: 'i' } },
                            { studyDescription: { $regex: /CT/, $options: 'i' } }
                        ]}
                    ]
                }},
                { $limit: 50 }
            ],
            1000
        );

        // Test Suite 5: Worst Case Scenarios
        console.log('\n⚠️ === WORST CASE SCENARIOS ===');
        
        await this.testQueryPerformance(
            "No Time Filter (WORST CASE)",
            [
                { $match: { workflowStatus: "completed" } },
                { $sort: { createdAt: -1 } },
                { $limit: 20 }
            ],
            3000
        );

        await this.testQueryPerformance(
            "Complex Join Simulation",
            [
                { $match: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } } },
                { $lookup: {
                    from: 'patients_test',
                    localField: 'patientId',
                    foreignField: 'patientId',
                    as: 'patientData'
                }},
                { $lookup: {
                    from: 'doctors_test',
                    localField: 'assignment.assignedTo',
                    foreignField: '_id',
                    as: 'doctorData'
                }},
                { $sort: { createdAt: -1 } },
                { $limit: 20 }
            ],
            1500
        );

        // Concurrent Load Test
        await this.testConcurrentLoad();
        
        this.generateComprehensiveReport();
        await this.cleanup();
    }

    async testConcurrentLoad() {
        console.log('\n🔄 === CONCURRENT ACCESS TEST ===');
        
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const concurrentQueries = 10;
        const queries = [];
        
        const testQuery = [
            { $match: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } } },
            { $sort: { createdAt: -1 } },
            { $limit: 20 }
        ];

        console.log(`🚀 Running ${concurrentQueries} concurrent queries...`);
        const start = Date.now();
        
        for (let i = 0; i < concurrentQueries; i++) {
            queries.push(
                collection.aggregate(testQuery, { allowDiskUse: true }).toArray()
            );
        }

        try {
            const results = await Promise.all(queries);
            const duration = Date.now() - start;
            const avgDuration = duration / concurrentQueries;
            
            console.log(`   ✅ All ${concurrentQueries} queries completed`);
            console.log(`   Total time: ${duration}ms`);
            console.log(`   Average per query: ${avgDuration}ms`);
            console.log(`   Throughput: ${Math.round((concurrentQueries / duration) * 1000)} queries/second`);
            
            this.results.push({
                name: 'Concurrent Load Test',
                duration: avgDuration,
                resultCount: results[0].length,
                efficiency: avgDuration < 500 ? '✅ EXCELLENT' : avgDuration < 1000 ? '⚠️ GOOD' : '❌ POOR',
                concurrent: concurrentQueries
            });
        } catch (error) {
            console.error(`   ❌ Concurrent test failed: ${error.message}`);
        }
    }

    generateComprehensiveReport() {
        console.log('\n📈 === COMPREHENSIVE LOAD TEST REPORT ===');
        console.log('='.repeat(60));
        
        const coreTests = this.results.filter(r => r.name.includes('24 Hours'));
        const searchTests = this.results.filter(r => r.name.includes('Search') || r.name.includes('Lookup'));
        const aggregationTests = this.results.filter(r => r.name.includes('Count') || r.name.includes('Distribution'));
        const stressTests = this.results.filter(r => r.name.includes('WORST') || r.name.includes('days'));
        
        console.log('\n🎯 CORE ADMIN QUERIES (Most Important):');
        coreTests.forEach(test => {
            console.log(`   ${test.name.padEnd(30)} | ${test.duration}ms | ${test.efficiency}`);
        });
        
        console.log('\n🔍 SEARCH & FILTER PERFORMANCE:');
        searchTests.forEach(test => {
            console.log(`   ${test.name.padEnd(30)} | ${test.duration}ms | ${test.efficiency}`);
        });
        
        console.log('\n📊 ANALYTICS PERFORMANCE:');
        aggregationTests.forEach(test => {
            console.log(`   ${test.name.padEnd(30)} | ${test.duration}ms | ${test.efficiency}`);
        });
        
        console.log('\n💪 STRESS TEST RESULTS:');
        stressTests.forEach(test => {
            console.log(`   ${test.name.padEnd(30)} | ${test.duration}ms | ${test.efficiency}`);
        });

        // Overall performance assessment
        const avgCoreTime = coreTests.reduce((sum, t) => sum + t.duration, 0) / coreTests.length;
        const worstCoreTime = Math.max(...coreTests.map(t => t.duration));
        
        console.log('\n🏆 OVERALL ASSESSMENT:');
        console.log(`   Dataset Size: 40,000 studies`);
        console.log(`   Core Query Avg: ${Math.round(avgCoreTime)}ms`);
        console.log(`   Core Query Worst: ${worstCoreTime}ms`);
        
        if (avgCoreTime < 300) {
            console.log('   ✅ EXCELLENT: Ready for production at scale');
        } else if (avgCoreTime < 600) {
            console.log('   ⚠️ GOOD: Performance acceptable, monitor under load');
        } else {
            console.log('   ❌ NEEDS IMPROVEMENT: Consider additional optimizations');
        }

        // Performance recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        
        if (worstCoreTime > 500) {
            console.log('   - Consider adding more specific compound indexes');
        }
        
        const slowTests = this.results.filter(r => r.duration > 1000);
        if (slowTests.length > 0) {
            console.log('   - Review slow queries for optimization opportunities');
            slowTests.forEach(test => {
                console.log(`     * ${test.name}: ${test.duration}ms`);
            });
        }
        
        console.log('   - Implement caching for frequently accessed data');
        console.log('   - Use cursor-based pagination for large result sets');
        console.log('   - Consider read replicas for analytics queries');
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test data...');
        
        // 🔧 DOUBLE-CHECK: Verify we're cleaning test database only
        const dbName = mongoose.connection.name;
        if (dbName !== this.testDatabaseName) {
            console.error('❌ SAFETY ABORT: Not in test database for cleanup!');
            return;
        }
        
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const deleteResult = await collection.deleteMany({});
        
        console.log(`   ✅ Deleted ${deleteResult.deletedCount} test documents from TEST DATABASE`);
        console.log(`   🛡️ Your main database remains untouched`);
        
        await mongoose.disconnect();
        console.log('   Disconnected from test database');
    }

    // 🆕 NEW: Emergency cleanup function
    async emergencyCleanup() {
        console.log('🚨 EMERGENCY CLEANUP: Removing all test data...');
        
        try {
            await this.connect();
            
            // Drop entire test database
            await mongoose.connection.db.dropDatabase();
            console.log('   ✅ Test database completely removed');
            
            await mongoose.disconnect();
        } catch (error) {
            console.error('❌ Emergency cleanup failed:', error);
        }
    }

    // 🆕 NEW: Quick validation without full test
    async quickValidation() {
        console.log('⚡ Running quick validation (no data generation)...');
        
        this.dryRun = true;
        this.totalStudies = 100; // Small test
        
        await this.connect();
        await this.safetyCheck();
        
        // Test basic query performance on existing data
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        const count = await collection.countDocuments();
        
        if (count > 0) {
            console.log(`   Found ${count} existing test documents`);
            await this.testQueryPerformance(
                "Quick Validation Query",
                { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } },
                500
            );
        } else {
            console.log('   No existing test data found');
        }
        
        await mongoose.disconnect();
        console.log('✅ Quick validation complete');
    }

    async createTestIndexes() {
        console.log('\n📊 Creating performance indexes...');
        
        const collection = mongoose.connection.db.collection(this.testCollectionName);
        
        try {
            // Critical indexes for performance testing
            await collection.createIndex({ "createdAt": -1 });
            console.log('   ✅ Created createdAt index');
            
            await collection.createIndex({ "createdAt": -1, "workflowStatus": 1 });
            console.log('   ✅ Created compound createdAt + workflowStatus index');
            
            await collection.createIndex({ "workflowStatus": 1 });
            console.log('   ✅ Created workflowStatus index');
            
            await collection.createIndex({ "modality": 1 });
            console.log('   ✅ Created modality index');
            
            await collection.createIndex({ "patientId": 1 });
            console.log('   ✅ Created patientId index');
            
            await collection.createIndex({ "accessionNumber": 1 });
            console.log('   ✅ Created accessionNumber index');
            
            await collection.createIndex({ "studyInstanceUID": 1 }, { unique: true });
            console.log('   ✅ Created unique studyInstanceUID index');
            
            // Additional performance indexes
            await collection.createIndex({ "createdAt": -1, "modality": 1 });
            console.log('   ✅ Created compound createdAt + modality index');
            
            await collection.createIndex({ "assignment.priority": 1 });
            console.log('   ✅ Created assignment priority index');
            
            await collection.createIndex({ "patientName": "text", "studyDescription": "text" });
            console.log('   ✅ Created text search index');
            
            console.log('   ✅ All performance indexes created successfully');
            
        } catch (error) {
            console.log(`   ⚠️ Some indexes may already exist or failed to create: ${error.message}`);
            // Continue execution - this is not a critical failure
        }
    }
}

// 🆕 NEW: Command line options
const args = process.argv.slice(2);
const simulator = new LoadTestSimulator();

if (args.includes('--dry-run')) {
    simulator.dryRun = true;
    console.log('🧪 DRY RUN MODE ENABLED');
}

if (args.includes('--quick')) {
    simulator.quickValidation().catch(console.error);
} else if (args.includes('--cleanup')) {
    simulator.emergencyCleanup().catch(console.error);
} else {
    simulator.runLoadTests().catch(console.error);
}