// services/dataTableService.js

// (Your getIamToken function remains the same)
async function getIamToken(apiKey) {
  const url = 'https://iam.cloud.ibm.com/identity/token';
  const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`
  });
  if (!response.ok) throw new Error('Failed to get IAM token');
  const data = await response.json();
  return data.access_token;
}

// ✅ MODIFIED: The main analysis function now has a prompt designed for raw text.
export async function analyzeDataTable(rawOcrText, options = {}) {
  const { apiKey, projectId, modelId = 'ibm/granite-13b-instruct-v2', region = 'au-syd' } = options;
  if (!apiKey || !projectId || !rawOcrText) {
      throw new Error('Missing required parameters for AI analysis.');
  }

  const accessToken = await getIamToken(apiKey);

  const prompt = `
      You are a financial analyst. Based ONLY on the following raw OCR text from a financial data table, perform these three tasks:
      1.  **Overall Summary**: First, parse the table structure from the text. Then, provide a brief, two-sentence summary of the overall financial trend shown in the data.
      2.  **Key Observations**: Identify the month with the highest revenue, the month with the highest operating expenses, and calculate the net cash flow (Revenue - Operating_Expenses - Interest_Expense - EMI_Total) for the first and last valid months you can find in the text.
      3.  **Potential Red Flags**: Point out one potential area of concern based on the relationship between revenue, expenses, and cash on hand.

      Here is the raw OCR text:
      ---
      ${rawOcrText}
      ---
  `.trim();

  const apiUrl = `https://${region}.ml.cloud.ibm.com/ml/v1-beta/generation/text?version=2023-05-29`;
  const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
  };
  const body = JSON.stringify({
      model_id: modelId,
      input: prompt,
      parameters: { max_new_tokens: 400, min_new_tokens: 100 },
      project_id: projectId
  });

  const response = await fetch(apiUrl, { method: 'POST', headers, body });
  if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Watsonx API error (${response.status}): ${errorText}`);
  }

  const responseData = await response.json();
  return responseData.results[0].generated_text.trim();
}