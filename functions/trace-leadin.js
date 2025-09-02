// Trace where leadIn is being lost
require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Read the built file to see what's deployed
const structuredParserPath = path.join(__dirname, 'lib/util/structuredTextParser.js');
const boardStylePath = path.join(__dirname, 'lib/ai/boardStyleGeneration.js');

console.log('Checking deployed code...\n');

// Check parser
const parserContent = fs.readFileSync(structuredParserPath, 'utf8');
const hasLeadInInterface = parserContent.includes('leadIn');
const hasLeadInExtraction = parserContent.includes('leadInMatch');
const hasLeadInInConvert = parserContent.includes('parsed.leadIn ||');

console.log('structuredTextParser.js:');
console.log('- Has leadIn in interface:', hasLeadInInterface);
console.log('- Has leadIn extraction:', hasLeadInExtraction);
console.log('- Has leadIn in convert:', hasLeadInInConvert);

// Look for the actual regex
const leadInRegexMatch = parserContent.match(/leadInMatch.*?match\((.*?)\)/s);
if (leadInRegexMatch) {
  console.log('- Lead-in regex:', leadInRegexMatch[1].substring(0, 100) + '...');
}

// Check if boardStyle uses structured format
console.log('\nboardStyleGeneration.js:');
const boardContent = fs.readFileSync(boardStylePath, 'utf8');
const usesStructuredParser = boardContent.includes('parseStructuredMCQResponse');
const usesConvertToLegacy = boardContent.includes('convertToLegacyFormat');

console.log('- Uses structured parser:', usesStructuredParser);
console.log('- Uses convertToLegacyFormat:', usesConvertToLegacy);

// Look for where the result is built
const resultBuildMatch = boardContent.match(/return\s*{[\s\S]*?generatedAt/);
if (resultBuildMatch) {
  console.log('\nResult building code:');
  console.log(resultBuildMatch[0].substring(0, 300) + '...');
}

// Check if the STEM regex might be including LEAD_IN
console.log('\n--- STEM Regex Check ---');
const stemRegexMatch = parserContent.match(/stemMatch.*?match\((.*?)\)/s);
if (stemRegexMatch) {
  console.log('STEM regex:', stemRegexMatch[1]);
  // Check if it's capturing lead-in in the stem
  const stemRegex = /STEM:\s*\n([\s\S]*?)(?=\n(?:OPTIONS|LEAD[_-]?IN|QUESTION):|$)/i;
  const testText = `STEM:
This is the stem.

LEAD_IN:
What is the diagnosis?

OPTIONS:`;
  const stemMatch = testText.match(stemRegex);
  if (stemMatch) {
    console.log('\nTest STEM capture:', JSON.stringify(stemMatch[1]));
    console.log('Is LEAD_IN included in STEM?', stemMatch[1].includes('LEAD_IN'));
  }
}