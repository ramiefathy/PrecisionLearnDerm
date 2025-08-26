import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from '../util/auth';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const db = admin.firestore();

// High-quality questions from our analysis (first 10 as a test)
const HIGH_QUALITY_QUESTIONS = [
  {
    "itemId": "legacy_001",
    "type": "mcq",
    "status": "active",
    "createdBy": "legacy_import_system",
    "source": "legacy_question_bank",
    "originalId": "MycOZUOhRHEW81lbeWXj",
    
    "stem": "A 55-year-old male presents with a persistent, scaly, erythematous plaque on his lower leg. A 3mm punch biopsy shows interface dermatitis with vacuolar alteration, scattered necrotic keratinocytes, and a superficial and deep perivascular lymphocytic infiltrate with scattered eosinophils. He started allopurinol 3 months ago for gout. Which of the following is the most likely diagnosis?",
    "leadIn": "Which of the following is the most appropriate answer?",
    "options": [
      "Fixed drug eruption",
      "Lichen planus",
      "Drug-induced lupus",
      "DRESS syndrome",
      "Stevens-Johnson syndrome"
    ],
    "keyIndex": 0,
    "explanation": "This clinical and histopathologic presentation is most consistent with a fixed drug eruption. The timeline correlating with allopurinol initiation, the localized nature of the lesion, and the interface dermatitis with vacuolar alteration and eosinophils support this diagnosis.",
    
    "topicIds": ["medical_dermatology"],
    "category": "medical_dermatology",
    "subcategory": "drug_eruptions",
    "primaryTopic": "Drug Eruptions",
    
    "difficulty": 6,
    "estimatedDifficulty": "medium",
    "qualityScore": 9.4,
    
    "tags": ["medical_dermatology", "medium", "imported", "board_exam"],
    "boardExamRelevant": true,
    "clinicalRelevance": "high",
    
    "stats": {
      "timesServed": 0,
      "timesCorrect": 0,
      "avgTimeToAnswer": 0,
      "avgConfidence": 0,
      "lastServed": null
    }
  },
  {
    "itemId": "legacy_002", 
    "type": "mcq",
    "status": "active",
    "createdBy": "legacy_import_system",
    "source": "legacy_question_bank",
    "originalId": "i5zRrtHq1Q9vQe6QYsdj",
    
    "stem": "A 68-year-old fair-skinned man presents with a 1.5 cm ulcerated nodule on his left ear helix that has been slowly growing over the past year. The lesion has raised, rolled borders and a central ulceration with occasional bleeding. Which of the following is the most likely diagnosis?",
    "leadIn": "Which of the following is the most appropriate answer?",
    "options": [
      "Squamous cell carcinoma",
      "Basal cell carcinoma", 
      "Keratoacanthoma",
      "Seborrheic keratosis",
      "Actinic keratosis"
    ],
    "keyIndex": 1,
    "explanation": "This presentation is classic for basal cell carcinoma. The rolled borders, central ulceration, slow growth, and location on a sun-exposed area in an elderly fair-skinned individual are pathognomonic features of nodular basal cell carcinoma.",
    
    "topicIds": ["dermatologic_oncology"],
    "category": "oncology_tumors", 
    "subcategory": "general",
    "primaryTopic": "Skin Cancer",
    
    "difficulty": 6,
    "estimatedDifficulty": "medium",
    "qualityScore": 9.4,
    
    "tags": ["oncology_tumors", "medium", "imported", "board_exam"],
    "boardExamRelevant": true,
    "clinicalRelevance": "high",
    
    "stats": {
      "timesServed": 0,
      "timesCorrect": 0, 
      "avgTimeToAnswer": 0,
      "avgConfidence": 0,
      "lastServed": null
    }
  },
  {
    "itemId": "legacy_003",
    "type": "mcq", 
    "status": "active",
    "createdBy": "legacy_import_system",
    "source": "legacy_question_bank",
    "originalId": "rwkNXdvRJDRJbRFeOyWJ",
    
    "stem": "A 45-year-old woman presents with a pigmented lesion on her back that has been changing in size and color over the past 6 months. The lesion is 8mm in diameter, asymmetric, with irregular borders and variegated color including black, brown, and blue areas. Which of the following is the most likely diagnosis?",
    "leadIn": "Which of the following is the most appropriate answer?",
    "options": [
      "Dysplastic nevus",
      "Melanoma",
      "Seborrheic keratosis", 
      "Solar lentigo",
      "Blue nevus"
    ],
    "keyIndex": 1,
    "explanation": "This lesion demonstrates the ABCDE criteria for melanoma: Asymmetry, Border irregularity, Color variegation, Diameter >6mm, and Evolution (changing). The combination of these features in a changing pigmented lesion is highly suspicious for melanoma.",
    
    "topicIds": ["dermatologic_oncology"],
    "category": "oncology_tumors",
    "subcategory": "general", 
    "primaryTopic": "Melanoma",
    
    "difficulty": 6,
    "estimatedDifficulty": "medium",
    "qualityScore": 9.4,
    
    "tags": ["oncology_tumors", "medium", "imported", "board_exam"],
    "boardExamRelevant": true,
    "clinicalRelevance": "high",
    
    "stats": {
      "timesServed": 0,
      "timesCorrect": 0,
      "avgTimeToAnswer": 0, 
      "avgConfidence": 0,
      "lastServed": null
    }
  },
  {
    "itemId": "legacy_004",
    "type": "mcq",
    "status": "active", 
    "createdBy": "legacy_import_system",
    "source": "legacy_question_bank",
    "originalId": "6FdYa4LkHPdsnSQlm29K",
    
    "stem": "A 32-year-old woman presents with a new, rapidly growing mole on her back. She describes it as asymmetric with irregular borders and multiple colors. Dermoscopy reveals an irregular pigment network, blue-white veil, and atypical vascular pattern. Which of the following is the most appropriate next step?",
    "leadIn": "Which of the following is the most appropriate answer?",
    "options": [
      "Observe for 3 months and re-evaluate",
      "Excisional biopsy with 2mm margins", 
      "Shave biopsy for diagnosis",
      "Cryotherapy",
      "Topical imiquimod"
    ],
    "keyIndex": 1,
    "explanation": "Given the clinical and dermoscopic features highly suspicious for melanoma, an excisional biopsy with narrow margins is the most appropriate diagnostic approach. This allows for full histopathologic evaluation including Breslow depth measurement.",
    
    "topicIds": ["dermatologic_oncology"],
    "category": "oncology_tumors",
    "subcategory": "general",
    "primaryTopic": "Melanoma Diagnosis",
    
    "difficulty": 3,
    "estimatedDifficulty": "easy", 
    "qualityScore": 8.9,
    
    "tags": ["oncology_tumors", "easy", "imported", "board_exam"],
    "boardExamRelevant": true,
    "clinicalRelevance": "high",
    
    "stats": {
      "timesServed": 0,
      "timesCorrect": 0,
      "avgTimeToAnswer": 0,
      "avgConfidence": 0,
      "lastServed": null
    }
  },
  {
    "itemId": "legacy_005",
    "type": "mcq",
    "status": "active",
    "createdBy": "legacy_import_system", 
    "source": "legacy_question_bank",
    "originalId": "E6rxxH7IIQRA32pFGDRo",
    
    "stem": "A 48-year-old Caucasian male presents with a new pigmented lesion on his back that he noticed has changed in appearance over the past 4 months. Physical examination reveals a 7mm asymmetric lesion with irregular borders and variegated pigmentation. Which of the following dermoscopic findings would be most concerning for melanoma?",
    "leadIn": "Which of the following is the most appropriate answer?",
    "options": [
      "Uniform pigment network",
      "Blue-white veil",
      "Central hypopigmentation",
      "Symmetrical dot pattern", 
      "Regular globular pattern"
    ],
    "keyIndex": 1,
    "explanation": "Blue-white veil is a dermoscopic feature highly specific for melanoma. It appears as an irregular, confluent blue pigmentation with an overlying white 'ground-glass' appearance and is considered one of the most important dermoscopic criteria for melanoma diagnosis.",
    
    "topicIds": ["dermatologic_oncology"],
    "category": "medical_dermatology",
    "subcategory": "general",
    "primaryTopic": "Dermoscopy",
    
    "difficulty": 6,
    "estimatedDifficulty": "medium",
    "qualityScore": 8.9,
    
    "tags": ["medical_dermatology", "medium", "imported", "board_exam"],
    "boardExamRelevant": true,
    "clinicalRelevance": "high",
    
    "stats": {
      "timesServed": 0,
      "timesCorrect": 0,
      "avgTimeToAnswer": 0,
      "avgConfidence": 0, 
      "lastServed": null
    }
  }
];

