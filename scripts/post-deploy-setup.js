#!/usr/bin/env node

/**
 * Post-deployment setup script for PrecisionLearnDerm
 * Run this after deployment to set up initial data and admin access
 */

const admin = require('firebase-admin');
const serviceAccount = require('../service-account.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://dermassist-ai-1zyic.firebaseio.com`
});

const db = admin.firestore();
const auth = admin.auth();

async function createAdminUser(email) {
  try {
    // Create or get user
    let user;
    try {
      user = await auth.getUserByEmail(email);
      console.log(`User ${email} already exists`);
    } catch (error) {
      // User doesn't exist, create it
      user = await auth.createUser({
        email: email,
        password: 'TempPassword123!',
        displayName: 'Admin User',
        emailVerified: true
      });
      console.log(`Created user ${email} with temporary password: TempPassword123!`);
    }

    // Set admin custom claim
    await auth.setCustomUserClaims(user.uid, { admin: true });
    console.log(`Set admin claim for user ${email}`);

    // Add to admins collection
    await db.collection('admins').doc(user.uid).set({
      email: email,
      displayName: user.displayName || 'Admin User',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      role: 'super_admin'
    });
    console.log(`Added ${email} to admins collection`);

    return user;
  } catch (error) {
    console.error('Error creating admin user:', error);
    throw error;
  }
}

