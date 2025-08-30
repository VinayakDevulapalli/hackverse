/**
 * Gets an IAM token from IBM Cloud using an API key.
 * This token is required to authorize API calls to Watsonx.
 * @param {string} apiKey - Your IBM Cloud API Key.
 * @returns {Promise<string>} The access token.
 */
 async function getIamToken(apiKey) {
    const url = 'https://iam.cloud.ibm.com/identity/token';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get IAM token: ${errorText}`);
    }
    const data = await response.json();
    return data.access_token;
  }
  
  /**
   * This service encapsulates the logic for calling the IBM Watsonx API.
   * It constructs a detailed prompt from financial metrics and sends it to the model.
   * @param {object} metrics - The calculated financial metrics.
   * @param {object} eligibility - The calculated eligibility status.
   * @param {object} options - API configuration like keys, project ID, etc.
   * @returns {Promise<string>} The AI-generated report text.
   */
  export async function generateIbmReport(metrics, eligibility, options = {}) {
    const { apiKey, projectId, modelId = 'ibm/granite-13b-instruct-v2', region = 'au-syd' } = options;
    if (!apiKey || !projectId || !metrics || !eligibility) {
        throw new Error('Missing required parameters for AI analysis.');
    }
  
    const accessToken = await getIamToken(apiKey);
    
    const prompt = `
As a senior financial analyst, write a **comprehensive and descriptive loan eligibility report** using the financial data below. 
The tone should be professional, analytical, and explanatory, with smooth transitions between sections rather than just listing facts. 
Go beyond simply comparing numbers to thresholds — interpret what each metric says about the business's financial health, highlight risks and strengths, and explain the potential implications for loan approval.

**Financial Data:**
- Loan Eligibility Status: ${eligibility.status}
- Reason: ${eligibility.reason}
- Net Profit Margin: ${metrics.netProfitMargin}% (Threshold: > 5%)
- Debt Service Coverage Ratio (DSCR): ${metrics.dscr} (Threshold: >= 1.25)
- Monthly Net Cash Flow: ₹${metrics.monthlyNetCashFlow} (Threshold: > 0)
- Cash Flow to EMI Ratio: ${metrics.cashFlowToEmiRatio} (Threshold: >= 1.5)

**Structure your report as follows:**

**Executive Summary:**
Provide a narrative overview of the borrower’s eligibility status, summarizing the key reasons behind the approval/rejection. Capture both the immediate outcome and the broader financial picture.

**1. Profitability Analysis:**
Explain the Net Profit Margin in detail — what the percentage indicates about operational efficiency and financial sustainability. Compare it to the 5% threshold, and discuss whether profitability levels strengthen or weaken the borrower’s case.

**2. Debt Management & Serviceability:**
Analyze the DSCR in depth. Instead of just stating if it passes or fails the 1.25 benchmark, describe what this ratio reveals about the borrower’s ability to generate earnings relative to debt obligations. Highlight whether the business can reliably meet interest and principal payments without financial strain.

**3. Cash Flow Health:**
Discuss the Monthly Net Cash Flow and the Cash Flow to EMI Ratio together. Go beyond threshold checks — evaluate how stable cash inflows appear, whether there’s a cushion to absorb unexpected expenses, and what this means for consistent repayment capability.

**Final Recommendation:**
End with a clear, well-justified recommendation that considers all aspects of financial health. If approval is advised, explain the confidence level and conditions (if any). If rejection is recommended, describe what improvements would be needed for reconsideration.
`;

  
    const apiUrl = `https://${region}.ml.cloud.ibm.com/ml/v1-beta/generation/text?version=2023-05-29`;
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    const body = JSON.stringify({
        model_id: modelId,
        input: prompt,
        parameters: { max_new_tokens: 512, min_new_tokens: 200 },
        project_id: projectId
    });
  
    const response = await fetch(apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Watsonx API error (${response.status}): ${errorText}`);
    }
  
    const responseData = await response.json();
    const generatedText = responseData.results?.[0]?.generated_text;
  
    if (!generatedText) {
      throw new Error("Failed to parse the report from the Watsonx API response.");
    }
  
    return generatedText.trim();
  }
  
  