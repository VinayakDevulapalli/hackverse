// components/parsers/pnlParsers/index.js
import GSTParser from './gstParser';

export function getGSTParser(typeCode) {
  if (!typeCode) {
    throw new Error('GST type code cannot be empty.');
  }
  
  switch (typeCode.toUpperCase()) {
    case 'STANDARD':
      return new GSTParser();
    default:
      throw new Error(`GST parser not implemented for code: ${typeCode}`);
  }
}

export function getSupportedGSTTypes() {
  return ['STANDARD'];
}