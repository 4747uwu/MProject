// seeder-add-only.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
// colors package and its usage removed

dotenv.config();

// Make sure these paths are correct relative to your seeder script
import User from './models/userModel.js';
import Lab from './models/labModel.js';
import Doctor from './models/doctorModel.js';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`MongoDB Connected for Seeder: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB for Seeder: ${error.message}`);
        process.exit(1);
    }
};

// --- Data Definitions ---
const labsData = [
    { name: "Alpha Diagnostics", identifier: "ALPHA", contactPerson: "Alice Alpha", address: { city: "Alphaville"} },
    { name: "Beta Labs", identifier: "BETA", contactPerson: "Bob Beta", address: { city: "Betatown"} },
];

const usersData = [
    { username: 'superadmin', email: 'superadmin@example.com', password: 'password123', fullName: 'Super Administrator', role: 'admin', isActive: true },
    { username: 'doc_gamma', email: 'doc.gamma@example.com', password: 'password123', fullName: 'Dr. Gamma Ray', role: 'doctor_account', isActive: true },
    { username: 'lab_alpha_user', email: 'staff@alpha.com', password: 'password123', fullName: 'Alpha Lab Staff', role: 'lab_staff', labIdentifierForLookup: "ALPHA", isActive: true },
    // Note: For 'lab_alpha_user', the lab with identifier "ALPHA" should be in labsData or already exist
];

const doctorsData = [
    { userAccountUsernameForLookup: 'doc_gamma', specialization: 'Oncology', licenseNumber: 'ONC777G', department: 'Cancer Care' },
    // Note: For this doctor, the user with username "doc_gamma" should be in usersData or already exist
];

const seedCollection = async (Model, data, uniqueKeyField, displayName) => {
    let createdCount = 0;
    let skippedCount = 0;

    for (const itemData of data) {
        const query = {};
        // Ensure the uniqueKeyField exists in itemData before trying to access it
        if (itemData[uniqueKeyField] === undefined && !(Model.modelName === 'Doctor' && itemData.userAccountUsernameForLookup)) {
             console.log(`Skipping item for ${displayName}: unique key field "${uniqueKeyField}" is missing from data: ${JSON.stringify(itemData)}`);
             skippedCount++;
             continue;
        }
        query[uniqueKeyField] = itemData[uniqueKeyField];

        let finalItemData = { ...itemData };

        if (Model.modelName === 'Doctor' && itemData.userAccountUsernameForLookup) {
            const userAccount = await User.findOne({ username: itemData.userAccountUsernameForLookup, role: 'doctor_account' });
            if (!userAccount) {
                console.log(`Skipping doctor for username "${itemData.userAccountUsernameForLookup}" (user account not found or not doctor_account).`);
                skippedCount++;
                continue;
            }
            finalItemData.userAccount = userAccount._id;
            delete finalItemData.userAccountUsernameForLookup;
            // The unique key for Doctor profile is licenseNumber
            query[uniqueKeyField] = finalItemData[uniqueKeyField]; // This should be licenseNumber
            if (!finalItemData.licenseNumber) {
                console.log(`Skipping doctor for user "${itemData.userAccountUsernameForLookup}": licenseNumber is missing.`);
                skippedCount++;
                continue;
            }
        } else if (Model.modelName === 'User' && itemData.role === 'lab_staff' && itemData.labIdentifierForLookup) {
            const lab = await Lab.findOne({ identifier: itemData.labIdentifierForLookup });
            if (!lab) {
                console.log(`Skipping lab staff "${itemData.username}" (lab "${itemData.labIdentifierForLookup}" not found).`);
                skippedCount++;
                continue;
            }
            finalItemData.lab = lab._id;
            delete finalItemData.labIdentifierForLookup;
        }

        // Check for existence based on the potentially modified query (e.g., for Doctor)
        const exists = await Model.findOne(query);
        if (!exists) {
            try {
                await Model.create(finalItemData);
                createdCount++;
            } catch (e) {
                // Log the actual itemData that caused the error for better debugging
                console.error(`Error creating ${displayName} with data ${JSON.stringify(finalItemData)}: ${e.message}`);
                skippedCount++;
            }
        } else {
            skippedCount++;
        }
    }
    if (createdCount > 0) console.log(`${createdCount} new ${displayName}(s) created.`);
    if (skippedCount > 0) console.log(`${skippedCount} ${displayName}(s) already existed, had issues, or prerequisites were missing, skipped.`);
};

const importData = async () => {
    try {
        console.log('Seeding data (add only if not exists)...');

        // Order matters: Labs first, then Users (who might link to Labs), then Doctors (who link to Users)
        await seedCollection(Lab, labsData, 'identifier', 'Lab');
        await seedCollection(User, usersData, 'username', 'User'); // Unique check by username
        await seedCollection(Doctor, doctorsData, 'licenseNumber', 'Doctor Profile'); // Unique check by licenseNumber

        console.log('Data seeding process complete!');
        process.exit(0); // Success
    } catch (error) {
        console.error(`Error during data import: ${error}`);
        process.exit(1); // Failure
    }
};

const runSeeder = async () => {
    await connectDB();
    await importData();
};

runSeeder();