import express from 'express';
import axios from 'axios';
import fs from 'fs';

const router = express.Router();

router.post('/new-dicom', async (req, res) => {
  const instanceId = req.body;

  try {
    const response = await axios.get(`http://localhost:8042/instances/${instanceId}/file`, {
      responseType: 'arraybuffer'
    });

    fs.writeFileSync(`./my-pacs/${instanceId}.dcm`, response.data);
    console.log(`✅ Saved ${instanceId}.dcm from Orthanc`);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Failed to fetch file from Orthanc:', error.message);
    res.sendStatus(500);
  }
});

export default router;