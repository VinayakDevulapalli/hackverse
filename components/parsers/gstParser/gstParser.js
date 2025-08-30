// components/parsers/gstParsers/standardGST3BParser.js

export default class StandardGST3BParser {
    constructor() {
      this.name = 'Standard GST 3B Parser';
    }
  
    /**
     * Clean raw OCR output for GST statements
     */
    cleanOCROutput(rawText) {
      if (!rawText) return '';
  
      let cleanedText = rawText
        // Remove page headers/footers
        .replace(/GSTR-3B/g, '')
        .replace(/=== PAGE \d+ ===/g, '\n--- PAGE BREAK ---\n')
  
        // Remove unnecessary formatting characters
        .replace(/[|]/g, ' ')
        .replace(/_{3,}/g, '')
        .replace(/[-]{3,}/g, '')
  
        // Normalize currency symbols
        .replace(/Rs\.?/gi, '₹')
        .replace(/INR/gi, '₹')
  
        // Clean whitespace
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
  
      return cleanedText;
    }
  
    /**
     * Simplify OCR output to keep only GST relevant lines
     */
    cleanOCROutputSimplified(rawText) {
      const cleaned = this.cleanOCROutput(rawText);
      if (!cleaned) return '';
  
      const lines = cleaned.split('\n');
      const simplifiedLines = [];
  
      const gstKeywords = [
        'outward supplies', 'taxable value', 'igst', 'cgst', 'sgst', 'cess',
        'eligible itc', 'inward supplies', 'exempt', 'non gst', 'payment of tax',
        'interest', 'late fee', 'reverse charge', 'supplies made to', 'total'
      ];
  
      for (const line of lines) {
        const lowercaseLine = line.toLowerCase();
        const hasKeyword = gstKeywords.some(keyword => lowercaseLine.includes(keyword));
        const hasAmount = /\d{1,3}(?:,\d{3})*(?:\.\d{2})?/.test(line);
  
        if (hasKeyword || hasAmount) {
          simplifiedLines.push(line.trim());
        }
      }
  
      return simplifiedLines.join('\n');
    }
  
    /**
     * Categorize GST entries into structured sections
     */
    categorizeEntries(simplifiedText) {
      if (!simplifiedText) return '';
  
      const lines = simplifiedText.split('\n').filter(line => line.trim());
      const categories = {
        'OUTWARD_SUPPLIES': { keywords: ['outward supplies'], entries: [] },
        'ELIGIBLE_ITC': { keywords: ['eligible itc', 'inward supplies'], entries: [] },
        'EXEMPT_NONGST': { keywords: ['exempt', 'non gst'], entries: [] },
        'PAYMENT_OF_TAX': { keywords: ['payment of tax', 'tax payable'], entries: [] },
        'INTEREST_LATE_FEE': { keywords: ['interest', 'late fee'], entries: [] },
        'SUMMARY_TOTALS': { keywords: ['total'], entries: [] },
        'UNCATEGORIZED': { keywords: [], entries: [] }
      };
  
      for (const line of lines) {
        const lowercaseLine = line.toLowerCase();
        let categorized = false;
  
        for (const [categoryKey, category] of Object.entries(categories)) {
          if (categoryKey === 'UNCATEGORIZED') continue;
  
          if (category.keywords.some(keyword => lowercaseLine.includes(keyword))) {
            category.entries.push(line);
            categorized = true;
            break;
          }
        }
  
        if (!categorized) categories.UNCATEGORIZED.entries.push(line);
      }
  
      // Build output
      let result = 'GST 3B STATEMENT ANALYSIS\n';
      result += '='.repeat(50) + '\n\n';
  
      for (const [categoryKey, category] of Object.entries(categories)) {
        if (category.entries.length > 0) {
          const categoryName = categoryKey.replace(/_/g, ' ');
          result += `${categoryName}:\n`;
          result += '-'.repeat(categoryName.length + 1) + '\n';
          category.entries.forEach(entry => (result += `  ${entry}\n`));
          result += '\n';
        }
      }
  
      result += `SUMMARY:\n--------\n`;
      result += `Total entries processed: ${lines.length}\n`;
      result += `Uncategorized: ${categories.UNCATEGORIZED.entries.length}\n`;
      return result;
    }
  
    /**
     * Extract monetary amounts from GST text
     */
    extractAmounts(text) {
      const amountPattern = /(?:₹)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
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
  