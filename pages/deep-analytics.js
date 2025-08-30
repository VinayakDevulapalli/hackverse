import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';

// Import all components
import GaugeChart from '../components/charts/gaugeChart';
import PnlTrendChart from '../components/charts/pnlChart';
import CashFlowBarChart from '../components/charts/barChart';
import AiReport from '../components/aiReport';

// A reusable component for displaying each metric in a styled card
function MetricCard({ title, value, description, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-4">
          <div className="bg-blue-100 p-3 rounded-full">{icon}</div>
          <p className="text-gray-500 font-medium">{title}</p>
        </div>
        <p className="mt-4 text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
    </div>
  );
}

export default function DeepAnalyticsPage() {
  const [metrics, setMetrics] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [pnlHistory, setPnlHistory] = useState([]);
  const [cashFlowData, setCashFlowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // State for the AI Report visibility and content
  const [showAiReport, setShowAiReport] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [aiReportText, setAiReportText] = useState('');
  const [reportError, setReportError] = useState('');


  useEffect(() => {
    const fetchDataAndCalculate = async () => {
      try {
        const { data: pnlData, error: pnlError } = await supabase
          .from('pnl')
          .select('*')
          .order('month', { ascending: true });
        
        if (pnlError) throw new Error(`Could not fetch P&L data: ${pnlError.message}`);
        if (!pnlData || pnlData.length === 0) throw new Error('No P&L data found.');
        
        setPnlHistory(pnlData);
        const latestPnl = pnlData[pnlData.length - 1];
  
        const { data: transactionsData, error: transError } = await supabase
          .from('transactions')
          .select('amount, transaction_type');
        
        if (transError) throw new Error(`Could not fetch transactions: ${transError.message}`);
  
        // Basic P&L metrics
        const revenue = latestPnl.revenue || 0;
        const operatingExpenses = latestPnl.operating_expenses || 0;
        const interestExpense = latestPnl.interest_expense || 0;
        const emi = latestPnl.emi_total || 1;
  
        // Calculate Net Profit Margin
        const netProfit = revenue - operatingExpenses - interestExpense - emi;
        const netProfitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  
        // Calculate DSCR (Debt Service Coverage Ratio)
        const operatingIncome = revenue - operatingExpenses;
        const dscr = emi > 0 ? operatingIncome / emi : 0;
  
        // Calculate Operating Expense Ratio
        const operatingExpenseRatio = revenue > 0 ? (operatingExpenses / revenue) * 100 : 0;
  
        // Transaction-based cash flow calculation
        let totalCredits = 0;
        let totalDebits = 0;
  
        transactionsData.forEach(transaction => {
          const amount = Math.abs(transaction.amount); // Ensure positive for calculations
          
          if (transaction.transaction_type === 'CREDIT') {
            totalCredits += amount;
          } else if (transaction.transaction_type === 'DEBIT') {
            totalDebits += amount;
          }
        });
  
        // Net Cash Flow = Inflows - Outflows
        const monthlyNetCashFlow = totalCredits - totalDebits;
  
        // Cash Flow to EMI Ratio
        const cashFlowToEmiRatio = emi > 0 ? Math.abs(monthlyNetCashFlow) / emi : 0;
  
        // Eligibility criteria
        const isEligible = 
          dscr >= 1.25 && 
          netProfitMargin > 5 && 
          monthlyNetCashFlow > 0 && 
          cashFlowToEmiRatio >= 1.5;
  
        setMetrics({
          netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
          dscr: parseFloat(dscr.toFixed(2)),
          monthlyNetCashFlow: parseFloat(monthlyNetCashFlow.toFixed(2)),
          cashFlowToEmiRatio: parseFloat(cashFlowToEmiRatio.toFixed(2)),
          operatingExpenseRatio: parseFloat(operatingExpenseRatio.toFixed(2)),
          emi_total: emi,
          totalCredits: parseFloat(totalCredits.toFixed(2)),
          totalDebits: parseFloat(totalDebits.toFixed(2)),
        });
  
        setEligibility({
          status: isEligible ? 'Eligible' : 'Not Eligible',
          reason: isEligible 
            ? 'Applicant meets all key financial criteria.' 
            : getEligibilityFailureReason(dscr, netProfitMargin, monthlyNetCashFlow, cashFlowToEmiRatio),
        });
  
        setCashFlowData([{ 
          name: 'Latest Month Comparison', 
          monthlyNetCashFlow, 
          emi_total: emi,
          totalCredits,
          totalDebits
        }]);
  
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
  
    // Helper function to provide specific failure reasons
    const getEligibilityFailureReason = (dscr, netProfitMargin, cashFlow, cashFlowRatio) => {
      const failures = [];
      
      if (dscr < 1.25) failures.push(`DSCR too low (${dscr.toFixed(2)} < 1.25)`);
      if (netProfitMargin <= 5) failures.push(`Net profit margin too low (${netProfitMargin.toFixed(2)}% ≤ 5%)`);
      if (cashFlow <= 0) failures.push(`Negative cash flow (₹${cashFlow.toFixed(2)})`);
      if (cashFlowRatio < 1.5) failures.push(`Cash flow to EMI ratio too low (${cashFlowRatio.toFixed(2)} < 1.5)`);
      
      return failures.join('; ');
    };
  
    fetchDataAndCalculate();
  }, []);
  const handleGenerateReport = async () => {
    setReportLoading(true);
    setShowAiReport(false);
    setAiReportText('');
    setReportError('');

    try {
      const response = await fetch('/api/reportAnalysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics, eligibility }),
      });

      // **THE FIX**: This block now handles errors without consuming the body twice.
      if (!response.ok) {
        // Read the response body as text ONCE.
        const errorText = await response.text();
        let errorMsg;
        try {
          // Try to parse the text as JSON.
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.details || errorData.message || errorText;
        } catch (e) {
          // If it's not JSON, use the raw text as the error.
          errorMsg = errorText;
        }
        throw new Error(errorMsg || `Server responded with status: ${response.status}`);
      }

      const data = await response.json();
      setAiReportText(data.report);
      setShowAiReport(true);

    } catch (err) {
      console.error("Failed to generate report:", err);
      setReportError(`Report Generation Failed: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
        <p className="mt-4 text-gray-700">Running Deep Analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-red-50 text-red-700 p-6">
        <h2 className="text-2xl font-bold">An Error Occurred</h2>
        <p className="mt-2">{error}</p>
        <Link href="/" className="mt-8 text-blue-500 hover:underline">
          &larr; Go Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Deep Analytics Report</h1>
          <Link href="/" className="text-blue-600 hover:underline font-medium">&larr; Back to Home</Link>
        </div>

        {eligibility && ( 
          <div className={`p-6 rounded-xl mb-8 shadow-lg ${eligibility.status === 'Eligible' ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-start gap-4">
              <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${eligibility.status === 'Eligible' ? 'bg-green-100' : 'bg-red-100'}`}>
                {eligibility.status === 'Eligible' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Loan Eligibility Status</p>
                <p className={`text-2xl font-bold ${eligibility.status === 'Eligible' ? 'text-green-700' : 'text-red-700'}`}>{eligibility.status}</p>
                <p className="mt-1 text-sm text-gray-600">{eligibility.reason}</p>
              </div>
            </div>
          </div> 
        )}

        {metrics && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <MetricCard title="Net Profit Margin" value={`${metrics.netProfitMargin}%`} description="Measures profitability. (Threshold: > 5%)" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
              <MetricCard title="DSCR" value={metrics.dscr} description="Measures ability to pay back debt. (Threshold: ≥ 1.25)" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8l3 5m0 0l3-5m-3 5v4m0 0H9m3 0h3m-3-5a9 9 0 110-18 9 9 0 010 18z" /></svg>} />
              <MetricCard title="Monthly Net Cash Flow" value={`₹${metrics.monthlyNetCashFlow}`} description="Cash generated per month. Must be positive." icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-lg font-semibold text-gray-700 text-center">Net Profit Margin</h3><GaugeChart name="Profit Margin" value={metrics.netProfitMargin} target={5} unit="%" /></div>
              <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-lg font-semibold text-gray-700 text-center">Debt Service Coverage Ratio (DSCR)</h3><GaugeChart name="DSCR" value={metrics.dscr} target={1.25} /></div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-lg font-semibold text-gray-700 mb-4">Monthly Net Cash Flow vs. EMI</h3><CashFlowBarChart data={cashFlowData} /></div>
            <div className="bg-white p-6 rounded-xl shadow-md"><h3 className="text-lg font-semibold text-gray-700 mb-4">P&L Trend (All Months)</h3><PnlTrendChart data={pnlHistory} /></div>

            {/* --- AI Report Section --- */}
            <div className="text-center pt-4">
              {!showAiReport && (
                <button onClick={handleGenerateReport} disabled={reportLoading} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors">
                  {reportLoading ? (
                    <div className="flex items-center justify-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div><span>Generating Report...</span></div>
                  ) : ('Generate Detailed AI Report')}
                </button>
              )}
            </div>
            
            {reportError && !showAiReport && (
              <div className="mt-4 text-center bg-red-100 text-red-700 p-4 rounded-lg">
                <p>{reportError}</p>
              </div>
            )}

            {showAiReport && <AiReport reportText={aiReportText} />}
          </div>
        )}
      </div>
    </div>
  );
}

