// pages/api/analyzeDataTable.js

import { analyzeDataTable } from '../../services/pnlservice';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ✅ MODIFIED: We now receive the raw 'ocrOutput' from the frontend.
    const { ocrOutput } = req.body;

    if (!ocrOutput) {
      return res.status(400).json({ error: 'ocrOutput is required.' });
    }

    const options = {
      apiKey: process.env.IBM_CLOUD_API_KEY,
      projectId: process.env.WATSONX_PROJECT_ID,
    };
    
    // Pass the raw text directly to the service
    const analysis = await analyzeDataTable(ocrOutput, options);
    res.status(200).json({ analysis });

  } catch (error) {
    console.error('API Route Error:', error);
    res.status(500).json({ error: 'Failed to get financial analysis.', details: error.message });
  }
}