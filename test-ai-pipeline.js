const https = require('https');

// Test the AI pipeline with specific entities
const testEntities = [
  'psoriasis',
  'atopic_dermatitis', 
  'acne_vulgaris',
  'basal_cell_carcinoma',
  'melanoma'
];

function makeHttpsRequest(functionName, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: 'us-central1-dermassist-ai-1zyic.cloudfunctions.net',
      port: 443,
      path: `/${functionName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data, error: 'Parse error' });
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

async function testQuestionGeneration(entity) {
  console.log(`\n🧠 Testing AI Generation for: ${entity}`);
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Generate initial question
    console.log('Step 1: Generating initial question...');
    const generateResult = await makeHttpsRequest('ai_generate_mcq', {
      entityName: entity,
      category: 'Medical Dermatology',
      difficulty: 'intermediate'
    });
    
    console.log(`Status: ${generateResult.statusCode}`);
    if (generateResult.statusCode !== 200) {
      console.log('❌ Generation failed:', generateResult.data);
      return { entity, success: false, stage: 'generation', error: generateResult.data };
    }
    
    const generatedQuestion = generateResult.data;
    console.log('✅ Question generated successfully');
    console.log(`Stem length: ${generatedQuestion.stem?.length || 0} characters`);
    console.log(`Options count: ${generatedQuestion.options?.length || 0}`);
    
    // Step 2: Review the question
    console.log('\nStep 2: Reviewing question...');
    const reviewResult = await makeHttpsRequest('ai_review_mcq', {
      question: generatedQuestion,
      entityName: entity
    });
    
    if (reviewResult.statusCode !== 200) {
      console.log('❌ Review failed:', reviewResult.data);
      return { entity, success: false, stage: 'review', error: reviewResult.data };
    }
    
    const reviewedQuestion = reviewResult.data.improvedQuestion || generatedQuestion;
    console.log('✅ Question reviewed successfully');
    console.log(`Changes made: ${reviewResult.data.changes?.length || 0}`);
    
    // Step 3: Score the question
    console.log('\nStep 3: Scoring question...');
    const scoreResult = await makeHttpsRequest('ai_score_mcq', {
      question: reviewedQuestion,
      entityName: entity
    });
    
    if (scoreResult.statusCode !== 200) {
      console.log('❌ Scoring failed:', scoreResult.data);
      return { entity, success: false, stage: 'scoring', error: scoreResult.data };
    }
    
    const scoringResults = scoreResult.data;
    console.log('✅ Question scored successfully');
    console.log(`Total Score: ${scoringResults.totalScore}/25`);
    console.log(`Quality Tier: ${scoringResults.qualityTier}`);
    
    // Evaluate against ABD guidelines
    const evaluation = evaluateAgainstABDGuidelines(reviewedQuestion, scoringResults);
    
    return {
      entity,
      success: true,
      question: reviewedQuestion,
      scores: scoringResults,
      evaluation,
      pipelineComplete: true
    };
    
  } catch (error) {
    console.log('❌ Pipeline error:', error.message);
    return { entity, success: false, error: error.message };
  }
}

function evaluateAgainstABDGuidelines(question, scores) {
  console.log('\n📋 ABD Guidelines Compliance Evaluation:');
  console.log('-'.repeat(40));
  
  const evaluation = {
    criteriaScores: {},
    overallCompliance: 0,
    recommendations: []
  };
  
  // 1. Clinical Vignette Quality (Bottom-up approach)
  const hasVignette = question.stem && question.stem.length > 100;
  const hasPatientDemo = /\d+-year-old/.test(question.stem || '');
  const hasSymptoms = /present|complaint|history/i.test(question.stem || '');
  
  evaluation.criteriaScores.clinicalVignette = hasVignette && hasPatientDemo && hasSymptoms ? 5 : 3;
  console.log(`✓ Clinical Vignette: ${evaluation.criteriaScores.clinicalVignette}/5`);
  if (!hasVignette) evaluation.recommendations.push('Add detailed clinical vignette');
  
  // 2. Question Structure (Type A compliance)
  const hasLeadIn = question.leadIn && question.leadIn.includes('?');
  const hasOptions = question.options && question.options.length === 4;
  const optionsHomogeneous = checkHomogeneousOptions(question.options);
  
  evaluation.criteriaScores.structure = hasLeadIn && hasOptions && optionsHomogeneous ? 5 : 3;
  console.log(`✓ Question Structure: ${evaluation.criteriaScores.structure}/5`);
  if (!hasOptions) evaluation.recommendations.push('Ensure 4-5 homogeneous options');
  
  // 3. Application of Knowledge vs Recall
  const isApplicationBased = /most likely|best|most appropriate|initial/i.test(question.leadIn || '');
  const avoidsRecall = !/which.*true|which.*false/i.test(question.leadIn || '');
  
  evaluation.criteriaScores.knowledgeApplication = isApplicationBased && avoidsRecall ? 5 : 2;
  console.log(`✓ Knowledge Application: ${evaluation.criteriaScores.knowledgeApplication}/5`);
  if (!isApplicationBased) evaluation.recommendations.push('Focus on application rather than recall');
  
  // 4. Clarity and Precision
  const selfContained = question.stem && question.stem.length > 50;
  const clearLeadIn = question.leadIn && question.leadIn.length < 100;
  const noNegatives = !/except|not|never/i.test(question.leadIn || '');
  
  evaluation.criteriaScores.clarity = selfContained && clearLeadIn && noNegatives ? 5 : 3;
  console.log(`✓ Clarity: ${evaluation.criteriaScores.clarity}/5`);
  if (!selfContained) evaluation.recommendations.push('Make stem more self-contained');
  
  // 5. Clinical Relevance
  const realisticScenario = /presents with|examination|patient|history/i.test(question.stem || '');
  const practicalDiagnosis = question.options && question.options.some(opt => /syndrome|disease|dermatitis/i.test(opt.text || ''));
  
  evaluation.criteriaScores.clinicalRelevance = realisticScenario && practicalDiagnosis ? 5 : 3;
  console.log(`✓ Clinical Relevance: ${evaluation.criteriaScores.clinicalRelevance}/5`);
  
  // Calculate overall compliance
  const totalScore = Object.values(evaluation.criteriaScores).reduce((sum, score) => sum + score, 0);
  evaluation.overallCompliance = Math.round((totalScore / 25) * 100);
  
  console.log(`\n📊 Overall ABD Compliance: ${evaluation.overallCompliance}%`);
  console.log(`AI Scoring System Score: ${scores.totalScore}/25`);
  
  if (evaluation.recommendations.length > 0) {
    console.log('\n💡 Recommendations:');
    evaluation.recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
  }
  
  return evaluation;
}

function checkHomogeneousOptions(options) {
  if (!options || options.length < 4) return false;
  
  // Check if all options are similar in length and type
  const lengths = options.map(opt => opt.text?.length || 0);
  const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
  const lengthVariance = lengths.every(len => Math.abs(len - avgLength) < avgLength * 0.5);
  
  return lengthVariance;
}

async function runPipelineTests() {
  console.log('🚀 Starting AI Pipeline Quality Assessment');
  console.log('Testing compliance with ABD Guidelines for High-Quality Examination Questions');
  console.log('='.repeat(80));
  
  const results = [];
  
  for (const entity of testEntities) {
    const result = await testQuestionGeneration(entity);
    results.push(result);
    
    // Wait between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary Report
  console.log('\n' + '='.repeat(80));
  console.log('📊 PIPELINE QUALITY ASSESSMENT SUMMARY');
  console.log('='.repeat(80));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful generations: ${successful.length}/${testEntities.length}`);
  console.log(`❌ Failed generations: ${failed.length}/${testEntities.length}`);
  
  if (successful.length > 0) {
    const avgCompliance = successful.reduce((sum, r) => sum + (r.evaluation?.overallCompliance || 0), 0) / successful.length;
    const avgAIScore = successful.reduce((sum, r) => sum + (r.scores?.totalScore || 0), 0) / successful.length;
    
    console.log(`\n📈 Average ABD Compliance: ${Math.round(avgCompliance)}%`);
    console.log(`📈 Average AI Score: ${Math.round(avgAIScore)}/25`);
    
    console.log('\n🎯 Individual Results:');
    successful.forEach((result, i) => {
      console.log(`${i + 1}. ${result.entity}: ${result.evaluation?.overallCompliance || 0}% compliance, ${result.scores?.totalScore || 0}/25 AI score`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach((result, i) => {
      console.log(`${i + 1}. ${result.entity}: Failed at ${result.stage || 'unknown'} - ${result.error}`);
    });
  }
  
  console.log('\n🎯 CONCLUSION:');
  if (avgCompliance >= 80) {
    console.log('✅ AI Pipeline meets ABD guidelines for high-quality examination questions');
  } else if (avgCompliance >= 60) {
    console.log('⚠️ AI Pipeline partially meets ABD guidelines - some improvements needed');
  } else {
    console.log('❌ AI Pipeline needs significant improvements to meet ABD guidelines');
  }
}

// Run the tests
runPipelineTests().catch(console.error); 