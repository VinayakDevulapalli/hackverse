// parsers/HDFCParser.js

import BaseParser from './baseParser.js';

export default class HDFCParser extends BaseParser {
  constructor() {
    super('HDFC');
  }

  getPatterns() {
    return {
      // Transaction line: starts with date pattern
      transaction: /^\d{2}\/\d{2}\/\d{2}\s*\|/,
      
      // Header patterns (more flexible)
      headers: [
        /^={3,}\s*PAGE/i,           // Page markers
        /^(Page No|PageNo)[:.]?\s*\d+/i,  // Page numbers
        /HDFC\s+BANK/i,             // Bank name
        /Account\s+Branch/i,        // Account info
        /Address\s*:/i,             // Address lines
        /Phone\s+no/i,              // Phone
        /Cust\s+ID/i,               // Customer ID
        /Account(No|Number)/i,      // Account number
        /RTGS\/NEFT/i,              // Banking codes
        /Statement\s+of\s+account/i, // Statement header
        /From\s*:\s*\d{2}\/\d{2}/i, // Date range
        /Closing\s+Balance/i,       // Table headers
        /Withdrawal\s+Amt/i,        // Table headers
        /STATEMENT\s+SUMMARY/i,     // Summary section
        /Generated\s+On:/i,         // Generation info
        /computer\s+generated/i,    // Disclaimers
        /^\*.*funds.*earmarked/i,   // Disclaimers
        /Contents\s+of\s+this/i,    // Disclaimers
        /Registered\s+Office/i,     // Address info
      ],
      
      // Continuation patterns (UPI details, bank codes, etc.)
      continuation: [
        /@[A-Z0-9\-]+/,             // Email-like patterns (@OKAXIS, @HDFCBANK)
        /[A-Z]{3,}BANK/,            // Bank names
        /-UPI$/,                    // UPI endings
        /-UPT$/,                    // UPT endings  
        /-PAY$/,                    // PAY endings
        /^[A-Z0-9@\-]{8,}$/,        // Long alphanumeric codes
        /HDFC\d{7}/,                // HDFC reference numbers
        /ICIC\d{7}/,                // ICICI reference numbers
      ],
      
      // Likely personal info (addresses, names)
      personalInfo: [
        /^(MR|MS|MRS)\s+[A-Z\s]+$/,
        /^FLAT\s+NO\s+\d+/i,
        /^(LIVING|APARTMENT|ROAD|STREET)/i,
        /^(BANGALORE|BENGALURU|MUMBAI|DELHI|CHENNAI|KOLKATA)/i,
        /^[A-Z\s]+(NAGAR|COLONY|LAYOUT|CROSS)/i,
      ]
    };
  }

