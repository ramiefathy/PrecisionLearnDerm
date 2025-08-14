const admin = require('firebase-admin');

// Initialize Firebase Admin using environment token
const firebaseToken = process.env.FIREBASE_TOKEN || '1//05t0i3iWTKVe2CgYIARAAGAUSNwF-L9IrDOsOrZ7Yeqc6Ae9pgLIahhCdclgpe4Yv8YojjhnMVUwxT_gEJH5fXCgSarp7BVzlQi0';

try {
  // Use access token directly
  const credential = admin.credential.applicationDefault();
  admin.initializeApp({
    credential: credential,
    projectId: 'dermassist-ai-1zyic'
  });
  console.log('✅ Firebase Admin initialized with token');
} catch (error) {
  console.log('⚠️ Firebase initialization error, trying alternative:', error.message);
  
  // Alternative: Use project ID only (works if Firebase CLI is logged in)
  try {
    admin.initializeApp({
      projectId: 'dermassist-ai-1zyic'
    });
    console.log('✅ Firebase Admin initialized with project ID');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase:', err.message);
    process.exit(1);
  }
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
    },
    {
      id: 'melanoma-q1',
      type: 'A',
      topicIds: ['melanoma.diagnosis'],
      stem: 'A 45-year-old woman notices a change in a mole on her back. The lesion is asymmetric, has irregular borders, varied coloration from light brown to black, and measures 8mm in diameter.',
      leadIn: 'According to the ABCDE criteria, this lesion is concerning for:',
      options: [
        { text: 'Melanoma', correct: true },
        { text: 'Seborrheic keratosis', correct: false },
        { text: 'Common nevus', correct: false },
        { text: 'Solar lentigo', correct: false }
      ],
      keyIndex: 0,
      explanation: 'This lesion meets multiple ABCDE criteria for melanoma: Asymmetry, irregular Borders, Color variation, Diameter >6mm. Any lesion meeting these criteria requires urgent dermatologic evaluation.',
      difficulty: 0.1,
      status: 'active',
      createdBy: { type: 'seed', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: 'eczema-q1',
      type: 'A',
      topicIds: ['eczema.treatment'],
      stem: 'A 3-year-old child presents with chronic, pruritic, erythematous patches in the antecubital and popliteal fossae. The child has a history of asthma and food allergies.',
      leadIn: 'What is the most appropriate first-line topical treatment?',
      options: [
        { text: 'Mild topical corticosteroid', correct: true },
        { text: 'Topical antibiotics', correct: false },
        { text: 'Topical antifungals', correct: false },
        { text: 'Oral antihistamines only', correct: false }
      ],
      keyIndex: 0,
      explanation: 'Mild topical corticosteroids are first-line treatment for atopic dermatitis in children. The distribution in flexural areas and association with asthma and allergies is classic for atopic dermatitis.',
      difficulty: 0.0,
      status: 'active',
      createdBy: { type: 'seed', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      id: 'basal-cell-q1',
      type: 'A',
      topicIds: ['skin-cancer.basal-cell'],
      stem: 'A 65-year-old man with fair skin presents with a slowly growing, pearly, telangiectatic papule with rolled borders on his nose. The lesion has been present for over a year.',
      leadIn: 'What is the most likely diagnosis?',
      options: [
        { text: 'Basal cell carcinoma', correct: true },
        { text: 'Squamous cell carcinoma', correct: false },
        { text: 'Sebaceous hyperplasia', correct: false },
        { text: 'Intradermal nevus', correct: false }
      ],
      keyIndex: 0,
      explanation: 'This classic description of a pearly, telangiectatic papule with rolled borders on sun-exposed skin in an older patient is characteristic of basal cell carcinoma.',
      difficulty: 0.15,
      status: 'active',
      createdBy: { type: 'seed', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];

  try {
    console.log('📊 Checking current database state...');
    const existingItems = await db.collection('items').limit(1).get();
    console.log(`Current items in database: ${existingItems.size}`);
    
    const batch = db.batch();
    
    sampleQuestions.forEach((question) => {
      const docRef = db.collection('items').doc(question.id);
      batch.set(docRef, question);
    });
    
    console.log('🚀 Committing batch write...');
    await batch.commit();
    console.log(`✅ Successfully added ${sampleQuestions.length} sample questions!`);
    
    // Verify the questions were added
    const itemsSnapshot = await db.collection('items').limit(10).get();
    console.log(`📊 Items collection now contains ${itemsSnapshot.size} documents`);
    
    // List the added questions
    console.log('📝 Added questions:');
    itemsSnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`  - ${doc.id}: ${data.stem?.substring(0, 60)}...`);
    });
    
    return { success: true, count: sampleQuestions.length };
  } catch (error) {
    console.error('❌ Error adding questions:', error);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    console.log('🎯 Starting database seeding process...');
    const result = await addSampleQuestions();
    console.log('📋 Final result:', result);
    
    if (result.success) {
      console.log('🎉 Database seeding completed successfully!');
      console.log('✅ Quiz functionality should now work in the web app');
    } else {
      console.log('❌ Database seeding failed');
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('💥 Script failed:', error);
    process.exit(1);
  }
}

main(); 