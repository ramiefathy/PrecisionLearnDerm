import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { requireAuth } from '../util/auth';
import { enforcePerUserRateLimit } from '../util/rateLimit';
import { logInfo, logError } from '../util/logging';
import * as fs from 'fs';
import * as path from 'path';

const db = admin.firestore();

// Load knowledge base on startup for tutor
let tutorKnowledgeBase: Record<string, any> = {};
let tutorHighQualityEntries: Array<{ key: string; entity: any }> = [];

try {
  const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
  const kbData = fs.readFileSync(kbPath, 'utf8');
  tutorKnowledgeBase = JSON.parse(kbData);
  
  // Filter entities with completeness score > 65
  tutorHighQualityEntries = Object.entries(tutorKnowledgeBase)
    .filter(([key, entity]) => entity.completeness_score > 65)
    .map(([key, entity]) => ({ key, entity }));
    
  console.log(`Tutor loaded ${tutorHighQualityEntries.length} high-quality KB entries`);
} catch (error) {
  console.error('Failed to load KB for tutor:', error);
}

// Domain validation for dermatology/STI topics
function isDermatologyRelated(query: string): boolean {
  const dermatologyKeywords = [
    // Skin conditions
    'skin', 'dermat', 'rash', 'lesion', 'acne', 'psoriasis', 'eczema', 'dermatitis', 
    'melanoma', 'cancer', 'tumor', 'mole', 'nevus', 'basal cell', 'squamous cell',
    
    // Infections
    'tinea', 'fungal', 'bacterial', 'viral', 'herpes', 'hpv', 'molluscum', 'wart',
    'cellulitis', 'impetigo', 'folliculitis', 'candida', 'yeast',
    
    // STIs
    'syphilis', 'gonorrhea', 'chlamydia', 'sti', 'std', 'sexually transmitted',
    
    // Symptoms/presentations
    'plaque', 'papule', 'pustule', 'vesicle', 'bulla', 'macule', 'patch', 'nodule',
    'scale', 'crust', 'ulcer', 'erosion', 'fissure', 'excoriation', 'lichenification',
    'hyperkeratosis', 'hyperpigmentation', 'hypopigmentation', 'erythema', 'purpura',
    'petechiae', 'telangiectasia', 'pruritus', 'itch', 'burning', 'pain', 'tender',
    
    // Treatments
    'topical', 'cream', 'ointment', 'lotion', 'gel', 'shampoo', 'steroid', 'retinoid',
    'antibiotic', 'antifungal', 'antiviral', 'immunosuppressant', 'biologic',
    'phototherapy', 'laser', 'cryotherapy', 'biopsy', 'excision', 'mohs',
    
    // Anatomy
    'epidermis', 'dermis', 'subcutaneous', 'hair', 'nail', 'sebaceous', 'sweat',
    'follicle', 'pore', 'mucosa', 'genital', 'oral', 'scalp', 'face', 'trunk',
    
    // Diagnostic terms
    'koh', 'culture', 'biopsy', 'dermoscopy', 'pathology', 'histology', 'immunofluorescence'
  ];
  
  const queryLower = query.toLowerCase();
  return dermatologyKeywords.some(keyword => queryLower.includes(keyword));
}

function generateRefusalMessage(): string {
  const refusals = [
    "I can only provide information about dermatology and sexually transmitted infections. Please ask about skin conditions, rashes, or related topics.",
    "My expertise is limited to dermatology and STI topics. Could you rephrase your question to focus on skin-related conditions?",
    "I'm designed to help with dermatology questions only. Please ask about skin diseases, treatments, or diagnostic approaches.",
    "I can only assist with dermatology and sexually transmitted infection queries. Try asking about a specific skin condition or symptom."
  ];
  
  return refusals[Math.floor(Math.random() * refusals.length)];
}

