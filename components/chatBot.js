// components/ChatBot.js - Updated to handle async data loading
import { useState, useEffect, useRef } from 'react';
import { getDataStore, refreshDataFromDatabase } from '../lib/dataStore';

export default function ChatBot() {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: 'Hello! I\'m your financial assistant. Upload your documents first (Bank Statement, P&L, GST Return), then ask me questions about your financial data.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dataStoreState, setDataStoreState] = useState({
    gstOCROutput: null,
    categorizedOutput: null,
    pnlOCROutput: null
  });
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load data on component mount and refresh periodically
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await refreshDataFromDatabase();
        setDataStoreState(data);
      } catch (error) {
        console.error('Failed to load data:', error);
      }
    };

    loadData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = { 
      role: 'user', 
      content: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      const assistantMessage = { 
        role: 'assistant', 
        content: data.reply,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(err.message);
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([
      { 
        role: 'assistant', 
        content: 'Chat cleared. How can I help you with your financial data?',
        timestamp: new Date()
      }
    ]);
    setError('');
  };

  const handleRefreshData = async () => {
    try {
      const data = await refreshDataFromDatabase();
      setDataStoreState(data);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    }
  };

  // Check what data is available from state
  const availableData = [
    dataStoreState.gstOCROutput && 'GST Return',
    dataStoreState.categorizedOutput && 'Bank Statement', 
    dataStoreState.pnlOCROutput && 'P&L Data'
  ].filter(Boolean);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 max-w-4xl mx-auto flex flex-col h-[600px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 rounded-t-xl flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Financial Assistant</h2>
              <p className="text-blue-100 text-sm">AI-powered financial analysis</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleRefreshData}
              className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-sm transition-colors"
              title="Refresh data from database"
            >
              🔄 Refresh
            </button>
            <button 
              onClick={clearChat}
              className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
            >
              Clear Chat
            </button>
          </div>
        </div>
        
        {/* Data Status */}
        <div className="flex flex-wrap gap-2 mt-3">
          {availableData.length > 0 ? (
            availableData.map(dataType => (
              <span key={dataType} className="px-2 py-1 bg-green-500/20 text-green-100 text-xs rounded-full border border-green-400/30">
                ✓ {dataType}
              </span>
            ))
          ) : (
            <span className="px-3 py-1 bg-yellow-500/20 text-yellow-100 text-xs rounded-full border border-yellow-400/30">
              Upload documents to get started
            </span>
          )}
        </div>

        {/* Debug Info */}
        <div className="mt-2 text-xs text-blue-100">
          Data Store Status: Bank({!!dataStoreState.categorizedOutput ? '✓' : '✗'}) | 
          GST({!!dataStoreState.gstOCROutput ? '✓' : '✗'}) | 
          P&L({!!dataStoreState.pnlOCROutput ? '✓' : '✗'})
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm ${
              message.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-md'
                : 'bg-white text-gray-800 rounded-bl-md border border-gray-200'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              <p className={`text-xs mt-1 ${message.role === 'user' ? 'text-blue-100' : 'text-gray-400'}`}>
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}
        
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
                </div>
                <span className="text-gray-500 text-sm">Analyzing...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200">
          <p className="text-red-700 text-sm">Error: {error}</p>
        </div>
      )}

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4 bg-white rounded-b-xl flex-shrink-0">
        <div className="flex space-x-3">
          <div className="flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about cash flow, expenses, revenue trends..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              rows="2"
              disabled={loading}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center min-w-[60px]"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        
        {/* Quick Actions */}
        <div className="mt-2 flex flex-wrap gap-1">
          {[
            'What is my cash flow trend?',
            'Analyze my expenses', 
            'Show GST summary',
            'Revenue analysis'
          ].map((suggestion) => (
            <button 
              key={suggestion}
              onClick={() => setInput(suggestion)}
              disabled={loading}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}