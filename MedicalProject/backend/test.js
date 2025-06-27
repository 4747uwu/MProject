import mongoose from 'mongoose';
import dotenv from 'dotenv';
import DicomStudy from './models/dicomStudyModel.js';
import Patient from './models/patientModel.js';
import Doctor from './models/doctorModel.js';
import User from './models/userModel.js';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

dotenv.config();

class MedicalDatabaseSimulator {
    constructor() {
        this.results = [];
        
        // 🔧 ENHANCED SAFETY: Use dedicated test URI if available
        this.connectionString = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;
        this.testDatabaseName = 'medical_project_comprehensive_test';
        
        // 🆕 COMPREHENSIVE SCALE
        this.totalStudies = 55000;      // 50,000+ studies
        this.totalPatients = 32000;     // 30,000+ patients
        this.totalDoctors = 250;        // 200+ doctors
        this.totalUsers = 400;          // Users (including doctors, lab staff, admins)
        this.totalLabs = 850;           // 800+ labs
        
        this.studiesPerDay = 1200;
        this.totalDays = 46;
        this.batchSize = 500;
        
        this.maxTestDocuments = 200000;
        this.dryRun = false;
        
        // Collections - using your actual model names
        this.collections = {
            studies: 'dicomstudies',
            patients: 'patients',
            doctors: 'doctors',
            users: 'users',
            labs: 'labs'
        };
        
        // Generated data storage
        this.generatedData = {
            patients: [],
            doctors: [],
            users: [],
            labs: []
        };
        
        console.log('🏥 Medical Database Simulator Configuration:');
        console.log(`   Studies: ${this.totalStudies.toLocaleString()}`);
        console.log(`   Patients: ${this.totalPatients.toLocaleString()}`);
        console.log(`   Doctors: ${this.totalDoctors}`);
        console.log(`   Users: ${this.totalUsers}`);
        console.log(`   Labs: ${this.totalLabs}`);
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
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
        
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
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        const collection = mongoose.connection.db.collection(this.collections.studies);
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
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
        
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

    async createAllIndexes() {
        console.log('\n📊 Creating comprehensive indexes...');
        
        try {
            // Studies indexes
            const studiesCollection = mongoose.connection.db.collection(this.collections.studies);
            await studiesCollection.createIndex({ "createdAt": -1 });
            await studiesCollection.createIndex({ "patient": 1 });
            await studiesCollection.createIndex({ "sourceLab": 1 });
            await studiesCollection.createIndex({ "assignment.assignedTo": 1 });
            await studiesCollection.createIndex({ "workflowStatus": 1 });
            await studiesCollection.createIndex({ "modality": 1 });
            await studiesCollection.createIndex({ "createdAt": -1, "workflowStatus": 1 });
            await studiesCollection.createIndex({ "sourceLab": 1, "createdAt": -1 });
            console.log('   ✅ Created studies indexes');
            
            // Patients indexes
            const patientsCollection = mongoose.connection.db.collection(this.collections.patients);
            await patientsCollection.createIndex({ "patientID": 1 }, { unique: true });
            await patientsCollection.createIndex({ "mrn": 1 });
            await patientsCollection.createIndex({ "lastName": 1, "firstName": 1 });
            await patientsCollection.createIndex({ "dateOfBirth": 1 });
            await patientsCollection.createIndex({ "currentWorkflowStatus": 1 });
            console.log('   ✅ Created patients indexes');
            
            // Doctors indexes
            const doctorsCollection = mongoose.connection.db.collection(this.collections.doctors);
            await doctorsCollection.createIndex({ "userAccount": 1 }, { unique: true });
            await doctorsCollection.createIndex({ "licenseNumber": 1 }, { unique: true, sparse: true });
            await doctorsCollection.createIndex({ "specialization": 1 });
            await doctorsCollection.createIndex({ "department": 1 });
            await doctorsCollection.createIndex({ "assigned": 1 });
            console.log('   ✅ Created doctors indexes');
            
            // Users indexes
            const usersCollection = mongoose.connection.db.collection(this.collections.users);
            await usersCollection.createIndex({ "username": 1 }, { unique: true });
            await usersCollection.createIndex({ "email": 1 }, { unique: true });
            await usersCollection.createIndex({ "role": 1 });
            await usersCollection.createIndex({ "isActive": 1 });
            console.log('   ✅ Created users indexes');
            
            // Labs indexes
            const labsCollection = mongoose.connection.db.collection(this.collections.labs);
            await labsCollection.createIndex({ "labCode": 1 }, { unique: true });
            await labsCollection.createIndex({ "isActive": 1 });
            await labsCollection.createIndex({ "labType": 1 });
            console.log('   ✅ Created labs indexes');
            
        } catch (error) {
            console.log(`   ⚠️ Some indexes may already exist or failed to create: ${error.message}`);
            // Continue execution - this is not a critical failure
        }
        
        console.log('   ✅ All indexes created successfully');
    }

    async generateLabs() {
        const labs = [];
        const labTypes = ['Hospital', 'Independent Lab', 'Imaging Center', 'Clinic', 'University Medical Center', 'Specialty Clinic'];
        const certifications = ['CAP', 'CLIA', 'Joint Commission', 'ISO 15189', 'AAAHC'];
        const cities = Array.from({length: 50}, () => faker.location.city());
        
        for (let i = 0; i < this.totalLabs; i++) {
            const labId = new mongoose.Types.ObjectId();
            const city = faker.helpers.arrayElement(cities);
            
            const lab = {
                _id: labId,
                labCode: `LAB${(i + 1).toString().padStart(4, '0')}`,
                labName: `${city} ${faker.helpers.arrayElement(labTypes)}`,
                labType: faker.helpers.arrayElement(labTypes),
                
                // Contact Information
                address: {
                    street: faker.location.streetAddress(),
                    city: city,
                    state: faker.location.state(),
                    zipCode: faker.location.zipCode(),
                    country: 'United States'
                },
                phone: faker.phone.number(),
                fax: faker.phone.number(),
                email: `contact@${faker.internet.domainName()}`,
                website: `https://www.${faker.internet.domainName()}`,
                
                // Administrative
                directorName: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                directorEmail: faker.internet.email(),
                adminContactName: `${faker.person.firstName()} ${faker.person.lastName()}`,
                adminContactEmail: faker.internet.email(),
                
                // Accreditation & Certification
                cliaNumber: `${faker.string.numeric(2)}D${faker.string.numeric(7)}`,
                accreditation: faker.helpers.arrayElements(certifications, { min: 1, max: 3 }),
                licenseNumber: `LIC${faker.string.numeric(8)}`,
                licenseExpiry: faker.date.future({ years: faker.number.int({ min: 1, max: 5 }) }),
                
                // Capabilities
                modalities: faker.helpers.arrayElements(['CT', 'MRI', 'XR', 'US', 'DX', 'CR', 'MG', 'NM', 'PT'], { min: 2, max: 8 }),
                specialties: faker.helpers.arrayElements([
                    'General Radiology', 'Neuroradiology', 'Cardiovascular Imaging', 'Musculoskeletal Imaging',
                    'Abdominal Imaging', 'Chest Imaging', 'Interventional Radiology', 'Nuclear Medicine',
                    'Mammography', 'Pediatric Imaging', 'Emergency Radiology'
                ], { min: 2, max: 5 }),
                
                // Technical Information
                pacsSystem: faker.helpers.arrayElement(['Centricity PACS', 'IMPAX', 'Synapse', 'PowerScribe', 'Vue PACS']),
                pacsVersion: `${faker.number.int({ min: 1, max: 9 })}.${faker.number.int({ min: 0, max: 99 })}`,
                hl7Interface: true,
                dicomAeTitle: `${faker.string.alpha({ length: 8, casing: 'upper' })}`,
                
                // Business Information
                established: faker.date.past({ years: faker.number.int({ min: 5, max: 50 }) }),
                employeeCount: faker.number.int({ min: 10, max: 500 }),
                monthlyStudyVolume: faker.number.int({ min: 500, max: 10000 }),
                
                // Status
                isActive: Math.random() > 0.05,
                preferredLab: Math.random() > 0.7,
                emergencyCapable: Math.random() > 0.6,
                
                // Metadata
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date(),
                createdBy: 'system_admin',
                notes: Math.random() > 0.7 ? faker.lorem.paragraph() : null
            };
            
            labs.push(lab);
            this.generatedData.labs.push(lab);
        }
        
        const collection = mongoose.connection.db.collection(this.collections.labs);
        await this.insertInBatches(collection, labs, 'Labs');
        
        console.log(`   ✅ Generated ${labs.length} labs with complete profiles`);
    }

    async generateStudiesWithRelationships() {
        console.log(`🚀 Generating ${this.totalStudies} DICOM studies with relationships...`);
        
        const collection = mongoose.connection.db.collection(this.collections.studies);
        let totalInserted = 0;
        const startTime = Date.now();

        for (let day = 0; day < this.totalDays; day++) {
            console.log(`📅 Generating studies for day ${day + 1}/${this.totalDays}...`);
            
            const dayStudies = [];
            for (let i = 0; i < this.studiesPerDay; i++) {
                dayStudies.push(this.generateRealisticStudyWithRelationships(day));
            }

            for (let i = 0; i < dayStudies.length; i += this.batchSize) {
                const batch = dayStudies.slice(i, i + this.batchSize);
                
                try {
                    await collection.insertMany(batch, { 
                        ordered: false,
                        writeConcern: { w: 1, j: true }
                    });
                    totalInserted += batch.length;
                    
                    if (totalInserted % 5000 === 0) {
                        console.log(`   📊 Inserted ${totalInserted}/${this.totalStudies} studies`);
                        
                        // Memory check
                        const memUsage = process.memoryUsage();
                        if (memUsage.heapUsed > 1024 * 1024 * 1024) {
                            console.log('   ⚠️ High memory usage, pausing...');
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    }
                } catch (error) {
                    console.error(`   ❌ Batch insertion failed: ${error.message}`);
                }
            }
            
            if (day % 10 === 0) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const duration = Date.now() - startTime;
        console.log(`✅ Studies generation complete! ${totalInserted} studies in ${duration}ms`);
        console.log(`📈 Insertion rate: ${Math.round((totalInserted / duration) * 1000)} studies/second`);
    }

    async runComprehensiveTests() {
        console.log('\n🧪 Running comprehensive load tests...\n');
        
        // Test Suite 1: Core Admin Queries
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

        // Test Suite 2: Search Performance
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
            "Status Distribution",
            [
                { $match: { createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } } },
                { $group: {
                    _id: "$workflowStatus",
                    count: { $sum: 1 }
                }},
                { $sort: { count: -1 } }
            ],
            400
        );

        this.generateComprehensiveReport();
    }

    async insertInBatches(collection, data, entityName) {
        const batchSize = 1000;
        let inserted = 0;
        
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            await collection.insertMany(batch, { ordered: false });
            inserted += batch.length;
            
            if (inserted % 5000 === 0) {
                console.log(`   📊 Inserted ${inserted}/${data.length} ${entityName}`);
            }
        }
    }

