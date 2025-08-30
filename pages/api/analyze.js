// src/pages/api/analyze.js

// Import the function from your existing service file
import { getFinancialAnalysis } from '../../services/watsonxService';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { categorizedData } = req.body;

    if (!categorizedData) {
      return res.status(400).json({ error: 'categorizedData is required.' });
    }

    // These options are now securely read from the server's environment variables
    const options = {
      apiKey: process.env.IBM_CLOUD_API_KEY,
      projectId: process.env.WATSONX_PROJECT_ID,
      modelId: 'ibm/granite-3-8b-instruct',
      region: 'au-syd', // This is the region from your original code
    };

    // This service function is now called safely on the server
    const analysis = await getFinancialAnalysis(categorizedData, options);

    // Send the successful analysis back to the frontend
    res.status(200).json({ analysis });

  } catch (error) {
    console.error('API Route Error:', error.message);
    res.status(500).json({ error: 'Failed to get financial analysis.', details: error.message });
  }
}