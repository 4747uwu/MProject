// Inside your routes/orthanc.routes.js

import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// --- Configuration ---
const ORTHANC_BASE_URL = process.env.ORTHANC_URL || 'http://localhost:8042';
const ORTHANC_USERNAME = process.env.ORTHANC_USERNAME || 'alice';
const ORTHANC_PASSWORD = process.env.ORTHANC_PASSWORD || 'alicePassword';
const orthancAuth = 'Basic ' + Buffer.from(ORTHANC_USERNAME + ':' + ORTHANC_PASSWORD).toString('base64');
const storagePath = './dicom-files';

if (!fs.existsSync(storagePath)) {
  try {
    fs.mkdirSync(storagePath, { recursive: true });
    console.log(`[NodeApp] Created DICOM storage directory: ${storagePath}`);
  } catch (err) {
    console.error(`[NodeApp] Error creating DICOM storage directory ${storagePath}:`, err);
  }
}
// --- End Configuration ---

router.post('/new-dicom', async (req, res) => {
  const routeName = '/new-dicom-parallel'; // For easier logging
  console.log(`[NodeApp ${routeName}] Received request. Body:`, req.body);

  let receivedOrthancInstanceId = null;
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    receivedOrthancInstanceId = Object.keys(req.body)[0];
  }

  if (!receivedOrthancInstanceId || typeof receivedOrthancInstanceId !== 'string' || receivedOrthancInstanceId.trim() === '') {
    const msg = `[NodeApp ${routeName}] ❌ Invalid or empty Orthanc Instance ID extracted.`;
    console.error(msg);
    return res.status(400).json({ error: msg });
  }

  const currentOrthancInstanceId = receivedOrthancInstanceId.trim();
  let savedFilePath = null; // To store the path if file is saved successfully

  try {
    // --- Define URLs ---
    const metadataUrl = `${ORTHANC_BASE_URL}/instances/${currentOrthancInstanceId}/simplified-tags`;
    const fileUrl = `${ORTHANC_BASE_URL}/instances/${currentOrthancInstanceId}/file`;

    console.log(`[NodeApp ${routeName}] Preparing parallel requests for Orthanc ID: ${currentOrthancInstanceId}`);
    console.log(`[NodeApp ${routeName}]   Metadata URL: ${metadataUrl}`);
    console.log(`[NodeApp ${routeName}]   File URL: ${fileUrl}`);

    // --- Perform requests in parallel using Promise.all ---
    const [metadataResponse, fileResponse] = await Promise.all([
      axios.get(metadataUrl, {
        headers: { 'Authorization': orthancAuth }
      }),
      axios.get(fileUrl, {
        responseType: 'arraybuffer', // Crucial for file download
        headers: { 'Authorization': orthancAuth }
      })
    ]);

    // --- Process Metadata ---
    const instanceMetadata = metadataResponse.data;
    console.log(`[NodeApp ${routeName}] ✅ Metadata fetched successfully.`);
    // console.log(JSON.stringify(instanceMetadata, null, 2)); // Optionally log full metadata

    // Extract SOPInstanceUID from metadata for a better filename (recommended)
    const sopInstanceUID = instanceMetadata.SOPInstanceUID || currentOrthancInstanceId; // Fallback to Orthanc ID

    // --- Process and Save File ---
    const dicomFileBuffer = fileResponse.data; // This is an ArrayBuffer
    savedFilePath = path.join(storagePath, `${sopInstanceUID}.dcm`); // Use DICOM UID
    fs.writeFileSync(savedFilePath, Buffer.from(dicomFileBuffer)); // Convert ArrayBuffer to Node.js Buffer for fs
    console.log(`[NodeApp ${routeName}] ✅ DICOM file downloaded and saved to: ${savedFilePath}`);


    // --- Respond to Client ---
    res.status(200).json({
      message: 'Successfully fetched metadata and downloaded DICOM file in parallel.',
      orthancInstanceId: currentOrthancInstanceId,
      dicomSopInstanceUID: sopInstanceUID,
      filePath: savedFilePath,
      metadata: instanceMetadata
    });

  } catch (error) {
    let errorMessage = 'Error processing DICOM instance';
    let statusCode = 500;
    let errorDetails = {};

    if (axios.isAxiosError(error)) {
      errorMessage = `Axios error: ${error.message}`;
      statusCode = error.response?.status || 500;
      errorDetails = {
        url: error.config?.url, // URL of the failed request
        method: error.config?.method,
        responseStatus: error.response?.status,
        responseData: error.response?.data
      };
      // Identify which request failed if possible (though Promise.all rejects on first error)
      console.error(`[NodeApp ${routeName}] ❌ Axios Error: ${errorMessage}`, errorDetails);
    } else {
      errorMessage = `Non-Axios error: ${error.message}`;
      console.error(`[NodeApp ${routeName}] ❌ Error:`, error.message, error);
    }

    res.status(statusCode).json({
      message: 'Error processing DICOM instance.',
      error: errorMessage,
      details: errorDetails,
      orthancInstanceId: currentOrthancInstanceId,
      filePathAttempted: savedFilePath // Even if saving failed, what path was it trying?
    });
  }
});

export default router;