import React from 'react';

export default function AiReport({ reportText }) {
  if (!reportText) {
    return null;
  }

  // Helper function to render markdown-style bold text (e.g., **text**) as <strong> tags
  const renderWithBold = (text) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="text-gray-800">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <div className="bg-white p-6 sm:p-8 rounded-xl shadow-md space-y-4 animate-fade-in text-left">
      <h3 className="text-xl font-bold text-gray-800 border-b pb-3 mb-4">Detailed AI-Generated Analysis</h3>
      {/* The whitespace-pre-wrap class is important to maintain formatting like newlines from the AI response */}
      <div className="text-gray-600 text-sm space-y-4 whitespace-pre-wrap">
        {reportText.trim().split('\n\n').map((paragraph, pIndex) => (
          <p key={pIndex}>{renderWithBold(paragraph)}</p>
        ))}
      </div>
    </div>
  );
}