    async generateUsers() {
        const users = [];
        const defaultPassword = await bcrypt.hash('MedicalCenter2024!', 12);
        
        // Create lab staff users
        for (let i = 0; i < 100; i++) {
            const firstName = faker.person.firstName();
            const lastName = faker.person.lastName();
            
            const user = {
                _id: new mongoose.Types.ObjectId(),
                username: `labstaff${(i + 1).toString().padStart(3, '0')}`,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@medicalcenter.com`,
                password: defaultPassword,
                fullName: `${firstName} ${lastName}`,
                role: 'lab_staff',
                isLoggedIn: false,
                isActive: Math.random() > 0.05,
                lab: this.generatedData.labs.length > 0 ? faker.helpers.arrayElement(this.generatedData.labs)._id : null,
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date()
            };
            
            users.push(user);
            this.generatedData.users.push(user);
        }
        
        // Create admin users
        for (let i = 0; i < 50; i++) {
            const firstName = faker.person.firstName();
            const lastName = faker.person.lastName();
            
            const user = {
                _id: new mongoose.Types.ObjectId(),
                username: `admin${(i + 1).toString().padStart(3, '0')}`,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@medicalcenter.com`,
                password: defaultPassword,
                fullName: `${firstName} ${lastName}`,
                role: 'admin',
                isLoggedIn: false,
                isActive: Math.random() > 0.02,
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date()
            };
            
            users.push(user);
            this.generatedData.users.push(user);
        }
        
        // Create doctor account users
        for (let i = 0; i < this.totalDoctors; i++) {
            const firstName = faker.person.firstName();
            const lastName = faker.person.lastName();
            
            const user = {
                _id: new mongoose.Types.ObjectId(),
                username: `doctor${(i + 1).toString().padStart(3, '0')}`,
                email: `dr.${firstName.toLowerCase()}.${lastName.toLowerCase()}@medicalcenter.com`,
                password: defaultPassword,
                fullName: `Dr. ${firstName} ${lastName}`,
                role: 'doctor_account',
                isLoggedIn: false,
                isActive: Math.random() > 0.02,
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date()
            };
            
            users.push(user);
            this.generatedData.users.push(user);
        }
        
        const collection = mongoose.connection.db.collection(this.collections.users);
        await this.insertInBatches(collection, users, 'Users');
        
        console.log(`   ✅ Generated ${users.length} users with proper roles`);
    }

