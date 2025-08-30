// components/parsers/pnlParsers/index.js
import StandardPnLParser from './standardPnlParser';

export function getPnLParser(typeCode) {
  if (!typeCode) {
    throw new Error('P&L type code cannot be empty.');
  }
  
  switch (typeCode.toUpperCase()) {
    case 'STANDARD':
      return new StandardPnLParser();
    default:
      throw new Error(`P&L parser not implemented for code: ${typeCode}`);
  }
}

export function getSupportedPnLTypes() {
  return ['STANDARD'];
}