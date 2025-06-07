// models/Lab.model.js
import mongoose from 'mongoose';

const LabSchema = new mongoose.Schema({
    name: { // e.g., "City General Hospital Radiology", "Downtown Imaging Center Orthanc"
        type: String,
        required: [true, 'Laboratory name is required'],
        unique: true,
        trim: true,
    },
    identifier: { // A unique machine-friendly identifier, e.g., "CGH_RAD", "DT_IMG_ORTHANC"
                  // This could be used in API keys or to identify the source of a ping.
        type: String,
        required: [true, 'Laboratory identifier is required'],
        unique: true,
        trim: true,
        uppercase: true,
        index: true,
    },
    // Configuration specific to this lab, if any
    // For example, if this lab's Orthanc instance has a specific AE Title you need to record
    // orthancAETitle: {
    //     type: String,
    //     trim: true,
    // },
    contactPerson: {
        type: String,
        trim: true,
    },
    contactEmail: {
        type: String,
        trim: true,
        lowercase: true,
    },
    contactPhone: {
        type: String,
        trim: true,
    },
    address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
    },
    isActive: { // To enable/disable integration with this lab
        type: Boolean,
        default: true,
    },
    // If Orthanc pings your system, and different labs have different API keys for that ping:
    // incomingApiKeyHash: { // Store a hash of the API key they use to ping you
    //     type: String,
    //     // select: false // Don't return by default
    // },
    notes: { // Any internal notes about this lab
        type: String,
        trim: true,
    }
}, { timestamps: true });

const Lab = mongoose.model('Lab', LabSchema);
export default Lab;