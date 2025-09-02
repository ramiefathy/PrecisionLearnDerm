/**
 * Cloud Function to enhance metadata for existing questions
 * This can be deployed and called to update questions with the new metadata calculation
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Type definitions for better type safety
interface MCQOption {
  text: string;
  [key: string]: any;
}

interface MCQItem {
  stem?: string;
  question?: string;
  explanation?: string;
  options?: MCQOption[];
  difficulty?: number;
  difficultyLevel?: string;
  completeness_score?: number;
  metadata?: any;
  [key: string]: any;
}

interface AgentOutput {
  name?: string;
  type?: string;
  difficulty?: string;
  result?: {
    totalScore?: number;
    reviewScore?: number;
    feedback?: string;
    results?: Array<{
      title?: string;
      source?: string;
      url?: string;
      link?: string;
      snippet?: string;
      abstract?: string;
      reliability?: string;
    }>;
    ncbiResultsLength?: number;
    openAlexResultsLength?: number;
  };
}

interface Citation {
  source: string;
  url?: string;
  snippet?: string;
  type: 'pubmed' | 'academic' | 'web' | 'knowledge_base' | 'guideline' | 'journal' | 'research' | 'study' | 'database';
  reliability: 'high' | 'medium' | 'low';
  addedAt?: string;
  resultsFound?: number;
  year?: string;
}

// Enhanced helper function to calculate quality score using agent outputs
function calculateQualityScore(mcq: MCQItem, agentOutputs?: AgentOutput[]): number {
  let score = 50; // Base score
  
  // Get the stem or question text
  const stemText = mcq.stem || mcq.question || '';
  const explanation = mcq.explanation || '';
  
  // Enhanced content quality checks
  if (stemText) {
    if (stemText.length > 100) score += 10; // Good detail
    if (stemText.includes('year-old') || stemText.match(/\d+-year-old/)) score += 8; // Clinical vignette
    if (stemText.match(/\d+-year-old/)) score += 5; // Age specificity
    // Check for clinical presentation elements
    if (stemText.includes('presents with') || stemText.includes('complains of')) score += 3;
    if (stemText.includes('physical examination') || stemText.includes('laboratory')) score += 2;
  }
  
  // Enhanced explanation quality checks
  if (explanation) {
    if (explanation.length > 200) score += 10; // Detailed explanation
    if (explanation.includes('because') || explanation.includes('due to')) score += 5; // Reasoning
    if (explanation.includes('differential diagnosis') || explanation.includes('management')) score += 3;
    if (explanation.includes('pathophysiology') || explanation.includes('mechanism')) score += 2;
  }
  
  // Check options quality
  if (mcq.options && Array.isArray(mcq.options)) {
    const optionCount = mcq.options.length;
    if (optionCount >= 4) score += 8; // Has sufficient options
    if (optionCount === 5) score += 4; // Has all 5 options
    
    // Check for proper option formatting
    const hasProperFormatting = mcq.options.every((opt: MCQOption) => 
      opt.text && opt.text.length > 10
    );
    if (hasProperFormatting) score += 5;
    
    // Check for balanced option lengths (avoiding obvious answers)
    const optionLengths = mcq.options.map(opt => opt.text?.length || 0);
    const avgLength = optionLengths.reduce((a, b) => a + b, 0) / optionLengths.length;
    const variance = optionLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / optionLengths.length;
    if (variance < 1000) score += 3; // Options are relatively balanced
  }
  
  // Include scoring from agent outputs if available
  if (agentOutputs && Array.isArray(agentOutputs)) {
    // Find scoring agent output
    const scoringAgent = agentOutputs.find((a: AgentOutput) => 
      a.name?.includes('Scoring Agent') || a.type === 'scoring'
    );
    
    if (scoringAgent?.result?.totalScore) {
      // Normalize scoring agent score (0-25) to quality score component (0-20)
      const normalizedScore = (scoringAgent.result.totalScore / 25) * 20;
      score += Math.round(normalizedScore);
    }
    
    // Check review agent assessment
    const reviewAgent = agentOutputs.find((a: AgentOutput) => 
      a.name?.includes('Review Agent') || a.type === 'review'
    );
    
    if (reviewAgent?.result?.reviewScore) {
      // Review agent uses 0-10 scale, normalize to 0-10 for quality score component
      score += Math.round(reviewAgent.result.reviewScore);
    }
    
    if (reviewAgent?.result?.feedback) {
      // Positive indicators in review
      const feedback = reviewAgent.result.feedback.toLowerCase();
      if (feedback.includes('clinically accurate')) score += 5;
      if (feedback.includes('well-structured')) score += 5;
      if (feedback.includes('clear') && feedback.includes('concise')) score += 3;
      if (feedback.includes('evidence-based')) score += 4;
    }
  }
  
  return Math.min(100, Math.max(0, score));
}

// Enhanced helper function to extract citations from web search results and explanation
function extractCitations(mcq: MCQItem, agentOutputs?: AgentOutput[]): Citation[] {
  const citations: Citation[] = [];
  const citationSet = new Set<string>(); // Prevent duplicates
  
  const explanation = mcq.explanation || '';
  
  // Extract citations from web search results in agent outputs
  if (agentOutputs && Array.isArray(agentOutputs)) {
    // Find context gathering agent with web search results
    const contextAgent = agentOutputs.find((a: AgentOutput) => 
      a.name?.includes('Context Gathering') || a.type === 'context'
    );
    
    if (contextAgent?.result) {
      // Add NCBI citations if available
      if (contextAgent.result.ncbiResultsLength && contextAgent.result.ncbiResultsLength > 0) {
        const ncbiCitation: Citation = {
          source: 'NCBI PubMed',
          type: 'database',
          reliability: 'high',
          resultsFound: contextAgent.result.ncbiResultsLength
        };
        if (!citationSet.has(ncbiCitation.source)) {
          citations.push(ncbiCitation);
          citationSet.add(ncbiCitation.source);
        }
      }
      
      // Add OpenAlex citations if available
      if (contextAgent.result.openAlexResultsLength && contextAgent.result.openAlexResultsLength > 0) {
        const openAlexCitation: Citation = {
          source: 'OpenAlex Academic Database',
          type: 'database',
          reliability: 'high',
          resultsFound: contextAgent.result.openAlexResultsLength
        };
        if (!citationSet.has(openAlexCitation.source)) {
          citations.push(openAlexCitation);
          citationSet.add(openAlexCitation.source);
        }
      }
    }
    
    // Find web search agent outputs for detailed citations
    const webSearchAgents = agentOutputs.filter((a: AgentOutput) => 
      a.name?.includes('Web Search') || 
      a.type === 'web_search' ||
      a.name?.includes('NCBI') ||
      a.name?.includes('OpenAlex')
    );
    
    for (const agent of webSearchAgents) {
      if (agent.result?.results && Array.isArray(agent.result.results)) {
        // Limit to top 3 results per source
        for (const result of agent.result.results.slice(0, 3)) {
          const citation: Citation = {
            source: result.title || result.source || 'Web Search',
            url: result.url || result.link || '',
            snippet: result.snippet || result.abstract || '',
            type: agent.name?.includes('NCBI') ? 'pubmed' : 
                  agent.name?.includes('OpenAlex') ? 'academic' : 'web',
            reliability: (result.reliability as 'high' | 'medium' | 'low') || 'medium',
            addedAt: new Date().toISOString()
          };
          
          // Use source + type as unique key
          const citationKey = `${citation.source}_${citation.type}`;
          if (!citationSet.has(citationKey)) {
            citations.push(citation);
            citationSet.add(citationKey);
          }
        }
      }
    }
  }
  
  // Check for guideline references in explanation
  if (explanation && (explanation.includes('guidelines') || explanation.includes('Guidelines'))) {
    const guidelineCitation: Citation = {
      source: 'Clinical Guidelines',
      type: 'guideline',
      reliability: 'high'
    };
    if (!citationSet.has(guidelineCitation.source)) {
      citations.push(guidelineCitation);
      citationSet.add(guidelineCitation.source);
    }
  }
  
  // Check for research references
  if (explanation && (explanation.includes('study') || explanation.includes('research') || explanation.includes('trial'))) {
    const researchCitation: Citation = {
      source: 'Research Literature',
      type: 'research',
      reliability: 'medium'
    };
    if (!citationSet.has(researchCitation.source)) {
      citations.push(researchCitation);
      citationSet.add(researchCitation.source);
    }
  }
  
  // Check for specific journal patterns
  const journalPattern = /\b(JAAD|NEJM|Lancet|JAMA|BMJ|Nature|Science|Dermatology|Pediatrics)\b/gi;
  const journalMatches = explanation ? explanation.match(journalPattern) : null;
  if (journalMatches) {
    journalMatches.forEach(journal => {
      const journalCitation: Citation = {
        source: `Journal: ${journal.toUpperCase()}`,
        type: 'journal',
        reliability: 'high'
      };
      if (!citationSet.has(journalCitation.source)) {
        citations.push(journalCitation);
        citationSet.add(journalCitation.source);
      }
    });
  }
  
  // Check for year references (likely studies)
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const yearMatches = explanation ? explanation.match(yearPattern) : null;
  if (yearMatches && yearMatches.length > 0) {
    const studyCitation: Citation = {
      source: `Studies (${yearMatches[0]})`,
      type: 'study',
      reliability: 'medium',
      year: yearMatches[0]
    };
    if (!citationSet.has(studyCitation.source)) {
      citations.push(studyCitation);
      citationSet.add(studyCitation.source);
    }
  }
  
  return citations;
}

/**
 * Cloud Function to enhance metadata for existing questions
 */