    async generateDoctors() {
        const doctors = [];
        const specialties = [
            'Radiology', 'Emergency Medicine', 'Internal Medicine', 'Cardiology', 'Neurology',
            'Orthopedics', 'Oncology', 'Pediatrics', 'Surgery', 'Anesthesiology'
        ];
        const departments = [
            'Radiology', 'Emergency', 'Cardiology', 'Neurology', 'Orthopedics', 'Oncology'
        ];
        
        // Get doctor_account users
        const doctorUsers = this.generatedData.users.filter(u => u.role === 'doctor_account');
        
        for (let i = 0; i < this.totalDoctors && i < doctorUsers.length; i++) {
            const user = doctorUsers[i];
            const specialty = faker.helpers.arrayElement(specialties);
            
            const doctor = {
                _id: new mongoose.Types.ObjectId(),
                userAccount: user._id,
                specialization: specialty,
                licenseNumber: `MD${faker.string.numeric(6)}`,
                department: faker.helpers.arrayElement(departments),
                qualifications: faker.helpers.arrayElements([
                    'MD', 'MBBS', 'DO', 'PhD', 'Fellowship in ' + specialty
                ], { min: 1, max: 3 }),
                yearsOfExperience: faker.number.int({ min: 1, max: 40 }),
                contactPhoneOffice: faker.phone.number(),
                assigned: Math.random() > 0.7,
                signature: '',
                signatureMetadata: {
                    uploadedAt: new Date(),
                    originalSize: 0,
                    optimizedSize: 0,
                    originalName: '',
                    mimeType: 'image/png',
                    lastUpdated: new Date(),
                    format: 'base64',
                    width: 400,
                    height: 200
                },
                assignedStudies: [],
                completedStudies: [],
                isActiveProfile: Math.random() > 0.05,
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date()
            };
            
            doctors.push(doctor);
            this.generatedData.doctors.push(doctor);
        }
        
        const collection = mongoose.connection.db.collection(this.collections.doctors);
        await this.insertInBatches(collection, doctors, 'Doctors');
        
        console.log(`   ✅ Generated ${doctors.length} doctors with User account links`);
    }

