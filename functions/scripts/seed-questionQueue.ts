import * as admin from 'firebase-admin';

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  const samples = [
    {
      draftItem: {
        type: 'mcq',
        stem: 'A 25-year-old with scaly plaques on extensor surfaces.',
        leadIn: 'Most likely diagnosis?',
        options: [{ text: 'Psoriasis' }, { text: 'Eczema' }, { text: 'Tinea' }, { text: 'Lichen planus' }],
        keyIndex: 0,
        explanation: 'Classic extensor plaques are typical of psoriasis.',
        difficulty: 0.5,
        qualityScore: 80,
        // Image present but no alt text for a11y approval test
        media: { url: 'https://example.com/psoriasis.jpg' }
      },
      topicHierarchy: { category: 'medical-dermatology', topic: 'papulosquamous', subtopic: 'psoriasis' },
      kbSource: { entity: 'Psoriasis', completenessScore: 82 },
      pipelineOutputs: { generation: { method: 'orchestrated' } },
      priority: 5,
      source: 'user_feedback',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    {
      draftItem: {
        type: 'mcq',
        stem: 'A 30-year-old with intensely itchy vesicles on extensor elbows.',
        leadIn: 'Most likely diagnosis?',
        options: [{ text: 'Dermatitis herpetiformis' }, { text: 'Impetigo' }, { text: 'Scabies' }, { text: 'Eczema' }],
        keyIndex: 0,
        explanation: 'Grouped vesicles on extensor surfaces suggests DH.',
        difficulty: 0.6,
        qualityScore: 78,
      },
      topicHierarchy: { category: 'medical-dermatology', topic: 'immunobullous', subtopic: 'dermatitis-herpetiformis' },
      kbSource: { entity: 'Dermatitis herpetiformis', completenessScore: 75 },
      pipelineOutputs: { generation: { method: 'orchestrated' } },
      priority: 4,
      source: 'pipeline',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  ];

  let created = 0;
  for (const data of samples) {
    const ref = db.collection('questionQueue').doc();
    await ref.set(data);
    created++;
  }

  console.log(`[SEED] Created ${created} documents in questionQueue`);
}

main().catch((e) => {
  console.error('[SEED] Failed:', e);
  process.exit(1);
});