export const enhanceQuestionMetadata = functions
  .runWith({ timeoutSeconds: 300, memory: '1GB' })
  .https.onCall(async (data, context) => {
    // Check admin auth
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData?.isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'User must be an admin');
    }

    const { questionId, enhanceAll = false } = data;

    try {
      if (enhanceAll) {
        // Enhance all questions in the queue
        const questionsSnapshot = await db.collection('admin_question_queue').get();
        let updated = 0;
        
        const batch = db.batch();
        
        for (const doc of questionsSnapshot.docs) {
          const question = doc.data() as MCQItem;
          const agentOutputs = (question.metadata?.agent_outputs || []) as AgentOutput[];
          
          // Calculate citations once and reuse the result
          const extractedCitations = extractCitations(question, agentOutputs);
          
          const updatedMetadata = {
            ...question.metadata,
            quality_score: calculateQualityScore(question, agentOutputs),
            citations: extractedCitations.length > 0 ? 
                       extractedCitations : 
                       question.metadata?.citations || [],
            kb_score: question.metadata?.kb_score || question.completeness_score || 0,
            enhanced: true,
            enhanced_at: admin.firestore.FieldValue.serverTimestamp()
          };
          
          batch.update(doc.ref, { metadata: updatedMetadata });
          updated++;
          
          // Commit batch every 100 documents
          if (updated % 100 === 0) {
            await batch.commit();
          }
        }
        
        // Commit remaining updates
        if (updated % 100 !== 0) {
          await batch.commit();
        }
        
        return {
          success: true,
          message: `Enhanced metadata for ${updated} questions`,
          updated
        };
        
      } else if (questionId) {
        // Enhance a specific question
        const questionRef = db.collection('admin_question_queue').doc(questionId);
        const questionDoc = await questionRef.get();
        
        if (!questionDoc.exists) {
          throw new functions.https.HttpsError('not-found', 'Question not found');
        }
        
        const question = questionDoc.data() as MCQItem;
        const agentOutputs = (question.metadata?.agent_outputs || []) as AgentOutput[];
        
        // Calculate citations once and reuse the result
        const extractedCitations = extractCitations(question, agentOutputs);
        
        const updatedMetadata = {
          ...question.metadata,
          quality_score: calculateQualityScore(question, agentOutputs),
          citations: extractedCitations.length > 0 ? 
                     extractedCitations : 
                     question.metadata?.citations || [],
          kb_score: question.metadata?.kb_score || question.completeness_score || 0,
          enhanced: true,
          enhanced_at: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await questionRef.update({ metadata: updatedMetadata });
        
        return {
          success: true,
          message: 'Enhanced metadata for question',
          metadata: updatedMetadata
        };
        
      } else {
        throw new functions.https.HttpsError('invalid-argument', 'Must provide questionId or set enhanceAll to true');
      }
      
    } catch (error: any) {
      console.error('Error enhancing metadata:', error);
      throw new functions.https.HttpsError('internal', error.message);
    }
  });