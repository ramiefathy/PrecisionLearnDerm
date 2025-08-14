const admin = require('firebase-admin');

// Initialize Firebase Admin with minimal setup
try {
  admin.initializeApp({
    projectId: 'dermassist-ai-1zyic'
  });
  console.log('✅ Firebase Admin initialized');
} catch (error) {
  console.log('⚠️ Firebase already initialized or error:', error.message);
}

const db = admin.firestore();

async function addSampleQuestions() {
  console.log('🌱 Adding sample questions to Firestore...');
  
  const sampleQuestions = [
    {
      id: 'psoriasis-q1',
      type: 'A',
      topicIds: ['psoriasis.diagnosis'],
      stem: 'A 35-year-old man presents with well-demarcated, erythematous plaques with silvery scales on his elbows and knees. The lesions have been present for several months and are mildly pruritic. On examination, you note the Auspitz sign.',
      leadIn: 'What is the most likely diagnosis?',
      options: [
        { text: 'Psoriasis vulgaris', correct: true },
        { text: 'Atopic dermatitis', correct: false },
        { text: 'Seborrheic dermatitis', correct: false },
        { text: 'Lichen planus', correct: false }
      ],
      keyIndex: 0,
      explanation: 'This presentation is classic for psoriasis vulgaris. The well-demarcated erythematous plaques with silvery scales in typical locations (elbows and knees), combined with the Auspitz sign, strongly suggest psoriasis.',
      difficulty: 0.2,
      status: 'active',
      createdBy: { type: 'seed', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: 'acne-q1',
      type: 'A',
      topicIds: ['acne.treatment'],
      stem: 'A 16-year-old female presents with open and closed comedones on her forehead and cheeks, along with several inflammatory papules and pustules.',
      leadIn: 'What is the most appropriate first-line topical treatment?',
      options: [
        { text: 'Topical retinoid (tretinoin)', correct: true },
        { text: 'Oral isotretinoin', correct: false },
        { text: 'Oral antibiotics', correct: false },
        { text: 'Topical corticosteroids', correct: false }
      ],
      keyIndex: 0,
      explanation: 'Topical retinoids are first-line treatment for acne vulgaris, particularly effective for both comedonal and inflammatory acne.',
      difficulty: -0.1,
      status: 'active',
      createdBy: { type: 'seed', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];

  try {
    const batch = db.batch();
    
    sampleQuestions.forEach((question) => {
      const docRef = db.collection('items').doc(question.id);
      batch.set(docRef, question);
    });
    
    await batch.commit();
    console.log(`✅ Successfully added ${sampleQuestions.length} sample questions!`);
    
    // Verify the questions were added
    const itemsSnapshot = await db.collection('items').limit(5).get();
    console.log(`📊 Items collection now contains ${itemsSnapshot.size} documents`);
    
    return { success: true, count: sampleQuestions.length };
  } catch (error) {
    console.error('❌ Error adding questions:', error);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    const result = await addSampleQuestions();
    console.log('Final result:', result);
    process.exit(0);
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main(); 