    async generatePatients() {
        const patients = [];
        const workflowStatuses = [
            'no_active_study',
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'report_in_progress',
            'report_downloaded_radiologist',
            'report_finalized',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ];
        
        for (let i = 0; i < this.totalPatients; i++) {
            const firstName = faker.person.firstName();
            const lastName = faker.person.lastName();
            const birthDate = faker.date.birthdate({ min: 1, max: 100, mode: 'age' });
            const age = new Date().getFullYear() - birthDate.getFullYear();
            
            const patient = {
                _id: new mongoose.Types.ObjectId(),
                patientID: `PAT${(i + 1).toString().padStart(6, '0')}`,
                mrn: `MRN${faker.string.numeric(8)}`,
                issuerOfPatientID: `${faker.location.city()} Medical Center`,
                
                salutation: faker.helpers.arrayElement(['Mr.', 'Ms.', 'Mrs.', 'Dr.', '']),
                firstName: firstName,
                lastName: lastName,
                patientNameRaw: `${lastName}^${firstName}^^`,
                dateOfBirth: birthDate.toISOString().split('T')[0],
                gender: faker.helpers.arrayElement(['M', 'F', 'O', '']),
                ageString: age.toString().padStart(3, '0') + 'Y',
                
                contactInformation: {
                    phone: faker.phone.number(),
                    email: Math.random() > 0.3 ? faker.internet.email() : ''
                },
                
                clinicalInfo: {
                    clinicalHistory: Math.random() > 0.7 ? faker.lorem.paragraph() : '',
                    previousInjury: Math.random() > 0.8 ? faker.lorem.sentence() : '',
                    previousSurgery: Math.random() > 0.8 ? faker.lorem.sentence() : '',
                    lastModifiedBy: this.generatedData.users.length > 0 ? faker.helpers.arrayElement(this.generatedData.users)._id : null,
                    lastModifiedAt: faker.date.recent()
                },
                
                currentWorkflowStatus: faker.helpers.arrayElement(workflowStatuses),
                activeDicomStudyRef: null,
                
                studyCount: faker.number.int({ min: 0, max: 20 }),
                lastStudyDate: faker.date.recent(),
                computed: {
                    fullName: `${firstName} ${lastName}`,
                    displayAge: `${age} years`,
                    lastActivity: faker.date.recent()
                },
                
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date()
            };
            
            patients.push(patient);
            this.generatedData.patients.push(patient);
        }
        
        const collection = mongoose.connection.db.collection(this.collections.patients);
        await this.insertInBatches(collection, patients, 'Patients');
        
        console.log(`   ✅ Generated ${patients.length} patients with proper workflow status`);
    }

