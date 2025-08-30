// lib/dataStore.js - Fixed for Supabase integration
let dataStore = {
    gstOCROutput: null,
    categorizedOutput: null,
    pnlOCROutput: null,
    lastLoaded: null,
    isLoading: false
  };
  
  // In-memory update functions
  export const updateGSTData = (data) => {
    dataStore.gstOCROutput = data;
    dataStore.lastLoaded = new Date();
    console.log('GST data updated in store');
  };
  
  export const updateBankData = (data) => {
    dataStore.categorizedOutput = data;
    dataStore.lastLoaded = new Date();
    console.log('Bank data updated in store');
  };
  
  export const updatePnLData = (data) => {
    dataStore.pnlOCROutput = data;
    dataStore.lastLoaded = new Date();
    console.log('P&L data updated in store');
  };
  
  // Function to check if we're on the client side
  const isClient = () => typeof window !== 'undefined';
  
  // Function to load from database (only on client side)
  const loadFromDatabase = async () => {
    // Only run on client side and prevent multiple simultaneous loads
    if (!isClient() || dataStore.isLoading) return false;
    
    try {
      dataStore.isLoading = true;
      console.log('Loading data from Supabase...');
      
      // Use absolute URL with window.location.origin for client-side requests
      const baseUrl = window.location.origin;
      const response = await fetch(`${baseUrl}/api/getStoredData`);
      
      if (response.ok) {
        const dbData = await response.json();
        console.log('Data received from Supabase:', {
          bankData: !!dbData.bankData,
          gstData: !!dbData.gstData,
          pnlData: !!dbData.pnlData
        });
        
        // Update dataStore with database data
        if (dbData.bankData) {
          dataStore.categorizedOutput = dbData.bankData;
          console.log('Bank data loaded from database');
        }
        if (dbData.gstData) {
          dataStore.gstOCROutput = dbData.gstData;
          console.log('GST data loaded from database');
        }
        if (dbData.pnlData) {
          dataStore.pnlOCROutput = dbData.pnlData;
          console.log('P&L data loaded from database');
        }
        
        dataStore.lastLoaded = new Date();
        return true;
      } else {
        console.error('Failed to fetch from database:', response.status, response.statusText);
        return false;
      }
    } catch (error) {
      console.error('Failed to load data from database:', error);
      return false;
    } finally {
      dataStore.isLoading = false;
    }
  };
  
  // FIXED: Function to load data on server side (for API routes)
  const loadFromDatabaseServer = async () => {
    try {
      console.log('Loading data from Supabase (server-side)...');
      
      // Check environment variables first
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      
      console.log('Environment check:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey,
        urlPreview: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : 'missing'
      });
      
      if (!supabaseUrl || !supabaseServiceKey) {
        console.error('Missing Supabase environment variables');
        return false;
      }
  
      // Import Supabase client directly (server-side)
      const { createClient } = await import('@supabase/supabase-js');
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
  
      console.log('Supabase client created successfully');
  
      // Get latest bank statement data with single query (no .single())
      const { data: bankResults, error: bankError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      
      console.log('Bank query results:', {
        error: bankError?.message,
        dataLength: bankResults?.length,
        hasData: !!bankResults && bankResults.length > 0
      });
  
      if (bankResults && bankResults.length > 0) {
        const bankData = bankResults[0];
        console.log('Raw bank data keys:', Object.keys(bankData));
        console.log('Raw bank data sample:', JSON.stringify(bankData).substring(0, 200));
        
        // Try different possible column names for the actual data
        dataStore.categorizedOutput = 
          bankData.categorized_output || 
          bankData.data || 
          bankData.processed_data ||
          bankData.transactions ||
          bankData.transaction_data ||
          bankData;
          
        console.log('Bank data processed:', {
          type: typeof dataStore.categorizedOutput,
          hasData: !!dataStore.categorizedOutput,
          keys: dataStore.categorizedOutput ? Object.keys(dataStore.categorizedOutput).slice(0, 10) : null
        });
      }
  
      // Similar queries for GST and P&L (simplified)
      try {
        const { data: gstResults } = await supabase
          .from('gst3b')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (gstResults && gstResults.length > 0) {
          const gstData = gstResults[0];
          dataStore.gstOCROutput = gstData.data || gstData.gst_ocr_output || gstData;
          console.log('GST data loaded:', !!dataStore.gstOCROutput);
        }
      } catch (gstError) {
        console.log('GST query failed (table might not exist):', gstError.message);
      }
  
      try {
        const { data: pnlResults } = await supabase
          .from('pnl')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
          
        if (pnlResults && pnlResults.length > 0) {
          const pnlData = pnlResults[0];
          dataStore.pnlOCROutput = pnlData.data || pnlData.pnl_ocr_output || pnlData;
          console.log('P&L data loaded:', !!dataStore.pnlOCROutput);
        }
      } catch (pnlError) {
        console.log('P&L query failed (table might not exist):', pnlError.message);
      }
  
      dataStore.lastLoaded = new Date();
      
      console.log('Server-side final data status:', {
        bank: !!dataStore.categorizedOutput,
        gst: !!dataStore.gstOCROutput,
        pnl: !!dataStore.pnlOCROutput
      });
      
      return true;
    } catch (error) {
      console.error('Server-side database load error:', error);
      return false;
    }
  };
  
  // Synchronous getDataStore for immediate use
  export const getDataStore = () => {
    return { ...dataStore };
  };
  
  // FIXED: Async version that loads from database with better error handling
  export const getDataStoreAsync = async () => {
    try {
      console.log('getDataStoreAsync called, isClient:', isClient());
      
      // Try to load from database on server side
      if (!isClient()) {
        console.log('Server-side: attempting to load from database...');
        const success = await loadFromDatabaseServer();
        console.log('Server-side load result:', success);
      } else {
        // Client side loading
        const hasData = dataStore.gstOCROutput || dataStore.categorizedOutput || dataStore.pnlOCROutput;
        const isStale = !dataStore.lastLoaded || (new Date() - dataStore.lastLoaded) > 300000;
        
        console.log('Client-side check:', { hasData, isStale });
        
        if (!hasData || isStale) {
          console.log('Client-side: loading from database...');
          const success = await loadFromDatabase();
          console.log('Client-side load result:', success);
        }
      }
      
      const result = { ...dataStore };
      console.log('getDataStoreAsync returning:', {
        hasBank: !!result.categorizedOutput,
        hasGST: !!result.gstOCROutput,
        hasPNL: !!result.pnlOCROutput
      });
      
      return result;
    } catch (error) {
      console.error('getDataStoreAsync error:', error);
      // Return current dataStore even if loading fails
      return { ...dataStore };
    }
  };
  
  // Force refresh from database
  export const refreshDataFromDatabase = async () => {
    try {
      if (isClient()) {
        await loadFromDatabase();
      } else {
        await loadFromDatabaseServer();
      }
      return { ...dataStore };
    } catch (error) {
      console.error('refreshDataFromDatabase error:', error);
      return { ...dataStore };
    }
  };
  
  // Reset function for clearing data
  export const resetDataStore = () => {
    dataStore = {
      gstOCROutput: null,
      categorizedOutput: null,
      pnlOCROutput: null,
      lastLoaded: null,
      isLoading: false
    };
    console.log('Data store reset');
  };