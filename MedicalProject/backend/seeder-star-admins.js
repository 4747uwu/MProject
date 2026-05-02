// seeder-star-admins.js
// Creates uttamadmin and prashantadmin as admin users for starradiology.com
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import User from './models/userModel.js';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect('mongodb://alice:alicePassword@64.227.187.164:27017/medical_project?authSource=admin&directConnection=true', {
            serverSelectionTimeoutMS: 5000,
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`DB connection error: ${error.message}`);
        process.exit(1);
    }
};

const adminsData = [
    {
        username: 'uttamadmin',
        email: 'uttamadmin@starradiology.com',
        password: 'StarAdmin@2024',
        fullName: 'Uttam Admin',
        role: 'admin',
        isActive: true,
    },
    {
        username: 'prashantadmin',
        email: 'prashantadmin@starradiology.com',
        password: 'StarAdmin@2024',
        fullName: 'Prashant Admin',
        role: 'admin',
        isActive: true,
    },
];

const seedAdmins = async () => {
    let created = 0;
    let skipped = 0;

    for (const adminData of adminsData) {
        const exists = await User.findOne({
            $or: [{ username: adminData.username }, { email: adminData.email }],
        });

        if (!exists) {
            try {
                await User.create(adminData);
                console.log(`Created admin: ${adminData.email}`);
                created++;
            } catch (e) {
                console.error(`Error creating ${adminData.email}: ${e.message}`);
                skipped++;
            }
        } else {
            console.log(`Already exists, skipped: ${adminData.email}`);
            skipped++;
        }
    }

    console.log(`\nDone — ${created} created, ${skipped} skipped.`);
};

const run = async () => {
    await connectDB();
    await seedAdmins();
    process.exit(0);
};

run();