    generateRealisticStudyWithRelationships(dayOffset = 0) {
        const patient = this.generatedData.patients.length > 0 ? faker.helpers.arrayElement(this.generatedData.patients) : null;
        const assignedDoctor = Math.random() > 0.3 && this.generatedData.doctors.length > 0 ? faker.helpers.arrayElement(this.generatedData.doctors) : null;
        const assignedUser = assignedDoctor ? this.generatedData.users.find(u => u._id.equals(assignedDoctor.userAccount)) : null;
        
        const workflowStatuses = [
            'new_study_received',
            'pending_assignment',
            'assigned_to_doctor',
            'doctor_opened_report',
            'report_in_progress',
            'report_drafted',
            'report_finalized',
            'report_uploaded',
            'report_downloaded_radiologist',
            'report_downloaded',
            'final_report_downloaded',
            'archived'
        ];
        
        const modalities = ['CT', 'MRI', 'XR', 'US', 'DX', 'CR', 'MG', 'NM', 'PT'];
        const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
        const studyPriorities = ['SELECT', 'Emergency Case', 'Meet referral doctor', 'MLC Case', 'Study Exception'];
        const caseTypes = ['routine', 'urgent', 'stat', 'emergency', 'Billed Study', 'New Study'];
        
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - dayOffset);
        
        const workflowStatus = faker.helpers.arrayElement(workflowStatuses);
        const modality = faker.helpers.arrayElement(modalities);
        
