// src/services/watsonxService.js

/**
 * Retrieves an IAM access token from IBM Cloud using an API key.
 * This token is required to authenticate with the Watsonx.ai API.
 * @param {string} apiKey - Your IBM Cloud API key.
 * @returns {Promise<string>} The IAM access token.
 */
 async function getIamToken(apiKey) {
    const url = 'https://iam.cloud.ibm.com/identity/token';
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    };
    const body = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apiKey}`;
  
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to get IAM token: ${errorData.errorMessage || response.statusText}`);
    }
  
    const data = await response.json();
    return data.access_token;
  }
  
  /**
   * Sends categorized transaction data to a Watsonx.ai model for financial analysis.
   *
   * @param {string} categorizedData - The string of categorized transactions from your app.
   * @param {object} options - Configuration object.
   * @param {string} options.apiKey - Your IBM Cloud API key.
   * @param {string} options.projectId - Your Watsonx.ai project ID.
   * @param {string} [options.modelId] - The ID of the model you want to use (defaults to 'granite-guardian-3.1-2b').
   * @param {string} [options.region] - The region of your Watsonx project (defaults to 'us-south').
   * @returns {Promise<string>} The generated analysis from the LLM.
   */
  export async function getFinancialAnalysis(categorizedData, options = {}) {
    // Validate required parameters
    if (!categorizedData) {
      throw new Error('categorizedData is required and cannot be empty.');
    }
  
    if (!options || typeof options !== 'object') {
      throw new Error('options object is required.');
    }
  
    // Extract options with defaults
    const {
      apiKey,
      projectId,
      modelId = 'ibm/granite-3-8b-instruct', // Default model
      region = 'au-syd' // Default region
    } = options;
  
    // Debug log to see what values we're getting
    console.log('Environment check:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      hasProjectId: !!projectId,
      projectIdLength: projectId ? projectId.length : 0,
      modelId,
      region
    });
  
    // Validate required fields with detailed error messages
    const missingFields = [];
    if (!apiKey || apiKey.trim() === '') {
      missingFields.push('apiKey (check REACT_APP_IBM_CLOUD_API_KEY environment variable)');
    }
    if (!projectId || projectId.trim() === '') {
      missingFields.push('projectId (check REACT_APP_WATSONX_PROJECT_ID environment variable)');
    }
  
    if (missingFields.length > 0) {
      throw new Error(
        `Missing required configuration: ${missingFields.join(', ')}. ` +
        `Please check your .env file contains:\n` +
        `REACT_APP_IBM_CLOUD_API_KEY=your_api_key_here\n` +
        `REACT_APP_WATSONX_PROJECT_ID=your_project_id_here\n` +
        `Then restart your development server.`
      );
    }
  
    // Validate field types and formats
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new Error('apiKey must be a non-empty string.');
    }
    if (typeof projectId !== 'string' || projectId.trim().length === 0) {
      throw new Error('projectId must be a non-empty string.');
    }
  
    console.log('Watsonx config:', {
      modelId,
      region,
      projectId: projectId.substring(0, 8) + '...', // Partial ID for logging
      hasApiKey: !!apiKey
    });
  
    try {
      // Step 1: Get the authorization token
      const accessToken = await getIamToken(apiKey);
  
      // Step 2: Construct a clear and specific prompt for the LLM
      const prompt = `
  You are a helpful financial analyst. Your task is to analyze the provided bank transaction data.
  Based *only* on the data below, provide a brief summary of spending habits, identify the top 3 spending categories by amount, and suggest one potential area for savings. Present the analysis in a clear, concise, and easy-to-read format.
  
  Transaction Data:
  ---
  ${categorizedData}
  ---
  
  Financial Analysis:
      `.trim();
  
      // Step 3: Prepare the Watsonx.ai API request
      const apiUrl = `https://${region}.ml.cloud.ibm.com/ml/v1-beta/generation/text?version=2023-05-29`;
  
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
  
      const body = JSON.stringify({
        model_id: modelId,
        input: prompt,
        parameters: {
          decoding_method: "greedy",
          max_new_tokens: 350,
          min_new_tokens: 50,
          repetition_penalty: 1.1
        },
        project_id: projectId
      });
  
      console.log('Making API call to:', apiUrl);
  
      // Step 4: Make the API call to Watsonx.ai
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body
      });
  
      if (!response.ok) {
        // Provide more detailed error information if the request fails
        let errorText;
        try {
          const errorJson = await response.json();
          errorText = JSON.stringify(errorJson, null, 2);
        } catch {
          errorText = await response.text();
        }
        throw new Error(`Watsonx API error (${response.status}): ${errorText}`);
      }
  
      const responseData = await response.json();
      
      // Step 5: Extract and return the generated text
      if (responseData.results && responseData.results.length > 0) {
        const generatedText = responseData.results[0].generated_text;
        if (!generatedText || generatedText.trim().length === 0) {
          throw new Error('Empty response received from Watsonx API.');
        }
        return generatedText.trim();
      } else {
        throw new Error('No valid response returned from the Watsonx API. Response structure: ' + JSON.stringify(responseData));
      }
  
    } catch (error) {
      console.error('Error getting financial analysis:', error);
      
      // Provide more helpful error messages based on error type
      if (error.message.includes('Failed to get IAM token')) {
        throw new Error(`Authentication failed: Please check your IBM Cloud API key. Original error: ${error.message}`);
      } else if (error.message.includes('Watsonx API error')) {
        throw new Error(`Watsonx service error: ${error.message}`);
      } else if (error.message.includes('fetch')) {
        throw new Error(`Network error: Please check your internet connection and try again. ${error.message}`);
      }
      
      // Re-throw the error so the calling component can catch it and update the UI
      throw error;
    }
  }
  
  // Helper function to validate Watsonx configuration
  export function validateWatsonxConfig(config) {
    const errors = [];
    
    if (!config) {
      errors.push('Configuration object is required');
      return errors;
    }
    
    if (!config.apiKey) errors.push('IBM Cloud API key is required');
    if (!config.projectId) errors.push('Watsonx project ID is required');
    
    if (config.apiKey && typeof config.apiKey !== 'string') {
      errors.push('API key must be a string');
    }
    
    if (config.projectId && typeof config.projectId !== 'string') {
      errors.push('Project ID must be a string');
    }
    
    return errors;
  }