function calculateRelevance(query: string, entity: any, entityName: string): number {
  const queryLower = query.toLowerCase();
  const nameLower = entityName.toLowerCase();
  
  let score = 0;
  
  // Exact name match gets highest score
  if (nameLower === queryLower) {
    score += 100;
  }
  // Name contains query
  else if (nameLower.includes(queryLower)) {
    score += 80;
  }
  // Query contains name (partial match)
  else if (queryLower.includes(nameLower)) {
    score += 60;
  }
  
  // Check description
  if (entity.description && entity.description.toLowerCase().includes(queryLower)) {
    score += 40;
  }
  
  // Check symptoms
  if (entity.symptoms && entity.symptoms.toLowerCase().includes(queryLower)) {
    score += 35;
  }
  
  // Check treatment
  if (entity.treatment && entity.treatment.toLowerCase().includes(queryLower)) {
    score += 30;
  }
  
  // Check diagnosis
  if (entity.diagnosis && entity.diagnosis.toLowerCase().includes(queryLower)) {
    score += 25;
  }
  
  // Check causes
  if (entity.causes && entity.causes.toLowerCase().includes(queryLower)) {
    score += 20;
  }
  
  // Boost score based on completeness
  score += (entity.completeness_score / 100) * 20;
  
  return score;
}

function searchKnowledgeBase(query: string) {
  if (tutorHighQualityEntries.length === 0) {
    return { results: [], totalFound: 0 };
  }
  
  const searchResults = [];
  
  for (const { key, entity } of tutorHighQualityEntries) {
    const relevanceScore = calculateRelevance(query, entity, key);
    
    if (relevanceScore > 10) {
      searchResults.push({
        entityName: key,
        relevanceScore,
        content: {
          description: entity.description || '',
          symptoms: entity.symptoms || '',
          treatment: entity.treatment || '',
          diagnosis: entity.diagnosis || '',
          causes: entity.causes || '',
          prognosis: entity.prognosis || '',
          complications: entity.complications || '',
          prevention: entity.prevention || ''
        },
        completenessScore: entity.completeness_score,
        anchor: `KB:${key.toLowerCase().replace(/\s+/g, '_')}`
      });
    }
  }
  
  // Sort by relevance score and completeness score
  searchResults.sort((a, b) => {
    const scoreDiff = b.relevanceScore - a.relevanceScore;
    if (scoreDiff !== 0) return scoreDiff;
    return b.completenessScore - a.completenessScore;
  });
  
  return {
    results: searchResults.slice(0, 10),
    totalFound: searchResults.length
  };
}

export const tutorQuery = functions.https.onCall(async (data: any, context) => {
  try {
    const { itemId, topicIds, userQuery } = data || {};
    
    if (!userQuery || typeof userQuery !== 'string') {
      throw new Error('userQuery is required and must be a string');
    }
    
    // Check if query is dermatology-related
    if (!isDermatologyRelated(userQuery)) {
      return {
        success: true,
        response: generateRefusalMessage(),
        citations: [],
        isDermatologyRelated: false
      };
    }
    
    // Search knowledge base for relevant information
    const kbResults = await searchKnowledgeBase(userQuery);
    
    if (kbResults && kbResults.results && kbResults.results.length > 0) {
      // Generate answer from knowledge base
      const answer = await generateAnswerFromKB(userQuery, kbResults.results[0], kbResults.results.slice(1));
      return {
        success: true,
        response: answer,
        citations: kbResults.results.slice(0, 3).map((result: any) => ({
          source: result.entityName,
          relevance: result.relevanceScore
        })),
        isDermatologyRelated: true,
        source: 'knowledge_base'
      };
    } else {
      // Generate fallback response
      const fallbackResponse = await generateFallbackResponse(userQuery);
      return {
        success: true,
        response: fallbackResponse,
        citations: [],
        isDermatologyRelated: true,
        source: 'ai_generated'
      };
    }
    
  } catch (error: any) {
    console.error('Error in tutor query:', error);
    return {
      success: false,
      error: error.message,
      response: 'I apologize, but I encountered an error processing your query. Please try again or rephrase your question.'
    };
  }
});