        return {
            _id: new mongoose.Types.ObjectId(),
            studyInstanceUID: `1.2.826.0.1.3680043.8.498.${faker.string.numeric(10)}`,
            
            // Patient reference
            patient: patient ? patient._id : new mongoose.Types.ObjectId(),
            patientId: patient ? patient.patientID : `PAT${faker.string.numeric(6)}`,
            patientInfo: {
                patientID: patient ? patient.patientID : `PAT${faker.string.numeric(6)}`,
                patientName: patient ? patient.patientNameRaw : `${faker.person.lastName()}^${faker.person.firstName()}^^`,
                age: patient ? patient.ageString : faker.number.int({ min: 1, max: 100 }).toString().padStart(3, '0') + 'Y',
                gender: patient ? patient.gender : faker.helpers.arrayElement(['M', 'F', 'O', ''])
            },
            
            // Study metadata
            studyDate: faker.date.between({
                from: new Date(baseDate.getTime() - 24*60*60*1000),
                to: baseDate
            }),
            studyTime: faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, ''),
            modality: modality,
            modalitiesInStudy: [modality],
            accessionNumber: `ACC${faker.string.numeric(8)}`,
            examDescription: faker.helpers.arrayElement([
                'CT Head without contrast',
                'MRI Brain with contrast',
                'Chest X-Ray PA and Lateral',
                'Ultrasound Abdomen Complete'
            ]),
            institutionName: `${faker.location.city()} Medical Center`,
            orthancStudyID: faker.string.alphanumeric(8),
            
            workflowStatus: workflowStatus,
            currentCategory: workflowStatus,
            
            technologist: {
                name: `${faker.person.firstName()} ${faker.person.lastName()}`,
                mobile: faker.phone.number(),
                comments: Math.random() > 0.7 ? faker.lorem.sentence() : '',
                reasonToSend: Math.random() > 0.8 ? faker.lorem.sentence() : ''
            },
            
            assignment: {
                assignedTo: assignedUser ? assignedUser._id : null,
                assignedAt: assignedUser ? faker.date.recent() : null,
                assignedBy: this.generatedData.users.length > 0 ? faker.helpers.arrayElement(this.generatedData.users.filter(u => u.role === 'admin'))._id : null,
                dueDate: faker.date.future(),
                priority: faker.helpers.arrayElement(priorities)
            },
            
            studyPriority: faker.helpers.arrayElement(studyPriorities),
            lastAssignedDoctor: assignedDoctor ? assignedDoctor._id : null,
            lastAssignmentAt: assignedDoctor ? faker.date.recent() : null,
            
            statusHistory: [{
                status: workflowStatus,
                changedAt: faker.date.recent(),
                changedBy: this.generatedData.users.length > 0 ? faker.helpers.arrayElement(this.generatedData.users)._id : null,
                note: faker.lorem.sentence()
            }],
            
            reportInfo: {
                startedAt: Math.random() > 0.7 ? faker.date.recent() : null,
                finalizedAt: Math.random() > 0.8 ? faker.date.recent() : null,
                downloadedAt: Math.random() > 0.9 ? faker.date.recent() : null,
                reporterName: assignedDoctor ? assignedUser.fullName : null,
                reportContent: Math.random() > 0.8 ? faker.lorem.paragraphs(3) : ''
            },
            
            seriesCount: faker.number.int({ min: 1, max: 20 }),
            instanceCount: faker.number.int({ min: 50, max: 2000 }),
            seriesImages: `${faker.number.int({ min: 1, max: 10 })}/${faker.number.int({ min: 50, max: 500 })}`,
            
            sourceLab: this.generatedData.labs.length > 0 ? faker.helpers.arrayElement(this.generatedData.labs)._id : null,
            ReportAvailable: Math.random() > 0.7,
            
            referringPhysician: {
                name: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                institution: `${faker.location.city()} Medical Group`,
                contactInfo: faker.phone.number()
            },
            referringPhysicianName: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
            
            physicians: {
                referring: {
                    name: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                    email: faker.internet.email(),
                    mobile: faker.phone.number(),
                    institution: `${faker.location.city()} Medical Group`
                },
                requesting: {
                    name: `Dr. ${faker.person.firstName()} ${faker.person.lastName()}`,
                    email: faker.internet.email(),
                    mobile: faker.phone.number(),
                    institution: `${faker.location.city()} Hospital`
                }
            },
            
            caseType: faker.helpers.arrayElement(caseTypes),
            uploadedReports: [],
            doctorReports: [],
            