  cleanOCROutput(rawText) {
    const lines = rawText.split('\n');
    const transactionLines = [];
    const patterns = this.getPatterns();
    
    
    const isHeaderLine = (line) => {
      return patterns.headers.some(pattern => pattern.test(line));
    };
    
    const isContinuationLine = (line) => {
      // Check if it's likely a continuation of transaction details
      return patterns.continuation.some(pattern => pattern.test(line)) ||
             (line.length > 5 && /^[A-Z0-9@\-\s]+$/.test(line) && !isHeaderLine(line));
    };
    
    const isPersonalInfoLine = (line) => {
      return patterns.personalInfo.some(pattern => pattern.test(line));
    };
    
    const isLikelyTransactionData = (line) => {
      // Contains numbers that look like amounts or dates
      return /\d{1,3}(?:,\d{3})*(?:\.\d{2})?/.test(line) || 
             /\d{2}\/\d{2}\/\d{2}/.test(line);
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Skip obvious headers and personal info
      if (isHeaderLine(line) || isPersonalInfoLine(line)) continue;
      
      // Look for transaction lines
      if (patterns.transaction.test(line)) {
        let transactionText = line;
        
        // Collect continuation lines
        let j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j].trim();
          
          // Stop if we hit another transaction, header, or empty line
          if (!nextLine || 
              patterns.transaction.test(nextLine) ||
              isHeaderLine(nextLine)) {
            break;
          }
          
          // Include if it's likely continuation data
          if (isContinuationLine(nextLine) || 
              (isLikelyTransactionData(nextLine) && nextLine.length < 100)) {
            transactionText += nextLine;
            i = j; // Skip this line in main loop
          } else {
            break;
          }
          j++;
        }
        
        transactionLines.push(transactionText);
      }
    }
    
    return transactionLines.join('\n\n');
  }

  cleanOCROutputSimplified(rawText) {
    // Corrected to split by single newline to prevent blank lines
    const lines = rawText.split('\n');
    const simplifiedLines = [];

    for (const line of lines) {
        if (!line.trim()) continue;

        // Parse the transaction line to extract essential info
        const simplified = this.parseTransactionLine(line);
        if (simplified) {
            simplifiedLines.push(simplified);
        }
    }

    // Join with a single newline for clean output
    return simplifiedLines.join('\n\n');
  }

  categorizeTransactions(simplifiedText) {
    if (!simplifiedText.trim()) return '';
    
    const lines = simplifiedText.split('\n').filter(line => line.trim());
    const categorizedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const currentLine = lines[i].trim();
      if (!currentLine) continue;
      
      // Parse current transaction
      const currentMatch = currentLine.match(/^(\d{2}\/\d{2}\/\d{2})\s*\|\s*(.+?)\s*\|\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
      if (!currentMatch) {
        categorizedLines.push(currentLine); // Keep line as-is if can't parse
        continue;
      }
      
      const [, currentDate, currentDesc, currentAmount, currentBalance] = currentMatch;
      const currentBalanceNum = parseFloat(currentBalance.replace(/,/g, ''));
      const currentAmountNum = parseFloat(currentAmount.replace(/,/g, ''));
      
      let transactionType = '';
      
      // For the first transaction, we can't compare with previous
      if (i === 0) {
        // Look at the next transaction to determine type
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const nextMatch = nextLine.match(/^(\d{2}\/\d{2}\/\d{2})\s*\|\s*(.+?)\s*\|\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
          
          if (nextMatch) {
            const nextBalanceNum = parseFloat(nextMatch[4].replace(/,/g, ''));
            const balanceDiff = currentBalanceNum - nextBalanceNum;
            const nextAmountNum = parseFloat(nextMatch[3].replace(/,/g, ''));
            
            // If the balance difference roughly equals the next transaction amount
            // and current balance is higher, then current transaction was likely a credit
            if (Math.abs(balanceDiff - nextAmountNum) < 0.01 && currentBalanceNum > nextBalanceNum) {
              transactionType = 'CREDIT';
            } else {
              // Default assumption for first transaction
              transactionType = 'DEBIT';
            }
          } else {
            transactionType = 'UNKNOWN';
          }
        } else {
          transactionType = 'UNKNOWN';
        }
      } else {
        // Compare with previous transaction
        const prevLine = lines[i - 1].trim();
        const prevMatch = prevLine.match(/^(\d{2}\/\d{2}\/\d{2})\s*\|\s*(.+?)\s*\|\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/);
        
        if (prevMatch) {
          const prevBalanceNum = parseFloat(prevMatch[4].replace(/,/g, ''));
          
          // Calculate expected balance based on transaction type
          const expectedBalanceIfDebit = prevBalanceNum - currentAmountNum;
          const expectedBalanceIfCredit = prevBalanceNum + currentAmountNum;
          
          // Determine which is closer to actual balance
          const debitDiff = Math.abs(expectedBalanceIfDebit - currentBalanceNum);
          const creditDiff = Math.abs(expectedBalanceIfCredit - currentBalanceNum);
          
          if (debitDiff < creditDiff && debitDiff < 0.01) {
            transactionType = 'DEBIT';
          } else if (creditDiff < debitDiff && creditDiff < 0.01) {
            transactionType = 'CREDIT';
          } else {
            // Fallback: if balance decreased, it's likely a debit
            transactionType = currentBalanceNum < prevBalanceNum ? 'DEBIT' : 'CREDIT';
          }
        } else {
          transactionType = 'UNKNOWN';
        }
      }

      const formatAmount = Math.abs(currentAmountNum).toFixed(2);
      
      // Add the transaction type to the line
      categorizedLines.push(`${currentDate} | ${currentDesc} | ${formatAmount} | ${transactionType}`);
    }
    
    return categorizedLines.join('\n\n');
  }

  parseTransactionLine(transactionLine) {
    // Remove extra whitespace and normalize
    const normalized = this.normalizeWhitespace(transactionLine);

    // Pattern to match date at the beginning of the line
    const dateMatch = normalized.match(/^(\d{2}\/\d{2}\/\d{2})/);
    if (!dateMatch) return null;
    
    const date = dateMatch[1];
    
    // Correctly extract all numbers with a decimal and two digits.
    const currencyMatches = this.extractCurrencyAmounts(normalized);
    
    // If we can't find at least two currency numbers, it's not a valid transaction line for this output format.
    if (!currencyMatches || currencyMatches.length < 2) {
      return null;
    }

    const cleanAmounts = currencyMatches.slice();
    
    // The amount is the second to last currency-formatted number.
    const amount = cleanAmounts[currencyMatches.length - 2];
    // The balance is the last currency-formatted number.
    const balance = cleanAmounts[currencyMatches.length - 1];
    
    // Extract description by first removing the date and amounts.
    let description = normalized
      .replace(date, '') // Remove first date
      .replace(amount, '') // Remove amount
      .replace(balance, '') // Remove balance
      .trim();

    // The key change is here: remove any remaining date patterns and other unwanted codes.
    description = description
      .replace(/(\d{2}\/\d{2}\/\d{2})/g, '') // Remove any remaining date patterns
      .replace(/\|/g, '') // Remove pipe characters
      .replace(/\bUPL-/g, '') // Remove UPL- prefix
      .replace(/@[A-Z0-9\-]+/g, '') // Remove @OKAXIS, @HDFCBANK etc
      .replace(/-KKBK\d+/g, '') // Remove bank codes like -KKBK0008057
      .replace(/-UPI$/g, '') // Remove -UPI endings
      .replace(/-UPT$/g, '') // Remove -UPT endings
      .replace(/-PAY$/g, '') // Remove -PAY endings
      .replace(/AIR-BANK/g, '') // Remove AIR-BANK
      .replace(/[A-Z0-9]{10,}/g, '') // Remove long alphanumeric IDs
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // Return the cleaned string
    const absoluteAmount = Math.abs(parseFloat(amount.replace(/,/g, ''))).toFixed(2);
return `${date} | ${description} | ${absoluteAmount} ${balance}`;
  }
}