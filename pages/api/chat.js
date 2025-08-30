// pages/api/chat.js - Simplified to use direct Supabase queries
import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log('Environment check:', {
  hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  hasOpenAI: !!process.env.OPENAI_API_KEY,
  supabaseUrlPreview: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...'
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log('=== CHAT API DEBUG START ===');
    
    const { message } = req.body;
    console.log('Received message:', message);

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key missing');
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    // Direct Supabase query - bypass the dataStore entirely
    console.log('Querying Supabase directly...');
    let bankData = null;
    let gstData = null;
    let pnlData = null;
    
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase environment variables');
        return res.status(500).json({ error: "Supabase not configured" });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      // Query bank data
      const { data: bankResults, error: bankError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      console.log('Bank query results:', {
        error: bankError?.message,
        hasResults: !!bankResults,
        resultsLength: bankResults?.length
      });

      if (bankResults && bankResults.length > 0) {
        const rawBankData = bankResults[0];
        console.log('Raw bank data columns:', Object.keys(rawBankData));
        
        // Extract the actual transaction data
        bankData = rawBankData.categorized_output || 
                  rawBankData.data || 
                  rawBankData.processed_data ||
                  rawBankData.transactions ||
                  rawBankData.transaction_data ||
                  rawBankData;
        
        console.log('Extracted bank data:', {
          type: typeof bankData,
          hasData: !!bankData,
          isObject: typeof bankData === 'object',
          keys: bankData && typeof bankData === 'object' ? Object.keys(bankData).slice(0, 10) : null,
          preview: typeof bankData === 'string' ? bankData.substring(0, 200) : JSON.stringify(bankData).substring(0, 200)
        });
      }

      // Query GST data (optional - won't fail if table doesn't exist)
      try {
        const { data: gstResults } = await supabase
          .from('gst3b')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (gstResults && gstResults.length > 0) {
          gstData = gstResults[0].data || gstResults[0].gst_ocr_output || gstResults[0];
        }
      } catch (gstError) {
        console.log('GST table query failed (might not exist):', gstError.message);
      }

      // Query P&L data (optional)
      try {
        const { data: pnlResults } = await supabase
          .from('pnl')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (pnlResults && pnlResults.length > 0) {
          pnlData = pnlResults[0].data || pnlResults[0].pnl_ocr_output || pnlResults[0];
        }
      } catch (pnlError) {
        console.log('P&L table query failed (might not exist):', pnlError.message);
      }

    } catch (supabaseError) {
      console.error('Supabase query error:', supabaseError);
      return res.status(500).json({ 
        error: "Failed to fetch data from database",
        details: process.env.NODE_ENV === 'development' ? supabaseError.message : undefined
      });
    }

    console.log('Final data status:', {
      hasBank: !!bankData,
      hasGST: !!gstData,
      hasPNL: !!pnlData,
      bankDataType: typeof bankData
    });

    // Helper function to format data for the prompt
    const formatDataForPrompt = (data, dataType) => {
      if (!data) {
        return `Not provided - Please upload ${dataType}`;
      }
      
      try {
        if (typeof data === 'string') {
          return data.length > 4000 ? data.substring(0, 4000) + '...[truncated]' : data;
        }
        
        const jsonString = JSON.stringify(data, null, 2);
        return jsonString.length > 4000 ? 
          jsonString.substring(0, 4000) + '...[truncated]' : 
          jsonString;
      } catch (error) {
        console.error(`Error formatting ${dataType}:`, error);
        return `Data available but formatting error: ${error.message}`;
      }
    };

    const systemPrompt = `You are a financial assistant chatbot specialized in analyzing financial documents.

Available Data:
==============

Bank Statement Data:
${formatDataForPrompt(bankData, "bank statement")}

GST Data:
${formatDataForPrompt(gstData, "GST return")}

P&L Data:
${formatDataForPrompt(pnlData, "P&L statement")}

Instructions:
============
- Analyze the actual financial data provided above to answer questions
- For bank statements: Look for transactions, balances, income, expenses, cash flow patterns
- For GST data: Analyze tax liability, input/output tax, compliance status  
- For P&L data: Review revenue, expenses, profit margins, financial performance
- If data shows "Not provided", inform the user to upload that document type
- Provide specific insights with numbers, totals, and trends from the actual data
- Calculate summaries, averages, and financial ratios when possible
- Be detailed and helpful in your financial analysis`;

    console.log('System prompt created, length:', systemPrompt.length);

    console.log('Calling OpenAI...');
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const reply = completion.choices[0].message.content;
    console.log('OpenAI response received successfully, length:', reply.length);

    res.status(200).json({ reply });

  } catch (error) {
    console.error("=== CHAT API ERROR ===");
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    // More specific error handling
    if (error.code === 'insufficient_quota') {
      return res.status(500).json({ 
        error: "OpenAI API quota exceeded. Please check your billing." 
      });
    } else if (error.code === 'invalid_api_key') {
      return res.status(500).json({ 
        error: "Invalid OpenAI API key" 
      });
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return res.status(500).json({ 
        error: "Network error connecting to OpenAI" 
      });
    }
    
    res.status(200).json({
      reply: "I'm having trouble accessing your financial data right now. Please make sure your bank statement is properly uploaded and try again."
    });
  }
}