function generateAnswerFromKB(query: string, primaryResult: any, additionalResults: any[]): string {
  const entity = primaryResult.content;
  const entityName = primaryResult.entityName;
  
  let answer = `## ${entityName}\n\n`;
  
  // Add description if available
  if (entity.description && entity.description.trim()) {
    answer += `**Overview:** ${entity.description.trim()}\n\n`;
  }
  
  // Add symptoms if relevant to query or available
  if (entity.symptoms && entity.symptoms.trim()) {
    if (query.toLowerCase().includes('symptom') || query.toLowerCase().includes('present') || 
        query.toLowerCase().includes('sign') || query.toLowerCase().includes('appear')) {
      answer += `**Clinical Presentation:**\n${formatBulletPoints(entity.symptoms)}\n\n`;
    } else if (entity.symptoms.length < 200) {
      answer += `**Key Features:** ${entity.symptoms.trim()}\n\n`;
    }
  }
  
  // Add diagnosis if relevant
  if (entity.diagnosis && entity.diagnosis.trim() && 
      (query.toLowerCase().includes('diagnos') || query.toLowerCase().includes('test') || 
       query.toLowerCase().includes('confirm'))) {
    answer += `**Diagnosis:**\n${formatBulletPoints(entity.diagnosis)}\n\n`;
  }
  
  // Add treatment if relevant
  if (entity.treatment && entity.treatment.trim()) {
    if (query.toLowerCase().includes('treat') || query.toLowerCase().includes('manag') || 
        query.toLowerCase().includes('therap') || query.toLowerCase().includes('medication')) {
      answer += `**Treatment Options:**\n${formatBulletPoints(entity.treatment)}\n\n`;
    } else if (entity.treatment.length < 300) {
      answer += `**Treatment:** ${entity.treatment.trim()}\n\n`;
    }
  }
  
  // Add causes if relevant
  if (entity.causes && entity.causes.trim() && 
      (query.toLowerCase().includes('cause') || query.toLowerCase().includes('etiology') || 
       query.toLowerCase().includes('why') || query.toLowerCase().includes('due to'))) {
    answer += `**Causes/Etiology:**\n${formatBulletPoints(entity.causes)}\n\n`;
  }
  
  // Add prognosis if relevant
  if (entity.prognosis && entity.prognosis.trim() && 
      (query.toLowerCase().includes('prognos') || query.toLowerCase().includes('outcome') || 
       query.toLowerCase().includes('expect'))) {
    answer += `**Prognosis:** ${entity.prognosis.trim()}\n\n`;
  }
  
  // Add related conditions if there are additional results
  if (additionalResults.length > 0) {
    answer += `**Related Conditions:**\n`;
    additionalResults.forEach((result: any) => {
      answer += `- **${result.entityName}**: ${result.content.description || 'See full details'}\n`;
    });
    answer += '\n';
  }
  
  // Add educational note
  answer += `---\n*This information is for educational purposes only and should not replace professional medical advice.*`;
  
  return answer;
}

function formatBulletPoints(text: string): string {
  if (!text) return '';
  
  // Split by semicolons or periods and create bullet points
  const sentences = text.split(/[;.]/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter out very short fragments
  
  if (sentences.length <= 1) {
    return text.trim();
  }
  
  return sentences.map(sentence => `- ${sentence}`).join('\n');
}

function generateFallbackResponse(query: string): string {
  return `I understand you're asking about "${query}" in dermatology. While I don't have specific information readily available in my knowledge base, I recommend:

1. **Consulting authoritative dermatology resources** such as medical textbooks or peer-reviewed journals
2. **Speaking with a dermatologist** for clinical questions
3. **Referring to professional guidelines** from organizations like the American Academy of Dermatology

For the most accurate and up-to-date information, especially for diagnostic or treatment decisions, please consult with a qualified healthcare provider.

*This response is for educational purposes only and should not replace professional medical advice.*`;
}
