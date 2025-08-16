const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = {
  "type": "service_account",
  "project_id": "precisionlearnderm-ab5a9",
  "private_key_id": "3a2acd8e2aa1e7c8e9e7f4a8b5c9e2d7a6f3b1e4",
  "private_key": "-----BEGIN PRIVATE KEY-----\nYou'll need to add your actual private key here\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@precisionlearnderm-ab5a9.iam.gserviceaccount.com",
  "client_id": "102397835727484968357",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40precisionlearnderm-ab5a9.iam.gserviceaccount.com"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'precisionlearnderm-ab5a9'
});

const db = admin.firestore();

async function seedDatabase() {
  console.log('🌱 Seeding database with sample dermatology questions...');
  
  const sampleItems = [
    {
      type: 'A',
      topicIds: ['psoriasis.plaque'],
      stem: 'A 35-year-old man presents with well-demarcated, erythematous plaques with silvery scales on his elbows and knees. The lesions have been present for several months and are mildly pruritic. On examination, you note the Auspitz sign.',
      leadIn: 'What is the most likely diagnosis?',
      options: [
        { text: 'Psoriasis vulgaris' },
        { text: 'Atopic dermatitis' },
        { text: 'Seborrheic dermatitis' },
        { text: 'Lichen planus' }
      ],
      keyIndex: 0,
      explanation: 'This presentation is classic for psoriasis vulgaris. The well-demarcated erythematous plaques with silvery scales in typical locations (elbows and knees), combined with the Auspitz sign (pinpoint bleeding when scales are removed), strongly suggest psoriasis. Atopic dermatitis typically presents with poorly demarcated patches and is more common in flexural areas. Seborrheic dermatitis affects sebaceous gland-rich areas. Lichen planus presents with purple, polygonal papules.',
      citations: [{ source: 'KB:psoriasis:clinical_features' }],
      difficulty: 0.2,
      status: 'active',
      telemetry: {
        attempts: 0,
        pCorrect: 0.75,
        avgTimeSec: 45,
        pointBiserial: 0.3
      },
      createdBy: { type: 'admin', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      type: 'A',
      topicIds: ['acne.vulgaris'],
      stem: 'A 16-year-old female presents with open and closed comedones on her forehead and cheeks, along with several inflammatory papules and pustules. She reports that the condition worsens before her menstrual period.',
      leadIn: 'What is the most appropriate first-line topical treatment?',
      options: [
        { text: 'Topical retinoid (tretinoin)' },
        { text: 'Oral isotretinoin' },
        { text: 'Oral antibiotics' },
        { text: 'Topical corticosteroids' }
      ],
      keyIndex: 0,
      explanation: 'Topical retinoids are first-line treatment for acne vulgaris, particularly effective for both comedonal and inflammatory acne. They work by normalizing follicular keratinization and have anti-inflammatory properties. Oral isotretinoin is reserved for severe, scarring acne. Oral antibiotics are used for moderate to severe inflammatory acne. Topical corticosteroids are not recommended for acne as they can worsen the condition.',
      citations: [{ source: 'KB:acne:treatment_guidelines' }],
      difficulty: -0.1,
      status: 'active',
      telemetry: {
        attempts: 0,
        pCorrect: 0.68,
        avgTimeSec: 52,
        pointBiserial: 0.25
      },
      createdBy: { type: 'admin', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      type: 'A',
      topicIds: ['tinea.corporis'],
      stem: 'A 25-year-old athlete presents with an erythematous, scaly, ring-shaped lesion on his arm with central clearing. He reports it started as a small red spot and gradually expanded outward. KOH preparation shows branching hyphae and spores.',
      leadIn: 'What is the most likely causative organism?',
      options: [
        { text: 'Trichophyton rubrum' },
        { text: 'Candida albicans' },
        { text: 'Malassezia furfur' },
        { text: 'Microsporum canis' }
      ],
      keyIndex: 0,
      explanation: 'The clinical presentation of an expanding ring-shaped lesion with central clearing, along with positive KOH showing hyphae and spores, is diagnostic of tinea corporis (ringworm). Trichophyton rubrum is the most common cause of tinea corporis in adults. Candida typically causes intertriginous infections. Malassezia causes tinea versicolor with different morphology. Microsporum canis is more common in children with animal exposure.',
      citations: [{ source: 'KB:tinea:microbiology' }],
      difficulty: 0.0,
      status: 'active',
      telemetry: {
        attempts: 0,
        pCorrect: 0.72,
        avgTimeSec: 38,
        pointBiserial: 0.35
      },
      createdBy: { type: 'admin', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      type: 'A',
      topicIds: ['atopic.dermatitis'],
      stem: 'A 5-year-old child presents with chronic, relapsing eczematous lesions in the antecubital and popliteal fossae. The lesions are intensely pruritic, and the child has a history of asthma and food allergies. Family history is significant for allergies.',
      leadIn: 'What is the most appropriate initial management?',
      options: [
        { text: 'Topical corticosteroids and emollients' },
        { text: 'Oral corticosteroids' },
        { text: 'Topical calcineurin inhibitors only' },
        { text: 'Antihistamines only' }
      ],
      keyIndex: 0,
      explanation: 'Atopic dermatitis management involves a combination approach. Topical corticosteroids are first-line anti-inflammatory treatment for acute flares, while regular use of emollients helps maintain skin barrier function and prevent flares. This combination addresses both the inflammatory component and the underlying barrier dysfunction. Oral corticosteroids are avoided in chronic conditions. Calcineurin inhibitors are second-line. Antihistamines help with pruritus but do not treat the underlying inflammation.',
      citations: [{ source: 'KB:atopic_dermatitis:management' }],
      difficulty: -0.2,
      status: 'active',
      telemetry: {
        attempts: 0,
        pCorrect: 0.78,
        avgTimeSec: 41,
        pointBiserial: 0.28
      },
      createdBy: { type: 'admin', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      type: 'A',
      topicIds: ['melanoma'],
      stem: 'A 45-year-old fair-skinned woman with a history of multiple sunburns presents with a 6mm asymmetric, irregularly bordered, multicolored lesion on her back. The lesion has changed in size and color over the past 3 months.',
      leadIn: 'What is the most appropriate next step?',
      options: [
        { text: 'Excisional biopsy with narrow margins' },
        { text: 'Shave biopsy' },
        { text: 'Punch biopsy' },
        { text: 'Observation for 3 months' }
      ],
      keyIndex: 0,
      explanation: 'This lesion shows multiple ABCDE criteria for melanoma: Asymmetry, irregular Border, multiple Colors, large Diameter (>6mm), and Evolution (change over time). For suspected melanoma, excisional biopsy with narrow margins is the gold standard as it provides the entire lesion for histopathologic analysis and accurate staging. Shave and punch biopsies may not provide adequate tissue depth for Breslow thickness measurement. Observation is inappropriate for a suspicious pigmented lesion.',
      citations: [{ source: 'KB:melanoma:diagnosis' }],
      difficulty: 0.1,
      status: 'active',
      telemetry: {
        attempts: 0,
        pCorrect: 0.71,
        avgTimeSec: 55,
        pointBiserial: 0.32
      },
      createdBy: { type: 'admin', at: admin.firestore.FieldValue.serverTimestamp() },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  ];

  const batch = db.batch();
  const results = [];

  for (const item of sampleItems) {
    const docRef = db.collection('items').doc();
    batch.set(docRef, item);
    results.push({ id: docRef.id, topic: item.topicIds[0] });
  }

  await batch.commit();
  
  console.log('✅ Successfully created sample questions:');
  results.forEach(item => {
    console.log(`  - ${item.topic}: ${item.id}`);
  });
  
  console.log('\n🎉 Database seeded! Quiz functionality should now work.');
  process.exit(0);
}

seedDatabase().catch(error => {
  console.error('❌ Error seeding database:', error);
  process.exit(1);
}); 