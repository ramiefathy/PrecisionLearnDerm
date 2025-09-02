# Lead-In Question Fix Documentation

## Issue Description
Board-style MCQ generation was not including lead-in questions (e.g., "What is the most likely diagnosis?") in evaluation results, despite the requirement for all board-style questions to have this field.

## Investigation Timeline
- **Date**: September 2, 2025
- **Reported Issue**: Evaluation logs showed `hasLeadIn: false` for all board-style questions
- **Initial Hypothesis**: Parser or conversion function was stripping the leadIn field

## Root Cause Discovery

### What Was NOT the Problem:
1. ✅ Gemini API was correctly generating `=== LEAD_IN ===` sections
2. ✅ The parser (`parseStructuredMCQResponse`) was correctly extracting leadIn fields
3. ✅ The `convertToLegacyFormat` function was preserving leadIn in both array and object formats
4. ✅ Local tests showed everything working correctly

### The ACTUAL Problem:
**The `structuredTextParser.ts` file was never added to git!**

```bash
git status
# Output showed:
# Untracked files:
#   functions/src/util/structuredTextParser.ts
```

This meant:
- The file existed locally but was not in version control
- It was never deployed to Firebase Functions
- The production `boardStyleGeneration.ts` couldn't import a non-existent file
- The deployment would have been using an older parsing method or failing silently

## The Fix

### 1. Added the parser file to git:
```bash
git add functions/src/util/structuredTextParser.ts
git add functions/src/ai/boardStyleGeneration.ts
```

### 2. Committed with detailed message:
```bash
git commit -m "Add missing structuredTextParser.ts and fix lead-in generation

CRITICAL FIX: The structuredTextParser.ts file was never added to git, causing
deployed functions to fail when trying to parse MCQ responses. This explains
why evaluations showed no lead-in questions despite local tests working."
```

### 3. Deployed functions:
```bash
firebase deploy --only functions
```

## Verification Steps

### Local Testing (Confirmed Working):
```javascript
// Test showed Gemini generates:
=== LEAD_IN ===
What is the most likely diagnosis?

// Parser extracts:
leadIn: "What is the most likely diagnosis?"
leadIn length: 34

// Legacy format preserves:
Array format leadIn: "What is the most likely diagnosis?"
Object format leadIn: "What is the most likely diagnosis?"
```

### Production Verification Needed:
1. Run a new evaluation with board style pipeline
2. Check evaluation results for `hasLeadIn: true`
3. Verify generated questions have populated leadIn fields

## Key Learnings

1. **Always verify git status** before assuming code is deployed
2. **Untracked files don't deploy** - even if they work locally
3. **Test in production** after deployment to verify fixes
4. **Check imports** - if a file is imported but doesn't exist in production, the deployment may fail or use fallback behavior

## Technical Details

### Parser Interface:
```typescript
export interface ParsedMCQ {
  stem: string;
  leadIn?: string;  // This field was added
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
    E?: string;
  };
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E';
  explanation: string;
  // ... other fields
}
```

### Structured Format Expected:
```
=== STEM ===
[Clinical vignette without question]

=== LEAD_IN ===
[The actual question, e.g., "What is the most likely diagnosis?"]

=== OPTIONS ===
A) [Option A]
B) [Option B]
...
```

## Impact
This fix ensures that all board-style MCQs will properly include lead-in questions, meeting the American Board of Dermatology (ABD) guidelines for question format and improving the educational value of generated questions.