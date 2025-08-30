// components/parsers/pnlParsers/standardPnLParser.js

export default class StandardPnLParser {
    constructor() {
      this.name = 'Standard P&L Parser';
    }
  
    /**
     * Clean raw OCR output for P&L statements
     */
    cleanOCROutput(rawText) {
      if (!rawText) return '';
  
      let cleanedText = rawText
        // Remove page headers/footers
        .replace(/=== PAGE \d+ ===/g, '\n--- PAGE BREAK ---\n')
        
        // Clean up common OCR artifacts
        .replace(/[|]/g, ' ')  // Remove pipe characters
        .replace(/_{3,}/g, '')  // Remove multiple underscores
        .replace(/[-]{3,}/g, '')  // Remove multiple dashes
        
        // Fix common P&L statement patterns
        .replace(/(\d+,?\d*\.?\d*)\s*\(\s*(\d+,?\d*\.?\d*)\s*\)/g, '$1 ($2)')  // Fix parentheses around numbers
        .replace(/(\w+)\s+(\d+,?\d*\.?\d*)/g, '$1: $2')  // Add colons after line items
        
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
  
      return cleanedText;
    }
  
    /**
     * Create simplified output focusing on key P&L components
     */
    cleanOCROutputSimplified(rawText) {
      const cleaned = this.cleanOCROutput(rawText);
      
      if (!cleaned) return '';
  
      const lines = cleaned.split('\n');
      const simplifiedLines = [];
  
      // P&L keywords to identify important sections
      const pnlKeywords = [
        'revenue', 'income', 'sales', 'gross profit', 'gross loss',
        'operating expenses', 'operating income', 'operating loss',
        'net profit', 'net loss', 'net income', 'ebitda', 'ebit',
        'cost of goods sold', 'cogs', 'total revenue', 'total income',
        'total expenses', 'depreciation', 'amortization', 'interest',
        'tax', 'other income', 'other expenses'
      ];
  
      for (const line of lines) {
        const lowercaseLine = line.toLowerCase();
        
        // Check if line contains P&L keywords or monetary amounts
        const hasKeyword = pnlKeywords.some(keyword => lowercaseLine.includes(keyword));
        const hasAmount = /\d+,?\d*\.?\d*/.test(line);
        
        if (hasKeyword || (hasAmount && line.length > 5)) {
          simplifiedLines.push(line.trim());
        }
      }
  
      return simplifiedLines.join('\n');
    }
  
    /**
     * Categorize P&L entries into standard categories
     */
    categorizeEntries(simplifiedText) {
      if (!simplifiedText) return '';
  
      const lines = simplifiedText.split('\n').filter(line => line.trim());
      const categorizedEntries = [];
  
      // P&L categories with their keywords
      const categories = {
        'REVENUE': {
          keywords: ['revenue', 'sales', 'income', 'turnover', 'total revenue', 'gross sales'],
          entries: []
        },
        'COST_OF_GOODS_SOLD': {
          keywords: ['cost of goods sold', 'cogs', 'cost of sales', 'direct costs'],
          entries: []
        },
        'GROSS_PROFIT': {
          keywords: ['gross profit', 'gross income', 'gross margin'],
          entries: []
        },
        'OPERATING_EXPENSES': {
          keywords: ['operating expenses', 'opex', 'administrative expenses', 'selling expenses'],
          entries: []
        },
        'OPERATING_INCOME': {
          keywords: ['operating income', 'operating profit', 'ebitda', 'ebit'],
          entries: []
        },
        'OTHER_INCOME': {
          keywords: ['other income', 'non-operating income', 'interest income'],
          entries: []
        },
        'OTHER_EXPENSES': {
          keywords: ['other expenses', 'non-operating expenses', 'interest expense', 'depreciation', 'amortization'],
          entries: []
        },
        'NET_INCOME': {
          keywords: ['net income', 'net profit', 'net loss', 'profit after tax', 'pat'],
          entries: []
        },
        'UNCATEGORIZED': {
          keywords: [],
          entries: []
        }
      };
  
      // Categorize each line
      for (const line of lines) {
        const lowercaseLine = line.toLowerCase();
        let categorized = false;
  
        for (const [categoryKey, category] of Object.entries(categories)) {
          if (categoryKey === 'UNCATEGORIZED') continue;
          
          const hasKeyword = category.keywords.some(keyword => 
            lowercaseLine.includes(keyword)
          );
  
          if (hasKeyword) {
            category.entries.push(line);
            categorized = true;
            break;
          }
        }
  
        if (!categorized) {
          categories.UNCATEGORIZED.entries.push(line);
        }
      }
  
      // Format output
      let result = 'P&L STATEMENT ANALYSIS\n';
      result += '=' + '='.repeat(50) + '\n\n';
  
      for (const [categoryKey, category] of Object.entries(categories)) {
        if (category.entries.length > 0) {
          const categoryName = categoryKey.replace(/_/g, ' ');
          result += `${categoryName}:\n`;
          result += '-'.repeat(categoryName.length + 1) + '\n';
          
          category.entries.forEach(entry => {
            result += `  ${entry}\n`;
          });
          result += '\n';
        }
      }
  
      // Add summary statistics
      const totalEntries = lines.length;
      const categorizedCount = totalEntries - categories.UNCATEGORIZED.entries.length;
      
      result += `SUMMARY:\n`;
      result += `--------\n`;
      result += `Total entries processed: ${totalEntries}\n`;
      result += `Categorized entries: ${categorizedCount}\n`;
      result += `Uncategorized entries: ${categories.UNCATEGORIZED.entries.length}\n`;
      result += `Categorization rate: ${((categorizedCount/totalEntries) * 100).toFixed(1)}%\n`;
  
      return result;
    }
  
    /**
     * Extract monetary amounts from text
     */
    extractAmounts(text) {
      const amountPattern = /(?:₹|Rs\.?|INR)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
      const amounts = [];
      let match;
  
      while ((match = amountPattern.exec(text)) !== null) {
        amounts.push({
          amount: match[1],
          position: match.index,
          fullMatch: match[0]
        });
      }
  
      return amounts;
    }
  }