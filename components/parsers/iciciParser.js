// parsers/ICICIParser.js

import BaseParser from './baseParser.js';

export default class ICICIParser extends BaseParser {
  constructor() {
    super('ICICI');
  }

  /**
   * Defines the regular expression patterns for identifying different parts of the statement.
   */
  getPatterns() {
    return {
      // Identifies the start of a transaction line (optional S.No, Value Date, Transaction Date)
      transaction: /^\s*(?:\d+\s+)?\d{2}\/\d{2}\/\d{4}\s+\d{2}\/\d{2}\/\d{4}/,
      
      // Patterns to identify and ignore header/footer/junk lines.
      headers: [
        /DETAILED\s+STATEMENT/i,
        /Transactions\s+List/i,
        /Account\s+Number/i,
        /^S\s+No\./i,
        /^Value\s+Date/i,
        /^Transaction\s+Date/i,
        /^Withdrawal\s+Amount/i,
        /^Deposit\s+Amount/i,
        /^Balance\s+\(INR\s+\)/i,
        /ICICI\s+Bank/i,
      ],
      
      // Patterns to identify lines that are continuations of a transaction description.
      continuation: [
        /@[A-Z0-9\-]+/,         // UPI handles like @OKICICI
        /[A-Z]{3,}BANK/i,       // Bank names
        /\b\d{12,}\b/,          // Long numeric transaction IDs
        /\b[A-Z0-9]{15,}\b/,    // Long alphanumeric reference numbers
        /^\s*[a-zA-Z\s\/]+$/,   // Lines with only text/slashes
      ],
    };
  }

  /**
   * STEP 1: Cleans the raw OCR text by removing headers and merging multi-line transactions.
   * This function is now correctly implemented.
   */
  cleanOCROutput(rawText) {
    const lines = rawText.split('\n');
    const transactionLines = [];
    const patterns = this.getPatterns();
    
    const isHeaderLine = (line) => patterns.headers.some(pattern => pattern.test(line));
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line || isHeaderLine(line)) {
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
          
          transactionText += ' ' + nextLine;
          i = j;
          j++;
        }
        transactionLines.push(transactionText);
      }
    }
    
    return transactionLines.join('\n\n');
  }

  /**
   * STEP 2: Parses the merged transaction lines into a simplified, structured format.
   * This function is now fixed to process all lines from the step above.
   */
  cleanOCROutputSimplified(rawText) {
    const mergedTransactionsText = this.cleanOCROutput(rawText);
    if (!mergedTransactionsText) return '';
    
    const mergedLines = mergedTransactionsText.split('\n\n');
    const simplifiedLines = [];

    for (const line of mergedLines) {
        if (line.trim()) {
            const simplified = this.parseTransactionLine(line);
            if (simplified) {
                simplifiedLines.push(simplified);
            }
        }
    }

    return simplifiedLines.join('\n');
  }

  /**
   * STEP 3: Takes the simplified text and adds the final transaction type (DEBIT/CREDIT).
   * This function is now fixed to correctly parse its input and categorize all transactions.
   */
  categorizeTransactions(simplifiedText) {
    if (!simplifiedText || !simplifiedText.trim()) return '';
    
    const lines = simplifiedText.split('\n');
    const categorizedLines = [];
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length < 3) continue;

      const date = parts[0].trim();
      let description = parts[1].trim();
      const amountsPart = parts[2].trim();
      
      const amounts = amountsPart.split(/\s+/);
      if (amounts.length < 3) continue;

      const withdrawalAmount = amounts[0];
      const depositAmount = amounts[1];
      
      const withdrawalNum = parseFloat(withdrawalAmount.replace(/,/g, ''));
      const depositNum = parseFloat(depositAmount.replace(/,/g, ''));
      
      let transactionType = 'UNKNOWN';
      let actualAmount = '0.00';
      
      if (withdrawalNum > 0 && depositNum === 0) {
        transactionType = 'DEBIT';
        actualAmount = withdrawalAmount;
      } else if (depositNum > 0 && withdrawalNum === 0) {
        transactionType = 'CREDIT';
        actualAmount = depositAmount;
      }

      // Further clean the description to make it more readable
      description = description
        .replace(/\/UPI\/[A-Z\s]+BANK/gi, '')
        .replace(/\b\d{10,}\b/g, '')
        .replace(/[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+/g, ' ')
        .replace(/\b[A-Z0-9]{15,}\b/g, '')
        .replace(/\s+/g, ' ')
        .split(/[\/-]/)[0]
        .trim();

      categorizedLines.push(`${date} | ${description || "Transaction"} | ${actualAmount} | ${transactionType}`);
    }
    
    return categorizedLines.join('\n\n');
  }

  /**
   * HELPER: Parses a single merged transaction line.
   * This function's logic is the core of the fix.
   */
  parseTransactionLine(transactionLine) {
    const normalized = transactionLine.replace(/\s+/g, ' ').trim();

    // 1. Get the date and the rest of the line's content.
    const dateMatch = normalized.match(/^\s*(?:\d+\s+)?\d{2}\/\d{2}\/\d{4}\s+(\d{2}\/\d{2}\/\d{4})\s+(.*)$/);
    if (!dateMatch) return null;

    const [, date, remainingData] = dateMatch;

    // 2. Find the crucial three-amount sequence (Withdrawal, Deposit, Balance) within the content.
    // This is more robust than assuming they are always at the end.
    // The pattern looks for two numbers followed by a number with exactly two decimal places (the balance).
    const amountRegex = /(.*)\s+([\d,.]*\d)\s+([\d,.]*\d)\s+([\d,.]*\d\.\d{2})\b/;
    const amountMatch = remainingData.match(amountRegex);

    if (!amountMatch) return null;
    
    const [, description, withdrawalAmount, depositAmount, balance] = amountMatch;
    
    // 3. Return the data in the pipe-separated format for the next step.
    return `${date} | ${description.trim()} | ${withdrawalAmount} ${depositAmount} ${balance}`;
  }
}