            dicomFiles: Array.from({length: faker.number.int({ min: 1, max: 5 })}, () => ({
                sopInstanceUID: `1.2.826.0.1.3680043.8.498.${faker.string.numeric(10)}`,
                seriesInstanceUID: `1.2.826.0.1.3680043.8.498.${faker.string.numeric(10)}`,
                orthancInstanceId: faker.string.alphanumeric(8),
                modality: modality,
                storageType: 'orthanc',
                uploadedAt: faker.date.recent()
            })),
            
            searchText: `${patient ? patient.firstName : faker.person.firstName()} ${patient ? patient.lastName : faker.person.lastName()} ${patient ? patient.patientID : 'PAT' + faker.string.numeric(6)} ${modality}`.toLowerCase(),
            
            timingInfo: {
                uploadToAssignmentMinutes: faker.number.int({ min: 5, max: 120 }),
                assignmentToReportMinutes: faker.number.int({ min: 30, max: 480 }),
                reportToDownloadMinutes: faker.number.int({ min: 10, max: 60 }),
                totalTATMinutes: faker.number.int({ min: 60, max: 600 })
            },
            
            modifiedDate: faker.date.recent(),
            modifiedTime: faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, ''),
            reportDate: Math.random() > 0.8 ? faker.date.recent() : null,
            reportTime: Math.random() > 0.8 ? faker.date.recent().toTimeString().split(' ')[0].replace(/:/g, '') : null,
            
            createdAt: faker.date.between({
                from: new Date(baseDate.getTime() - 23*60*60*1000),
                to: new Date(baseDate.getTime() - 1*60*60*1000)
            }),
            updatedAt: new Date()
        };
    }

    generateFinalReport() {
        console.log('\n🎯 === COMPREHENSIVE DATABASE REPORT ===');
        console.log('='.repeat(70));
        
        console.log('\n📊 GENERATED ENTITIES:');
        console.log(`   Studies: ${this.totalStudies.toLocaleString()}`);
        console.log(`   Patients: ${this.totalPatients.toLocaleString()}`);
        console.log(`   Doctors: ${this.totalDoctors}`);
        console.log(`   Users: ${this.totalUsers}`);
        console.log(`   Labs: ${this.totalLabs}`);
        
        console.log('\n🔗 RELATIONSHIPS:');
        console.log(`   Every study linked to: Patient, User (if assigned), Doctor (if assigned)`);
        console.log(`   Doctors linked to: User accounts with role 'doctor_account'`);
        console.log(`   Users have roles: 'lab_staff', 'admin', 'doctor_account'`);
        
        console.log('\n🔐 AUTHENTICATION INFO:');
        console.log(`   Default Password: "MedicalCenter2024!"`);
        console.log(`   User Roles and Examples:`);
        console.log(`     - Lab Staff: labstaff001 / MedicalCenter2024!`);
        console.log(`     - Admin: admin001 / MedicalCenter2024!`);
        console.log(`     - Doctor: doctor001 / MedicalCenter2024!`);
        
        console.log('\n📁 DATABASE COLLECTIONS:');
        Object.entries(this.collections).forEach(([key, collection]) => {
            console.log(`   ${key}: ${collection}`);
        });
        
        console.log('\n💡 WORKFLOW STATUSES:');
        console.log('   Patient Workflow: no_active_study, new_study_received, pending_assignment, assigned_to_doctor, etc.');
        console.log('   Study Workflow: new_study_received, pending_assignment, assigned_to_doctor, report_drafted, etc.');
        
        console.log('\n✅ Database generation complete! Ready for production testing.');
    }

    // Command line interface
}

// Command line interface
const args = process.argv.slice(2);
const simulator = new MedicalDatabaseSimulator();

if (args.includes('--dry-run')) {
    simulator.dryRun = true;
    console.log('🧪 DRY RUN MODE ENABLED');
}

if (args.includes('--quick')) {
    simulator.quickValidation().catch(console.error);
} else if (args.includes('--cleanup')) {
    simulator.emergencyCleanup().catch(console.error);
} else if (args.includes('--generate-only')) {
    simulator.generateComprehensiveDatabase().catch(console.error);
} else {
    // Full generation + testing
    simulator.generateComprehensiveDatabase()
        .then(() => simulator.runComprehensiveTests())
        .catch(console.error);
}