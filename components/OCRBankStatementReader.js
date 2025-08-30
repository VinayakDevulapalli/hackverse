// components/OCRBankStatementReader.js

import { useState } from 'react';
import { getParser } from '../components/parsers';
import { SUPPORTED_BANKS, DEFAULT_BANK } from './utils/constants.js';
import { supabase } from '../lib/supabase'; // You'll need to create this
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

import { updateBankData } from '../lib/datastore';

if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

export default function OCRBankStatementReader({ onProcessComplete }) {
  const [file, setFile] = useState(null);
  const [selectedBank, setSelectedBank] = useState(DEFAULT_BANK);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ocrProgress, setOcrProgress] = useState('');
  const [useOCR, setUseOCR] = useState(false);
  const [ocrOutput, setOcrOutput] = useState('');
  const [cleanedOutput, setCleanedOutput] = useState('');
  const [simplifiedOutput, setSimplifiedOutput] = useState('');
  const [categorizedOutput, setCategorizedOutput] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Parse categorized output into structured data
  const parseCategorizedData = (categorizedText) => {
    const transactions = [];
    const lines = categorizedText.split('\n');
    
    console.log('Parsing categorized data, total lines:', lines.length);
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('=') || trimmedLine.includes('PAGE')) continue;
      
      console.log('Processing line:', trimmedLine);
      
      // Check if line has pipe separators (your format: date | description | amount | type)
      if (trimmedLine.includes('|')) {
        const parts = trimmedLine.split('|').map(part => part.trim());
        
        if (parts.length >= 4) {
          const [dateStr, description, amountStr, transactionType] = parts;
          
          console.log('Pipe-separated parts:', { dateStr, description, amountStr, transactionType });
          
          // Parse date - handle DD/MM/YY format
          let parsedDate;
          try {
            const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
            if (dateMatch) {
              let [, day, month, year] = dateMatch;
              // Convert 2-digit year to 4-digit
              if (year.length === 2) {
                year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
              }
              // Assuming DD/MM/YY format based on your data
              parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`).toISOString();
            } else {
              console.log('Date format not recognized:', dateStr);
              continue;
            }
          } catch (e) {
            console.log('Invalid date format:', dateStr, e);
            continue;
          }
          
          // Parse amount
          const cleanAmount = amountStr.replace(/[,\s]/g, '');
          let numericAmount = parseFloat(cleanAmount);
          
          if (isNaN(numericAmount)) {
            console.log('Invalid amount:', amountStr);
            continue;
          }
          
          // Handle DEBIT/CREDIT - make debits negative
          if (transactionType.toUpperCase().includes('DEBIT')) {
            numericAmount = Math.abs(numericAmount);
          } else if (transactionType.toUpperCase().includes('CREDIT')) {
            numericAmount = Math.abs(numericAmount);
          }
          
          const transaction = {
            date: parsedDate,
            description: description || 'Unknown Transaction',
            amount: numericAmount,
            category: transactionType || 'Uncategorized',
            bank: selectedBank,
            raw_text: trimmedLine
          };
          
          console.log('Successfully parsed transaction:', transaction);
          transactions.push(transaction);
        } else {
          console.log('Line has pipes but insufficient parts:', parts);
        }
      } else {
        // Fallback to original parsing for non-pipe formats
        const dateMatch = trimmedLine.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        const amountMatch = trimmedLine.match(/(\d+\.?\d{0,2})/);
        
        if (dateMatch && amountMatch) {
          console.log('Fallback parsing for line without pipes');
          // Continue with fallback logic if needed
        } else {
          console.log('Skipping line - no recognizable format:', trimmedLine);
        }
      }
    }
    
    console.log('Total transactions parsed:', transactions.length);
    return transactions;
  };

  // Save to Supabase
  const saveToDatabase = async () => {
    if (!categorizedOutput) {
      setError('No data to save. Please process a statement first.');
      return;
    }

    setSaveLoading(true);
    setSaveSuccess(false);
    setError('');

    try {
      // Parse the categorized output into structured data
      const transactions = parseCategorizedData(categorizedOutput);
      
      if (transactions.length === 0) {
        throw new Error('No valid transactions found to save');
      }

      // Map parsed data to the specific columns in your 'transactions' table
      const transactionsToInsert = transactions.map(transaction => ({
        date: transaction.date,
        receiver_sender: transaction.description,
        amount: transaction.amount,
        transaction_type: transaction.category,
      }));

      // Insert all transactions in a single batch
      const { error } = await supabase
        .from('transactions')
        .insert(transactionsToInsert);

      if (error) throw error;

      setSaveSuccess(true);
      setOcrProgress(`Successfully saved ${transactions.length} transactions to database!`);
      
    } catch (err) {
      console.error('Database save error:', err);
      setError('Failed to save to database: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const convertPDFToImages = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      const images = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        setOcrProgress(`Converting page ${i} of ${pdf.numPages} to image...`);
        const page = await pdf.getPage(i);
        const scale = 2.0;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        const imageData = canvas.toDataURL('image/png');
        images.push(imageData);
      }
      return images;
    } catch (error) {
      throw new Error('Failed to convert PDF to images: ' + error.message);
    }
  };

  const performOCR = async (images) => {
    let fullText = '';
    for (let i = 0; i < images.length; i++) {
      setOcrProgress(`Processing page ${i + 1} of ${images.length} with OCR...`);
      try {
        const { data: { text } } = await Tesseract.recognize(
          images[i], 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') {
                setOcrProgress(`Page ${i + 1}: ${Math.round(m.progress * 100)}% complete`);
              }
            },
            tessedit_pageseg_mode: 4,
            preserve_interword_spaces: '1',
          }
        );
        fullText += `=== PAGE ${i + 1} ===\n${text}\n\n`;
      } catch (error) {
        console.error('OCR error on page', i + 1, error);
        throw new Error(`OCR failed on page ${i + 1}: ${error.message}`);
      }
    }
    return fullText;
  };

  const extractTextFromPDF = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }
      return fullText;
    } catch (error) {
      throw new Error('Failed to extract text from PDF: ' + error.message);
    }
  };

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;
    if (!uploadedFile.type.includes('pdf')) {
      setError('Please upload a PDF file');
      return;
    }
    setFile(uploadedFile);
    setLoading(true);
    setError('');
    setOcrProgress('');
    setOcrOutput('');
    setCleanedOutput('');
    setSimplifiedOutput('');
    setCategorizedOutput('');
    setSaveSuccess(false);
    if (onProcessComplete) onProcessComplete(false);

    try {
      const parser = getParser(selectedBank);
      let extractedText = '';
      if (useOCR) {
        const images = await convertPDFToImages(uploadedFile);
        extractedText = await performOCR(images);
        setOcrProgress('OCR completed! Processing...');
      } else {
        setOcrProgress('Extracting text from PDF...');
        extractedText = await extractTextFromPDF(uploadedFile);
      }
      setOcrOutput(extractedText);
      const cleaned = parser.cleanOCROutput(extractedText);
      setCleanedOutput(cleaned);
      const simplified = parser.cleanOCROutputSimplified(extractedText);
      setSimplifiedOutput(simplified);
      const categorized = parser.categorizeTransactions(simplified);
      setCategorizedOutput(categorized);
      updateBankData(categorized);
      if (!extractedText.trim()) {
        setError('No text found. Try enabling OCR mode for image-based PDFs.');
        setLoading(false);
        return;
      }
      setOcrProgress(`Processing completed using ${SUPPORTED_BANKS[selectedBank].name} parser!`);
      if (onProcessComplete) onProcessComplete(true);
    } catch (err) {
      console.error('Processing error:', err);
      setError('Error processing PDF: ' + err.message);
      setOcrProgress('');
      if (onProcessComplete) onProcessComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBankSelection = (bankCode) => {
    setSelectedBank(bankCode);
    if (file) {
      setOcrOutput('');
      setCleanedOutput('');
      setSimplifiedOutput('');
      setCategorizedOutput('');
      setSaveSuccess(false);
      if (onProcessComplete) onProcessComplete(false);
    }
  };

  const handleAiAnalysis = async () => {
    if (!categorizedOutput) {
      setAiError('No categorized data is available to analyze.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    setAiAnalysis('');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ categorizedData: categorizedOutput }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || 'An unknown error occurred during analysis.');
      }
      setAiAnalysis(data.analysis);
    } catch (err) {
      console.error('AI Analysis Error:', err);
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
        Upload Documents
      </h1>
      
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-lg">
            1
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Select Your Bank</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(SUPPORTED_BANKS).map(([code, bank]) => (
            <div key={code} onClick={() => handleBankSelection(code)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                selectedBank === code
                  ? 'border-blue-500 bg-blue-50 text-blue-900'
                  : code === 'HDFC'
                    ? 'border-gray-300 bg-white hover:border-gray-400'
                    : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
              }`} >
              <h3 className="font-semibold">{bank.name}</h3>
              <p className="text-sm mt-1">{bank.description}</p>
              {selectedBank === code && (
                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    Selected
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center">
        <div className="flex items-center space-x-4 bg-gray-100 p-4 rounded-lg">
          <label className="flex items-center cursor-pointer">
            <input type="checkbox" checked={useOCR} onChange={(e) => setUseOCR(e.target.checked)} className="mr-2" />
            <span className="text-sm font-medium">
              Use OCR Mode (Better for complex layouts)
            </span>
          </label>
        </div>
      </div>
      
      <div className="mb-8">
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-2 text-sm text-gray-500">
                <span className="font-semibold">Click to upload</span> your {SUPPORTED_BANKS[selectedBank].name} statement
              </p>
              <p className="text-xs text-gray-500">PDF files only</p>
            </div>
            <input type="file" className="hidden" accept=".pdf" onChange={handleFileUpload} disabled={loading} />
          </label>
        </div>
        
        {file && (<div className="mt-4 text-sm text-gray-600"> Selected file: {file.name} | Bank: {SUPPORTED_BANKS[selectedBank].name} </div>)}
        {loading && (
          <div className="mt-4 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
            <span className="text-gray-600">{ocrProgress || 'Processing...'}</span>
          </div>
        )}
        {error && (<div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"> {error} </div>)}
      </div>

      {(ocrOutput || categorizedOutput) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6 mb-8">
          {ocrOutput && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Raw OCR Output:</h2>
              <textarea value={ocrOutput} readOnly className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-xs bg-gray-50" />
            </div>
          )}
          {categorizedOutput && (
            <div>
              <h2 className="text-lg font-semibold mb-3"> Categorization ({SUPPORTED_BANKS[selectedBank].name}): </h2>
              <textarea value={categorizedOutput} readOnly className="w-full h-64 p-4 border border-purple-300 rounded-lg font-mono text-xs bg-purple-50" />
              <div className="mt-2 flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(categorizedOutput)} className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700" >
                  Copy Categorized Data
                </button>
                <button 
                  onClick={saveToDatabase}
                  disabled={saveLoading || saveSuccess}
                  className={`px-3 py-1 text-white text-sm rounded transition-colors ${
                    saveSuccess 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : saveLoading 
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {saveLoading ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save to Database'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {categorizedOutput && (
        <div className="mt-6 border-t pt-6">
          {saveSuccess && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          <strong>Success!</strong> Bank statement data has been saved to your database.
        </div>
      )}
          <h3 className="text-lg font-semibold mb-3 mt-3 text-indigo-800">Financial Insights</h3>
          <button onClick={handleAiAnalysis} disabled={aiLoading} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors" >
            {aiLoading ? 'Analyzing...' : 'Analyze with Watsonx AI'}
          </button>
          {aiLoading && (
              <div className="mt-4 flex items-center text-gray-600">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 mr-3"></div>
                <span>Contacting Watsonx.ai for insights... Please wait.</span>
              </div>
          )}
          {aiError && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <strong>Error:</strong> {aiError}
            </div>
          )}
          {aiAnalysis && (
            <div className="mt-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50">
              <h4 className="text-md font-semibold mb-2 text-indigo-900">AI Financial Summary:</h4>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{aiAnalysis}</p>
            </div>
          )}
        </div>
      )}

      {/* ✅ New Instructions Section */}
      <div className="mb-5 mt-7 p-4 border border-pink-200 bg-pink-50 rounded-lg">
        <h2 className="text-lg font-semibold text-pink-800 mb-2">Instructions</h2>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          <li>Select your bank before uploading a PDF statement.</li>
          <li>If your PDF is image-based, enable <strong>OCR Mode</strong> for better results.</li>
          <li>After uploading, the system will extract, clean, and categorize transactions automatically.</li>
          <li>You can review raw OCR text and categorized transactions in the panels below.</li>
          <li>Once satisfied, click <strong>Save to Database</strong> to store the transactions.</li>
          <li>Optionally, generate an <strong>AI-powered financial analysis</strong> for deeper insights.</li>
        </ul>
      </div>

      
    </div>
  );
}