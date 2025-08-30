// parsers/BaseParser.js

/**
 * Abstract base class for bank statement parsers
 * All bank-specific parsers should extend this class
 */
 export default class BaseParser {
    constructor(bankCode) {
      if (this.constructor === BaseParser) {
        throw new Error('BaseParser is an abstract class and cannot be instantiated directly');
      }
      this.bankCode = bankCode;
    }
  
    /**
     * Clean raw OCR output to extract transaction lines
     * @param {string} rawText - Raw OCR text
     * @returns {string} - Cleaned transaction text
     */
    cleanOCROutput(rawText) {
      throw new Error('cleanOCROutput method must be implemented by subclass');
    }
  
    /**
     * Simplify cleaned text to essential transaction info
     * @param {string} rawText - Raw OCR text
     * @returns {string} - Simplified transaction text
     */
    cleanOCROutputSimplified(rawText) {
      throw new Error('cleanOCROutputSimplified method must be implemented by subclass');
    }
  
    /**
     * Categorize transactions as DEBIT or CREDIT
     * @param {string} simplifiedText - Simplified transaction text
     * @returns {string} - Categorized transaction text
     */
    categorizeTransactions(simplifiedText) {
      throw new Error('categorizeTransactions method must be implemented by subclass');
    }
  
    /**
     * Parse individual transaction line
     * @param {string} transactionLine - Single transaction line
     * @returns {string|null} - Parsed transaction or null if invalid
     */
    parseTransactionLine(transactionLine) {
      throw new Error('parseTransactionLine method must be implemented by subclass');
    }
  
    /**
     * Get bank-specific patterns for parsing
     * @returns {object} - Patterns object
     */
    getPatterns() {
      throw new Error('getPatterns method must be implemented by subclass');
    }
  
    /**
     * Common utility method to extract currency amounts from text
     * @param {string} text - Text to search
     * @returns {array} - Array of currency matches
     */
    extractCurrencyAmounts(text) {
      return text.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g) || [];
    }
  
    /**
     * Common utility method to extract dates
     * @param {string} text - Text to search
     * @returns {array} - Array of date matches
     */
    extractDates(text) {
      return text.match(/(\d{2}\/\d{2}\/\d{2})/g) || [];
    }
  
    /**
     * Common utility method to normalize whitespace
     * @param {string} text - Text to normalize
     * @returns {string} - Normalized text
     */
    normalizeWhitespace(text) {
      return text.replace(/\s+/g, ' ').trim();
    }
  }