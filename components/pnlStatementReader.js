// components/FinancialDataTableReader.js

import { useState } from 'react';
import { supabase } from '../lib/supabase'; // Make sure you have this file
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

import { updatePnLData } from '../lib/dataStore';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

// **NEW, MORE ROBUST PARSER**
// This parser no longer relies on reading headers. It identifies data rows
// by the month format (e.g., "Jan-24") and assumes a fixed column order.
const DataTableParser = {
  parse: (text) => {
    const dataRows = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      // Check if the line starts with the typical month format (e.g., "Jan-24")
      if (/^[A-Za-z]{3}-\d{2}/.test(trimmedLine)) {
        const values = trimmedLine.split(/\s+/); // Split the row by spaces

        // Ensure we have enough columns, otherwise skip the row
        if (values.length >= 6) {
          const rowObject = {
            month: values[0],
            revenue: values[1],
            operating_expenses: values[2],
            interest_expense: values[3],
            emi_total: values[4],
            cash_on_hand: values[5],
          };
          dataRows.push(rowObject);
        }
      }
    }
    return dataRows;
  }
};

export default function FinancialDataTableReader({ onProcessComplete }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrOutput, setOcrOutput] = useState('');
  
  const [parsedData, setParsedData] = useState([]); 

  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const convertPDFToImages = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setOcrProgress(`Converting page ${i} of ${pdf.numPages} to image...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;
      images.push(canvas.toDataURL('image/png'));
    }
    return images;
  };

  const performOCR = async (images) => {
    let fullText = '';
    for (let i = 0; i < images.length; i++) {
      setOcrProgress(`Processing page ${i + 1} of ${images.length} with OCR...`);
      const { data: { text } } = await Tesseract.recognize(
        images[i], 'eng', {
          logger: m => { if (m.status === 'recognizing text') setOcrProgress(`Page ${i + 1}: ${Math.round(m.progress * 100)}% complete`); },
          tessedit_pageseg_mode: 6,
        }
      );
      fullText += `\n${text}`;
    }
    return fullText;
  };

  const handleFileUpload = async (event) => {
    const uploadedFile = event.target.files[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setLoading(true);
    setError('');
    setOcrProgress('');
    setOcrOutput('');
    setParsedData([]);
    setAiAnalysis('');
    setAiError('');
    setSaveSuccess(false);
    if (onProcessComplete) onProcessComplete(false);

    try {
      const images = await convertPDFToImages(uploadedFile);
      const extractedText = await performOCR(images);
      setOcrOutput(extractedText);
      updatePnLData(extractedText); 
      
      setOcrProgress('Parsing data structure...');
      const data = DataTableParser.parse(extractedText);
      setParsedData(data);

      if (data.length === 0) {
        setError("Could not find any data rows matching the expected format (e.g., 'Jan-24 ...'). Please check the document.");
        if (onProcessComplete) onProcessComplete(false);
      } else {
        setOcrProgress(`Parsing complete! Found ${data.length} rows.`);
        if (onProcessComplete) onProcessComplete(true);
      }
    } catch (err) {
      setError('Error processing document: ' + err.message);
      if (onProcessComplete) onProcessComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalysis = async () => {
    if (!ocrOutput) {
      setAiError('No OCR data is available to analyze.');
      return;
    }
    setAiLoading(true);
    setAiError('');
    setAiAnalysis('');
    try {
      const response = await fetch('/api/analyzePNL', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocrOutput: ocrOutput }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.details || 'An unknown error occurred during analysis.');
      }
      setAiAnalysis(data.analysis);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };
  
  const saveToDatabase = async () => {
    if (!parsedData || parsedData.length === 0) {
      setError('No parsed data available to save.');
      return;
    }

    setSaveLoading(true);
    setSaveSuccess(false);
    setError('');

    try {
      // Clean and convert parsed string data to the correct numeric types for the database
      const dataToInsert = parsedData.map(row => ({
        month: row.month,
        revenue: parseFloat(String(row.revenue)?.replace(/,/g, '')) || 0,
        operating_expenses: parseFloat(String(row.operating_expenses)?.replace(/,/g, '')) || 0,
        interest_expense: parseFloat(String(row.interest_expense)?.replace(/,/g, '')) || 0,
        emi_total: parseFloat(String(row.emi_total)?.replace(/,/g, '')) || 0,
        cash_on_hand: parseFloat(String(row.cash_on_hand)?.replace(/,/g, '')) || 0,
      }));

      const { error } = await supabase
        .from('pnl')
        .insert(dataToInsert);

      if (error) { throw error; }
      setSaveSuccess(true);
      
    } catch (err) {
      console.error('Database save error:', err);
      setError('Failed to save to database: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-lg">
            2
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Upload Your PnL Sheet</h2>
        </div>

        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> document</p>
              <p className="text-xs text-gray-500">PDF, PNG, JPG files</p>
            </div>
            <input type="file" className="hidden" accept=".pdf,image/*" onChange={handleFileUpload} disabled={loading} />
          </label>
        </div>
        {file && (<div className="mt-4 text-sm text-gray-600">Selected file: {file.name}</div>)}
        {loading && (<div className="mt-4 flex flex-col items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div><span className="text-gray-600">{ocrProgress || 'Processing...'}</span></div>)}
        {error && (<div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>)}
      </div>


      {ocrOutput && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Extracted Data</h2>
          <textarea 
            value={ocrOutput} 
            readOnly 
            className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-xs bg-gray-100" 
          />
          
          {saveSuccess && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          <strong>Success!</strong> Your P&L data has been saved to the database.
        </div>
      )}
          {parsedData.length > 0 && (
            <div className="mt-4">
              <button
                onClick={saveToDatabase}
                disabled={saveLoading || saveSuccess}
                className={`px-4 py-2 text-white font-semibold rounded-lg shadow-sm transition-colors ${
                  saveSuccess 
                    ? 'bg-green-600 hover:bg-green-700 cursor-default' 
                    : saveLoading 
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saveLoading ? 'Saving...' : saveSuccess ? 'Saved ✓' : 'Save Data'}
              </button>
            </div>
          )}
        </div>
      )}

      {ocrOutput && (
        <div className="mt-6 border-t pt-6">
          <h3 className="text-lg font-semibold mb-3 text-indigo-800">Optional: Get AI Insights</h3>
          <button onClick={handleAiAnalysis} disabled={aiLoading} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed">
            {aiLoading ? 'Analyzing...' : 'Analyze with Watsonx AI'}
          </button>
          {aiLoading && (<div className="mt-4 flex items-center text-gray-600"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600 mr-3"></div><span>Contacting Watsonx.ai for insights... Please wait.</span></div>)}
          {aiError && (<div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"><strong>Error:</strong> {aiError}</div>)}
          {aiAnalysis && (
            <div className="mt-4 p-4 border border-indigo-200 rounded-lg bg-indigo-50">
              <h4 className="text-md font-semibold mb-2 text-indigo-900">AI Financial Summary:</h4>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{aiAnalysis}</p>
            </div>
          )}
        </div>
      )}

      {/* ✅ New Instructions Section */}
        <div className="mt-6 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
          <h2 className="text-lg font-semibold text-yellow-800 mb-2">Instructions</h2>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            <li>Upload your Profit & Loss (PnL) statement in PDF or image format.</li>
            <li>The system will automatically run OCR to extract text from your document.</li>
            <li>Rows should follow the format <code>Jan-24 Revenue Expenses Interest EMI Cash</code>.</li>
            <li>Once data is parsed, you can review the raw OCR output and structured rows.</li>
            <li>Click <strong>Save Extracted Data</strong> to store the results in the <code>pnl</code> database table.</li>
            <li>Optionally, use <strong>Analyze with Watsonx AI</strong> to generate automated financial insights.</li>
          </ul>
        </div>
        

      
    </div>
  );
}