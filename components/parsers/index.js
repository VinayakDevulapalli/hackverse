// components/parsers/index.js

import HDFCParser from './hdfcParser.js';
import KotakParser from './kotakParser.js';
import ICICIParser from './iciciParser.js';

export function getParser(docCode) {
  if (!docCode) {
    throw new Error('Document code cannot be empty.');
  }

  switch (docCode.toUpperCase()) {
    case 'HDFC':
      return new HDFCParser();
    
    case 'KOTAK':
      return new KotakParser();

    case 'ICICI':
      return new ICICIParser();
    
    
    default:
      throw new Error(`Parser not implemented for code: ${docCode}`);
  }
}

export function getSupportedBanks() {
  return ['HDFC', 'KOTAK', 'ICICI'];
}