// parsers/KotakParser.js

import BaseParser from './baseParser.js';

export default class KotakParser extends BaseParser {
  constructor() {
    super('Kotak');
  }

  /**
   * Defines the regular expressions specific to Kotak Bank statements.
   */
  getPatterns() {
    return {
        // Transaction line starts with a DD-MM-YYYY date format
        transaction: /^\d{2}-\d{2}-\d{4}\s+/,
        
        // Generic patterns to identify header/footer/metadata lines
        headers: [
          // Page and document structure
          /^={3,}\s*PAGE/i,                    // Page separators
          /^(Page|PageNo)[\s:]?\d+(\s+of\s+\d+)?/i, // Page numbers
          
          // Bank identification (any bank)
          /\b(BANK|MAHINDRA|KOTAK)\b/i,        // Bank names
          /\b(IFSC|MICR|RTGS|NEFT)\s+(Code|No)/i, // Banking codes
          
          // Account and customer info patterns
          /^(Account|Acc)\s+(No|Number)\s*[:=]/i, // Account number lines
          /^(Cust|Customer)\s+/i,              // Customer info
          /^Currency\s*[:=]/i,                 // Currency specification
          /^Branch\s*[:=]/i,                   // Branch info
          /^Nominee\s+(Registered|Name)/i,     // Nominee info
          
          // Statement headers and footers
          /^(Date|Txn Date)\s+(Narration|Description)/i, // Table headers
          /^Statement\s+(Summary|Period)/i,    // Statement sections
          /^(Opening|Closing)\s+Balance/i,     // Balance lines
          /^Total\s+(Withdrawal|Deposit|Credit|Debit)/i, // Summary totals
          /^(Withdrawal|Deposit|Credit|Debit)\s+(Count|Amount)/i, // Transaction counts
          
          // Disclaimers and legal text
          /^(Any|All)\s+discrepancy/i,         // Disclaimer start
          /^End\s+of\s+Statement/i,            // Statement end
          /^This\s+is\s+(system|computer)/i,   // System generated
          /^(Generated|Printed)\s+(On|At)/i,   // Generation info
          /does\s+not\s+require\s+(signature|stamp)/i, // Legal disclaimers
          
          // Common document elements
          /^(Registered|Corporate)\s+Office/i,  // Office addresses
          /^For\s+(any|more)\s+(queries|information)/i, // Help text
        ],
        
        // Dynamic continuation patterns
        continuation: [
          // UPI related continuations
          /^\/UP[Il]?intent$/i,               // UPI intent variations
          /^\/Payment(\s|$)/i,                // Payment continuations
          /^from\s+Ph(one)?$/i,               // Phone payment
          
          // Transaction type continuations
          /^\[(Rent|EMI|Loan|Bill)\s+for$/i,  // Payment descriptions in brackets
          /^(repayme|repayment)$/i,           // Repayment continuations
          /^\/[A-Z][a-z]+pay$/i,              // Various pay services (Lazypay, etc.)
          
          // Merchant continuations
          /^I[A-Z][a-z]+Online/i,             // Online service continuations
          /^\d+\s+(will?|rs?)$/i,             // Amount continuations
          /^(Pay\s+to|Transfer\s+to)$/i,      // Transfer descriptions
          /^[A-Z][a-z]+Pe$/i,                 // Payment platforms (BharatPe, etc.)
          /^Only\s+Rs\.?$/i,                  // Amount qualifiers
        ],
        
        // Dynamic personal information patterns
        personalInfo: [
          // Name patterns
          /^(MR|MS|MRS|DR|PROF)\.?\s+[A-Z][A-Za-z\s]+$/,
          /^[A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+(\s+Period)?$/i, // Name with optional "Period"
          
          // Address patterns
          /^(FLAT|APARTMENT|HOUSE|BLDG|BUILDING)\s+(NO\.?|NUMBER)\s*\d+/i,
          /^(FLOOR|FLR)\s*\d+/i,              // Floor numbers
          /^[A-Z\d\s]+(APARTMENT|COMPLEX|RESIDENCY|LAYOUT|COLONY)$/i,
          /^[A-Z\d\s]+(ROAD|STREET|AVENUE|LANE|CROSS)$/i,
          /^[A-Z\d\s]+(NAGAR|PURAM|ENCLAVE|SOCIETY)$/i,
          
          // City and location patterns
          /^[A-Z][a-z]+(ABAD|URU|AI|PORE|TAN|GAR)-\d{6}$/i, // Cities with pincodes
          /^(KARNATAKA|MAHARASHTRA|TAMIL\s+NADU|GUJARAT|DELHI|RAJASTHAN|UP|MP),?\s+(INDIA)?$/i,
          /^INDIA$/i,                         // Country line
          
          // Contact information
          /^(Phone|Mobile|Tel|Contact)\s+(No|Number)\.?\s*[:=]?\s*\d/i,
          /^Email\s*[:=]/i,                   // Email lines
        ]
      };
  }

  /**
   * Cleans raw OCR text by identifying transaction lines and merging them with their continuations.
   */
  cleanOCROutput(rawText) {
    const lines = rawText.split('\n');
    const transactionLines = [];
    const patterns = this.getPatterns();

    const isHeaderLine = (line) => patterns.headers.some(p => p.test(line));
    const isContinuationLine = (line) => patterns.continuation.some(p => p.test(line));
    const isPersonalInfoLine = (line) => patterns.personalInfo.some(p => p.test(line));

    const hasTransactionElements = (line) => {
      return /UPI-\d+/.test(line) ||
             /IMPS-\d+/.test(line) ||
             /NEFTINW-\d+/.test(line) ||
             /MB-\d+/.test(line) ||
             /BF-[a-z0-9]+/.test(line) ||
             /\d+\.\d{2}\((Cr|Dr)\)/.test(line);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || isHeaderLine(line) || isPersonalInfoLine(line)) {
        continue;
      }

      if (patterns.transaction.test(line)) {
        let transactionText = line;
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          if (!nextLine || patterns.transaction.test(nextLine) || isHeaderLine(nextLine)) {
            break;
          }
          if (isContinuationLine(nextLine) || (hasTransactionElements(nextLine) && nextLine.length < 150)) {
            transactionText += ' ' + nextLine;
            i = j;
          } else {
            break;
          }
          j++;
        }
        transactionText = transactionText.replace(/\s+/g, ' ').trim();
        if (transactionText) {
          transactionLines.push(transactionText);
        }
      }
    }
    return transactionLines.join('\n\n');
  }
  
