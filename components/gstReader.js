// components/GST3BDataTableReader.js

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';

import { updateGSTData } from '../lib/dataStore';

// Setup PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

// --- GST3B Parser ---
const GST3BParser = {
  parse: (text) => {
    const sections = {
      outward_supplies: null,
      taxable_value: null,
      igst: null,
      cgst: null,
      sgst: null,
      cess: null,
      eligible_itc: null,
      itc_reversed: null,
      net_itc: null,
      tax_payable: null,
      tax_paid: null,
    };

    // Normalize text for easier regex matching
    const lowerText = text.toLowerCase();

    // Simple regex extractions (expand as needed)
    const getAmount = (pattern) => {
      const match = lowerText.match(pattern);
      if (!match) return null;
      const number = match[1].replace(/,/g, '');
      return parseFloat(number) || null;
    };

    sections.taxable_value = getAmount(/taxable value[^0-9]*([\d,]+\.\d{1,2})/);
    sections.igst = getAmount(/igst[^0-9]*([\d,]+\.\d{1,2})/);
    sections.cgst = getAmount(/cgst[^0-9]*([\d,]+\.\d{1,2})/);
    sections.sgst = getAmount(/sgst[^0-9]*([\d,]+\.\d{1,2})/);
    sections.cess = getAmount(/cess[^0-9]*([\d,]+\.\d{1,2})/);
    sections.eligible_itc = getAmount(/eligible itc[^0-9]*([\d,]+\.\d{1,2})/);
    sections.net_itc = getAmount(/net itc[^0-9]*([\d,]+\.\d{1,2})/);
    sections.tax_payable = getAmount(/tax payable[^0-9]*([\d,]+\.\d{1,2})/);
    sections.tax_paid = getAmount(/tax paid[^0-9]*([\d,]+\.\d{1,2})/);

    return sections;
  }
};

export default function GST3BDataTableReader({ onProcessComplete }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrOutput, setOcrOutput] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const convertPDFToImages = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const images = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      setOcrProgress(`Converting page ${i} of ${pdf.numPages}...`);
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
      setOcrProgress(`OCR page ${i + 1} of ${images.length}...`);
      const { data: { text } } = await Tesseract.recognize(
        images[i], 'eng',
        { logger: m => { if (m.status === 'recognizing text') setOcrProgress(`Page ${i + 1}: ${Math.round(m.progress * 100)}%`); } }
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
    setParsedData(null);
    setSaveSuccess(false);

  if(onProcessComplete) onProcessComplete(false);

    try {
      const images = await convertPDFToImages(uploadedFile);
      const extractedText = await performOCR(images);
      setOcrOutput(extractedText);
      updateGSTData(extractedText); 

      setOcrProgress('Parsing GST-3B data...');
      const data = GST3BParser.parse(extractedText);
      setParsedData(data);

      if (Object.values(data).every(v => v === null)) {
        setError("Could not extract GST data. OCR text may need cleanup.");
        if (onProcessComplete) onProcessComplete(false);
      } else {
        setOcrProgress('Parsing complete.');
        if (onProcessComplete) onProcessComplete(true);
      }
    } catch (err) {
      setError('Error: ' + err.message);
      if (onProcessComplete) onProcessComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const saveToDatabase = async () => {
    if (!parsedData) return;
    setSaveLoading(true);
    setError('');
    try {
      const { error } = await supabase.from('gst3b').insert([parsedData]);
      if (error) throw error;
      setSaveSuccess(true);
      if(onProcessComplete) onProcessComplete(true);
    } catch (err) {
      setError('Save failed: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-lg">
            3
          </div>
          <h2 className="text-lg font-semibold text-gray-800">Upload Your GST-3B Return</h2>
        </div>

        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-8 h-8 mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
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

      {/* {ocrOutput && (
        <textarea value={ocrOutput} readOnly className="w-full h-60 mt-4 p-2 border font-mono text-xs bg-gray-50" />
      )} */}

      {parsedData && (
        <div className="mt-4 p-4 bg-gray-50 rounded border">
          <h3 className="font-semibold text-gray-700">Parsed GST-3B Data:</h3>
          <pre className="text-xs mt-2">{JSON.stringify(parsedData, null, 2)}</pre>
          <button onClick={saveToDatabase} disabled={saveLoading || saveSuccess}
            className={`mt-3 px-4 py-2 text-white rounded ${saveSuccess ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {saveSuccess ? 'Saved ✓' : saveLoading ? 'Saving...' : 'Saved to Database'}
          </button>
        </div>
      )}

      {saveSuccess && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          <strong>Success!</strong> Bank statement data has been saved to your database.
        </div>
      )}

      {/* Instructions Section */}
<div className="mb-6 mt-5 p-4 border border-blue-300 bg-blue-50 rounded-lg shadow-sm">
  <h2 className="text-lg font-semibold text-blue-700 mb-2">Instructions</h2>
  <ul className="list-disc list-inside text-gray-700 space-y-1">
    <li>Upload your statement in <span className="font-medium">.pdf</span> format only.</li>
    <li>Ensure the document is clear and text is readable (scanned copies may not work well).</li>
    <li>Bank statements: Credits will be shown as positive, Debits as negative.</li>
    <li>PnL & GST reports should be in their respective formats.</li>
    <li>Once uploaded, wait a few seconds for processing before analysis.</li>
  </ul>
</div>



    </div>
  );
}
