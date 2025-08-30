import { generateIbmReport } from '../../services/reportService';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const { metrics, eligibility } = req.body;

    // Validate that the necessary data was sent from the frontend
    if (!metrics || !eligibility) {
      return res.status(400).json({ message: 'Missing metrics or eligibility data in request body.' });
    }

    // These options are now securely read from the server's environment variables
    const options = {
      apiKey: process.env.IBM_CLOUD_API_KEY,
      projectId: process.env.WATSONX_PROJECT_ID,
      modelId: 'ibm/granite-13b-instruct-v2', // You can change the model here if needed
      region: 'au-syd', // Your specified region
    };

    // This service function is now called safely on the server
    const reportText = await generateIbmReport(metrics, eligibility, options);

    // Send the successful analysis back to the frontend
    res.status(200).json({ report: reportText });

  } catch (error) {
    console.error('API Route Error:', error.message);
    res.status(500).json({ message: 'Failed to generate AI report.', details: error.message });
  }
}