async function seedSampleQuestions() {
  try {
    const sampleQuestions = [
      {
        type: 'mcq',
        status: 'active',
        source: 'seed',
        topic: 'Acne and Rosacea',
        subtopic: 'Acne Vulgaris',
        difficulty: 'medium',
        question: 'A 16-year-old patient presents with comedones, papules, and pustules on the face. Which of the following is the most appropriate first-line treatment?',
        options: [
          { text: 'Oral isotretinoin' },
          { text: 'Topical retinoid plus benzoyl peroxide' },
          { text: 'Oral antibiotics alone' },
          { text: 'Topical corticosteroids' },
          { text: 'Blue light therapy' }
        ],
        keyIndex: 1,
        explanation: 'For mild to moderate acne vulgaris, combination therapy with a topical retinoid and benzoyl peroxide is recommended as first-line treatment according to AAD guidelines.',
        telemetry: {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      },
      {
        type: 'mcq',
        status: 'active',
        source: 'seed',
        topic: 'Melanoma and Pigmented Lesions',
        subtopic: 'Melanoma Diagnosis',
        difficulty: 'hard',
        question: 'A 55-year-old patient presents with a pigmented lesion on the back that has shown recent changes. Dermoscopy reveals asymmetry, irregular borders, and blue-white veil. What is the most appropriate next step?',
        options: [
          { text: 'Reassure and follow up in 6 months' },
          { text: 'Cryotherapy' },
          { text: 'Excisional biopsy with 1-2mm margins' },
          { text: 'Shave biopsy' },
          { text: 'Wide local excision with 2cm margins' }
        ],
        keyIndex: 2,
        explanation: 'When melanoma is suspected based on clinical and dermoscopic features, excisional biopsy with 1-2mm margins is the preferred diagnostic procedure to allow for accurate histopathologic staging.',
        telemetry: {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      },
      {
        type: 'mcq',
        status: 'active',
        source: 'seed',
        topic: 'Psoriasis and Psoriatic Arthritis',
        subtopic: 'Psoriasis Treatment',
        difficulty: 'medium',
        question: 'A patient with moderate plaque psoriasis affecting 10% BSA has failed topical corticosteroids. Which systemic therapy has the most rapid onset of action?',
        options: [
          { text: 'Methotrexate' },
          { text: 'Acitretin' },
          { text: 'Cyclosporine' },
          { text: 'Adalimumab' },
          { text: 'Apremilast' }
        ],
        keyIndex: 2,
        explanation: 'Cyclosporine has the most rapid onset of action among systemic therapies for psoriasis, typically showing improvement within 2-4 weeks.',
        telemetry: {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      },
      {
        type: 'mcq',
        status: 'active',
        source: 'seed',
        topic: 'Atopic Dermatitis and Eczema',
        subtopic: 'Atopic Dermatitis Management',
        difficulty: 'easy',
        question: 'Which of the following is the most important aspect of atopic dermatitis management?',
        options: [
          { text: 'Oral antihistamines' },
          { text: 'Daily moisturization' },
          { text: 'Antibiotics' },
          { text: 'Dietary restrictions' },
          { text: 'UV phototherapy' }
        ],
        keyIndex: 1,
        explanation: 'Daily moisturization is the cornerstone of atopic dermatitis management, helping to restore skin barrier function and reduce flares.',
        telemetry: {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      },
      {
        type: 'mcq',
        status: 'active',
        source: 'seed',
        topic: 'Skin Cancer',
        subtopic: 'Basal Cell Carcinoma',
        difficulty: 'medium',
        question: 'A 70-year-old patient has a 1.5cm nodular basal cell carcinoma on the nose. Which treatment offers the highest cure rate?',
        options: [
          { text: 'Cryotherapy' },
          { text: 'Topical imiquimod' },
          { text: 'Mohs micrographic surgery' },
          { text: 'Standard excision' },
          { text: 'Radiation therapy' }
        ],
        keyIndex: 2,
        explanation: 'Mohs micrographic surgery offers the highest cure rate (>99%) for basal cell carcinoma, especially in high-risk locations like the nose.',
        telemetry: {
          attempts: 0,
          avgTimeSec: 0,
          p2TimeSec: 0,
          p98TimeSec: 0,
          times: []
        }
      }
    ];

    const batch = db.batch();
    let count = 0;

    for (const question of sampleQuestions) {
      const docRef = db.collection('items').doc();
      batch.set(docRef, {
        ...question,
        id: docRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'system'
      });
      count++;
    }

    await batch.commit();
    console.log(`Successfully seeded ${count} sample questions`);
    return count;
  } catch (error) {
    console.error('Error seeding questions:', error);
    throw error;
  }
}

async function createInitialCollections() {
  try {
    // Create initial collections with sample documents
    const collections = [
      {
        name: 'config',
        doc: 'app',
        data: {
          version: '1.0.0',
          maintenanceMode: false,
          features: {
            aiGeneration: true,
            adaptiveLearning: true,
            spaceRepetition: true
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      },
      {
        name: 'stats',
        doc: 'global',
        data: {
          totalQuestions: 5,
          totalUsers: 0,
          totalSessions: 0,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }
      }
    ];

    for (const col of collections) {
      await db.collection(col.name).doc(col.doc).set(col.data);
      console.log(`Created ${col.name}/${col.doc}`);
    }
  } catch (error) {
    console.error('Error creating collections:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting post-deployment setup for PrecisionLearnDerm...\n');

  try {
    // Step 1: Create admin user
    console.log('📋 Step 1: Creating admin user...');
    const adminEmail = process.argv[2] || 'admin@precisionlearnderm.com';
    await createAdminUser(adminEmail);
    console.log('✅ Admin user created\n');

    // Step 2: Seed sample questions
    console.log('📋 Step 2: Seeding sample questions...');
    const questionCount = await seedSampleQuestions();
    console.log('✅ Sample questions seeded\n');

    // Step 3: Create initial collections
    console.log('📋 Step 3: Creating initial collections...');
    await createInitialCollections();
    console.log('✅ Initial collections created\n');

    console.log('🎉 Post-deployment setup completed successfully!');
    console.log('\n📝 Next steps:');
    console.log(`1. Visit https://dermassist-ai-1zyic.web.app`);
    console.log(`2. Sign in with email: ${adminEmail}`);
    console.log(`3. Use temporary password: TempPassword123!`);
    console.log(`4. Change your password immediately after login`);
    console.log(`5. Start using the application!\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run the setup
main();