export const importLegacyQuestions = functions.storage.object().onFinalize(async (object) => {
  const fileBucket = object.bucket; // The Storage bucket that contains the file.
  const filePath = object.name; // File path in the bucket.
  const contentType = object.contentType; // File content type.

  // Exit if this is triggered on a file that is not a JSON file.
  if (!contentType || !contentType.startsWith('application/json')) {
    return console.log('This is not a JSON file.');
  }

  // Get the file name.
  const fileName = path.basename(filePath || '');

  // Download file from bucket.
  const bucket = admin.storage().bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  await bucket.file(filePath || '').download({destination: tempFilePath});

  // Read the file content.
  const fileContent = fs.readFileSync(tempFilePath, 'utf8');
  const questionsToImport = JSON.parse(fileContent);

  const batch = db.batch();
  let importCount = 0;
  
  for (const question of questionsToImport) {
    const docRef = db.collection('items').doc(); // Create a new document with a random ID.
    
    // Add timestamps
    const questionWithTimestamps = {
      ...question,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    batch.set(docRef, questionWithTimestamps);
    importCount++;
  }
  
  // Commit the batch
  await batch.commit();
  
  // Update metadata
  await db.collection('admin').doc('questionBankMetadata').set({
    lastImport: admin.firestore.FieldValue.serverTimestamp(),
    totalImportedQuestions: importCount,
    source: fileName
  }, { merge: true });
  
  console.log(`Successfully imported ${importCount} legacy questions from ${fileName}`);
  
  return {
    success: true,
    message: `Successfully imported ${importCount} high-quality legacy questions from ${fileName}`,
    questionsImported: importCount
  };
});


export const getQuestionBankStats = functions.https.onCall(async (data, context) => {
  requireAdmin(context);
  const uid = context.auth?.uid || 'unknown';
  
  try {
    // Get total questions count
    const itemsSnapshot = await db.collection('items').get();
    const totalQuestions = itemsSnapshot.size;
    
    // Get questions by source
    const legacySnapshot = await db.collection('items')
      .where('source', '==', 'legacy_question_bank')
      .get();
    const legacyCount = legacySnapshot.size;
    
    const generatedSnapshot = await db.collection('items')
      .where('source', '!=', 'legacy_question_bank')
      .get();
    const generatedCount = generatedSnapshot.size;
    
    // Get questions by category
    const categories: Record<string, number> = {};
    itemsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const category = data.category || 'uncategorized';
      categories[category] = (categories[category] || 0) + 1;
    });
    
    // Get average quality scores
    const qualityScores: number[] = [];
    itemsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.qualityScore && typeof data.qualityScore === 'number') {
        qualityScores.push(data.qualityScore);
      }
    });
    
    const avgQuality = qualityScores.length > 0 
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
      : 0;
    
    return {
      totalQuestions,
      legacyImported: legacyCount,
      aiGenerated: generatedCount,
      categories,
      averageQuality: Math.round(avgQuality * 10) / 10,
      qualityRange: qualityScores.length > 0 ? {
        min: Math.min(...qualityScores),
        max: Math.max(...qualityScores)
      } : null
    };
    
  } catch (error: any) {
    console.error('Error getting question bank stats:', error);
    throw new functions.https.HttpsError('internal', `Failed to get stats: ${error instanceof Error ? error.message : String(error)}`);
  }
}); 