  /**
   * Takes raw text, parses each potential transaction line, and formats it into a simplified structure.
   */
  cleanOCROutputSimplified(rawText) {
    const lines = rawText.split('\n');
    const simplifiedLines = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        const simplified = this.parseTransactionLine(line);
        if (simplified) {
            simplifiedLines.push(simplified);
        }
    }
    return simplifiedLines.join('\n\n');
  }
  
  /**
   * Categorizes transactions as 'credit' or 'debit' based on the (Cr/Dr) indicator.
   */
  categorizeTransactions(simplifiedText) {
    if (!simplifiedText || !simplifiedText.trim()) {
      return '';
    }
  
    const lines = simplifiedText.split('\n').filter(line => line.trim());
    const categorizedLines = [];
    const transactionRegex = /^(\d{2}-\d{2}-\d{4})\s*\|\s*(.+?)\s*\|\s*([\d,]+\.\d{2})\((Cr|Dr)\)/;

    for (const line of lines) {
      const match = line.match(transactionRegex);
  
      if (match) {
        const [, date, description, amount, typeIndicator] = match;
        const transactionType = typeIndicator === 'Cr' ? 'CREDIT' : 'DEBIT';
        categorizedLines.push(`${date} | ${description.trim()} | ${amount} | ${transactionType}`);
      }
    }
    return categorizedLines.join('\n\n');
  }

  /**
   * Parses a single raw transaction line to extract and clean the date, description, and amount.
   */
  parseTransactionLine(transactionLine) {
    const baseRegex = /^(\d{2}-\d{2}-\d{4})\s+(.+?)\s+(\d{1,3}(?:,\d{3})*\.\d{2}\((?:Dr|Cr)\)).*$/;
    const match = transactionLine.match(baseRegex);

    if (!match) {
        return null;
    }

    const [ , date, fullDescription, amount] = match;
    let cleanedDescription = 'UNKNOWN';

    // Refined parsing logic for various transaction types
    if (fullDescription.startsWith('NEFT')) {
        const neftMatch = fullDescription.match(/^NEFT\s+[A-Z0-9]+\s+(.+?)\s+NEFTINW-\d+/);
        if (neftMatch) cleanedDescription = neftMatch[1];
    } else if (fullDescription.startsWith('MB:RECEIVED FROM')) {
        const mbMatch = fullDescription.match(/MB:RECEIVED FROM\s+(.+?)\s+MB-\d+/);
        if (mbMatch) cleanedDescription = mbMatch[1];
    } else if (fullDescription.toUpperCase().includes('IMPS')) {
        const impsMatch = fullDescription.match(/(?:SentIMPS|Senilupss21)\d*([A-Za-z\s\.]+?)(?:\/|IMPS)/);
        if (impsMatch) cleanedDescription = impsMatch[1];
    } else if (fullDescription.startsWith('CASHBACK EARNED')) {
        cleanedDescription = 'CASHBACK EARNED';
    } else if (fullDescription.includes('/')) {
        const parts = fullDescription.split('/');
        const firstPart = parts[0];
        if (/^(UPI|UPU|UPV|UPl|UP1)$/i.test(firstPart)) {
            cleanedDescription = parts[1];
        } else {
            cleanedDescription = firstPart.replace(/^(UPI|UPU|UPV|UPl|UP1)/i, '');
        }
    }

    return `${date} | ${cleanedDescription.trim()} | ${amount}`;
  }
}