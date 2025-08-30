// pages/index.js

import { useState } from 'react';
import Link from 'next/link';
import OCRBankStatementReader from '../components/OCRBankStatementReader';
import OCRPnLStatementReader from '../components/pnlStatementReader';
import OCRGstReader from '../components/gstReader';

import ChatBot from '../components/chatBot';



export default function HomePage() {
  const [analysisSummary, setAnalysisSummary] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ 1. Add state to track if each document has been processed
  const [isBankStatementProcessed, setIsBankStatementProcessed] = useState(false);
  const [isPnlProcessed, setIsPnlProcessed] = useState(false);
  const [isGstProcessed, setIsGstProcessed] = useState(false);

  const handleGetAnalysis = async () => {
    // ... (this function remains the same)
    setIsLoading(true);
    setError('');
    setAnalysisSummary('');
    try {
      const response = await fetch('/api/getAnalysis');
      if (!response.ok) {
        throw new Error('Failed to fetch analysis from the server.');
      }
      const data = await response.json();
      setAnalysisSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ 2. Create a variable to easily check if both are done
  const areBothStatementsProcessed = isBankStatementProcessed && isPnlProcessed && isGstProcessed;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* ✅ 3. Pass the state-setting functions down as props */}
        <OCRBankStatementReader onProcessComplete={setIsBankStatementProcessed} />
        <OCRPnLStatementReader onProcessComplete={setIsPnlProcessed} />
        <OCRGstReader onProcessComplete={setIsGstProcessed}/>

  <div className="fixed bottom-4 right-4">
    <ChatBot />
  </div>

        <div className="mt-12 p-6 bg-white rounded-lg shadow-lg">
          <div className="flex flex-col md:flex-row items-center justify-center gap-4">
            
            
            <Link 
              href="/deep-analytics"
              // The 'pointer-events-none' and 'opacity-50' classes visually disable the Link
              className={`px-6 py-3 bg-indigo-600 text-white text-center font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-colors w-full md:w-auto ${
                !areBothStatementsProcessed ? "pointer-events-none opacity-50" : ""
              }`}
              aria-disabled={!areBothStatementsProcessed}
              tabIndex={!areBothStatementsProcessed ? -1 : undefined}
            >
              Deep Analysis
            </Link>

          </div>
          
          {analysisSummary && (
            <div className="mt-6 p-4 border border-green-200 rounded-lg bg-green-50">
              <h3 className="text-md font-semibold mb-2 text-green-900">Analysis Summary:</h3>
              <p className="text-sm text-gray-800">{analysisSummary}</p>
            </div>
          )}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}