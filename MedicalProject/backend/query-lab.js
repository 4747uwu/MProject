import mongoose from 'mongoose';
import Lab from './models/labModel.js';
import User from './models/userModel.js';

await mongoose.connect('mongodb://alice:alicePassword@64.227.187.164:27017/medical_project?authSource=admin&directConnection=true', {
    serverSelectionTimeoutMS: 30000,
});
console.log('Connected.');

const lab = await Lab.findOne({ identifier: 'STR8' }).lean();
if (!lab) {
    console.log('No lab found with identifier STR8');
    process.exit(0);
}

console.log('\n--- Lab Details ---');
console.log(JSON.stringify(lab, null, 2));

const users = await User.find({ lab: lab._id }).lean();
console.log('\n--- Associated Users ---');
console.log(JSON.stringify(users, null, 2));

process.exit(0);
