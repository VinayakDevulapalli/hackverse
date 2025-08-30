// pages/api/get-stored-data.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Query for the most recent data of each type
    // Adjust table names based on your actual Supabase schema
    
    // Get latest bank statement data
    const { data: bankData, error: bankError } = await supabase
      .from('transactions') // Adjust table name
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get latest GST data
    const { data: gstData, error: gstError } = await supabase
      .from('gst3b') // Adjust table name
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get latest P&L data
    const { data: pnlData, error: pnlError } = await supabase
      .from('pnl') // Adjust table name
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Log errors for debugging (but don't fail the request)
    if (bankError && bankError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.log('Bank data query error:', bankError);
    }
    if (gstError && gstError.code !== 'PGRST116') {
      console.log('GST data query error:', gstError);
    }
    if (pnlError && pnlError.code !== 'PGRST116') {
      console.log('P&L data query error:', pnlError);
    }

    // Structure the response - adjust field names based on your actual database columns
    const storedData = {
      bankData: bankData ? {
        // If your data is stored in a 'data' column as JSON
        ...(bankData.data || bankData.categorized_output || bankData),
        uploadedAt: bankData.created_at,
        fileName: bankData.file_name || bankData.filename
      } : null,
      
      gstData: gstData ? {
        // If your data is stored in a 'data' column as JSON
        ...(gstData.data || gstData.gst_ocr_output || gstData),
        uploadedAt: gstData.created_at,
        fileName: gstData.file_name || gstData.filename
      } : null,
      
      pnlData: pnlData ? {
        // If your data is stored in a 'data' column as JSON
        ...(pnlData.data || pnlData.pnl_ocr_output || pnlData),
        uploadedAt: pnlData.created_at,
        fileName: pnlData.file_name || pnlData.filename
      } : null
    };

    // Add debug information
    console.log('Retrieved data summary:', {
      bankData: !!storedData.bankData,
      gstData: !!storedData.gstData,
      pnlData: !!storedData.pnlData,
      bankDataSize: storedData.bankData ? JSON.stringify(storedData.bankData).length : 0,
      gstDataSize: storedData.gstData ? JSON.stringify(storedData.gstData).length : 0,
      pnlDataSize: storedData.pnlData ? JSON.stringify(storedData.pnlData).length : 0
    });

    res.status(200).json(storedData);

  } catch (error) {
    console.error('Supabase query error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve stored data from Supabase',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
