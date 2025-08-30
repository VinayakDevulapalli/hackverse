// utils/constants.js

// Bank Statement Constants
export const SUPPORTED_BANKS = {
  HDFC: {
    name: 'HDFC Bank',
    description: 'HDFC Bank statements',
    active: true
  },
  KOTAK: {
    name: 'Kotak Bank',
    description: 'Kotak Bank Statements',
    active: false
  },
  ICICI: {
    name: 'ICICI Bank',
    description: 'ICICI Bank statements',
    active: false
  }
};

export const DEFAULT_BANK = 'HDFC';

// P&L Statement Constants
export const SUPPORTED_PNL_TYPES = {
  STANDARD: {
    name: 'Standard P&L',
    description: 'Standard Profit & Loss format',
    active: true
  }
};

export const DEFAULT_PNL_TYPE = 'STANDARD';