export interface TopicHierarchy {
  category: string;
  topic: string;
  subtopic: string;
  id: string;
  name: string;
  description: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  boardRelevance: 'high' | 'medium' | 'low';
  kbEntities?: string[]; // Related knowledge base entities
}

export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  topics: CategoryTopic[];
}

export interface CategoryTopic {
  id: string;
  name: string;
  description: string;
  subtopics: Subtopic[];
}

export interface Subtopic {
  id: string;
  name: string;
  description: string;
  difficulty: 'basic' | 'intermediate' | 'advanced';
  boardRelevance: 'high' | 'medium' | 'low';
  kbEntities: string[];
}

// Comprehensive dermatology taxonomy for targeted learning
export const DERMATOLOGY_CATEGORIES: Category[] = [
  {
    id: 'medical-dermatology',
    name: 'Medical Dermatology',
    description: 'Non-surgical dermatological conditions and treatments',
    color: 'from-blue-500 to-cyan-500',
    icon: '🩺',
    topics: [
      {
        id: 'inflammatory-conditions',
        name: 'Inflammatory Conditions',
        description: 'Chronic and acute inflammatory skin diseases',
        subtopics: [
          {
            id: 'psoriasis',
            name: 'Psoriasis',
            description: 'Chronic immune-mediated inflammatory condition',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Psoriasis', 'Psoriatic arthritis', 'Pustular psoriasis']
          },
          {
            id: 'eczema-dermatitis',
            name: 'Eczema & Dermatitis',
            description: 'Atopic dermatitis and contact dermatitis spectrum',
            difficulty: 'basic',
            boardRelevance: 'high',
            kbEntities: ['Atopic dermatitis', 'Contact dermatitis', 'Seborrheic dermatitis']
          },
          {
            id: 'lupus-connective-tissue',
            name: 'Lupus & Connective Tissue',
            description: 'Autoimmune connective tissue disorders',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Systemic lupus erythematosus', 'Scleroderma', 'Dermatomyositis']
          }
        ]
      },
      {
        id: 'infectious-diseases',
        name: 'Infectious Diseases',
        description: 'Bacterial, viral, fungal, and parasitic skin infections',
        subtopics: [
          {
            id: 'bacterial-infections',
            name: 'Bacterial Infections',
            description: 'Bacterial skin and soft tissue infections',
            difficulty: 'basic',
            boardRelevance: 'high',
            kbEntities: ['Cellulitis', 'Impetigo', 'Folliculitis', 'Abscess']
          },
          {
            id: 'viral-infections',
            name: 'Viral Infections',
            description: 'Viral exanthems and skin manifestations',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Herpes simplex', 'Varicella zoster', 'Molluscum contagiosum', 'Warts']
          },
          {
            id: 'fungal-infections',
            name: 'Fungal Infections',
            description: 'Superficial and deep fungal infections',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Tinea corporis', 'Tinea versicolor', 'Candidiasis', 'Onychomycosis']
          }
        ]
      },
      {
        id: 'autoimmune-blistering',
        name: 'Autoimmune & Blistering',
        description: 'Autoimmune and blistering disorders',
        subtopics: [
          {
            id: 'pemphigus-group',
            name: 'Pemphigus Group',
            description: 'Intraepidermal blistering diseases',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Pemphigus vulgaris', 'Pemphigus foliaceus', 'Pemphigus erythematosus']
          },
          {
            id: 'pemphigoid-group',
            name: 'Pemphigoid Group',
            description: 'Subepidermal blistering diseases',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Bullous pemphigoid', 'Cicatricial pemphigoid', 'Linear IgA disease']
          }
        ]
      }
    ]
  },
  {
    id: 'dermatopathology',
    name: 'Dermatopathology',
    description: 'Microscopic diagnosis and pathological patterns',
    color: 'from-purple-500 to-pink-500',
    icon: '🔬',
    topics: [
      {
        id: 'inflammatory-patterns',
        name: 'Inflammatory Patterns',
        description: 'Histopathological patterns of inflammation',
        subtopics: [
          {
            id: 'spongiotic-dermatitis',
            name: 'Spongiotic Dermatitis',
            description: 'Eczematous reaction patterns',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Spongiotic dermatitis pattern']
          },
          {
            id: 'psoriasiform-dermatitis',
            name: 'Psoriasiform Dermatitis',
            description: 'Psoriasis-like reaction patterns',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Psoriasiform pattern']
          }
        ]
      }
    ]
  },
  {
    id: 'dermatologic-surgery',
    name: 'Dermatologic Surgery',
    description: 'Surgical dermatology and procedures',
    color: 'from-green-500 to-emerald-500',
    icon: '🔪',
    topics: [
      {
        id: 'skin-cancer-surgery',
        name: 'Skin Cancer Surgery',
        description: 'Surgical management of skin cancers',
        subtopics: [
          {
            id: 'mohs-surgery',
            name: 'Mohs Surgery',
            description: 'Micrographic surgery techniques',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Mohs surgery']
          },
          {
            id: 'excision-techniques',
            name: 'Excision Techniques',
            description: 'Standard excision and closure methods',
            difficulty: 'intermediate',
            boardRelevance: 'medium',
            kbEntities: ['Surgical excision']
          }
        ]
      }
    ]
  },
  {
    id: 'cosmetic-dermatology',
    name: 'Cosmetic Dermatology',
    description: 'Aesthetic procedures and treatments',
    color: 'from-pink-500 to-rose-500',
    icon: '✨',
    topics: [
      {
        id: 'injectable-treatments',
        name: 'Injectable Treatments',
        description: 'Botox, fillers, and neuromodulators',
        subtopics: [
          {
            id: 'botulinum-toxin',
            name: 'Botulinum Toxin',
            description: 'Neuromodulator treatments',
            difficulty: 'intermediate',
            boardRelevance: 'low',
            kbEntities: ['Botulinum toxin']
          }
        ]
      }
    ]
  },
  {
    id: 'pediatric-dermatology',
    name: 'Pediatric Dermatology',
    description: 'Skin conditions specific to children',
    color: 'from-orange-500 to-red-500',
    icon: '🧸',
    topics: [
      {
        id: 'genetic-disorders',
        name: 'Genetic Disorders',
        description: 'Hereditary and congenital skin conditions',
        subtopics: [
          {
            id: 'genodermatoses',
            name: 'Genodermatoses',
            description: 'Inherited skin disorders',
            difficulty: 'advanced',
            boardRelevance: 'medium',
            kbEntities: ['Epidermolysis bullosa', 'Ichthyosis', 'Neurofibromatosis']
          }
        ]
      }
    ]
  },
  {
    id: 'dermatopharmacology',
    name: 'Dermatopharmacology',
    description: 'Pharmacology of dermatologic therapies',
    color: 'from-sky-500 to-blue-600',
    icon: '💊',
    topics: [
      {
        id: 'systemic-agents',
        name: 'Systemic Agents',
        description: 'Immunomodulators, retinoids, antibiotics, antifungals',
        subtopics: [
          {
            id: 'biologics',
            name: 'Biologics',
            description: 'TNF, IL-17, IL-23, IL-4/13 pathway agents',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Adalimumab', 'Secukinumab', 'Ustekinumab', 'Dupilumab']
          },
          {
            id: 'retinoids',
            name: 'Retinoids',
            description: 'Systemic retinoids dosing and safety',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: ['Isotretinoin', 'Acitretin']
          },
          {
            id: 'immunomodulators',
            name: 'Immunomodulators',
            description: 'Methotrexate, cyclosporine, mycophenolate',
            difficulty: 'advanced',
            boardRelevance: 'high',
            kbEntities: ['Methotrexate', 'Cyclosporine', 'Mycophenolate mofetil']
          },
          {
            id: 'antibiotics-antifungals',
            name: 'Antibiotics & Antifungals',
            description: 'Common systemic antibacterials and antifungals',
            difficulty: 'basic',
            boardRelevance: 'medium',
            kbEntities: ['Doxycycline', 'Trimethoprim-sulfamethoxazole', 'Terbinafine']
          }
        ]
      },
      {
        id: 'topical-therapies',
        name: 'Topical Therapies',
        description: 'Corticosteroids, calcineurin inhibitors, keratolytics',
        subtopics: [
          {
            id: 'steroids',
            name: 'Topical Corticosteroids',
            description: 'Classes, potency, adverse effects',
            difficulty: 'basic',
            boardRelevance: 'high',
            kbEntities: ['Topical corticosteroids']
          },
          {
            id: 'tci',
            name: 'Calcineurin Inhibitors',
            description: 'Tacrolimus and pimecrolimus',
            difficulty: 'basic',
            boardRelevance: 'medium',
            kbEntities: ['Tacrolimus', 'Pimecrolimus']
          },
          {
            id: 'keratolytics',
            name: 'Keratolytics',
            description: 'Salicylic acid, urea and related agents',
            difficulty: 'basic',
            boardRelevance: 'low',
            kbEntities: ['Salicylic acid', 'Urea']
          }
        ]
      },
      {
        id: 'safety-monitoring',
        name: 'Safety & Monitoring',
        description: 'Adverse effects, labs, pregnancy/lactation, interactions',
        subtopics: [
          {
            id: 'adverse-effects',
            name: 'Adverse Effects',
            description: 'Common and serious adverse effects of therapies',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: []
          },
          {
            id: 'labs-monitoring',
            name: 'Labs & Monitoring',
            description: 'Baseline and ongoing laboratory monitoring',
            difficulty: 'intermediate',
            boardRelevance: 'high',
            kbEntities: []
          },
          {
            id: 'pregnancy-lactation',
            name: 'Pregnancy & Lactation',
            description: 'Teratogenicity and perinatal safety',
            difficulty: 'intermediate',
            boardRelevance: 'medium',
            kbEntities: []
          },
          {
            id: 'drug-interactions',
            name: 'Drug Interactions',
            description: 'CYP and transporter interactions, contraindications',
            difficulty: 'advanced',
            boardRelevance: 'medium',
            kbEntities: []
          }
        ]
      }
    ]
  }
];

// Flatten hierarchy for easy lookup
export const ALL_TOPICS: TopicHierarchy[] = DERMATOLOGY_CATEGORIES.flatMap(category =>
  category.topics.flatMap(topic =>
    topic.subtopics.map(subtopic => ({
      category: category.id,
      topic: topic.id,
      subtopic: subtopic.id,
      id: `${category.id}.${topic.id}.${subtopic.id}`,
      name: subtopic.name,
      description: subtopic.description,
      difficulty: subtopic.difficulty,
      boardRelevance: subtopic.boardRelevance,
      kbEntities: subtopic.kbEntities
    }))
  )
);

// Legacy compatibility - keep original TOPICS for existing functionality
export type Topic = { id: string; name: string };
export const TOPICS: Topic[] = [
  { id: 'psoriasis.plaque', name: 'Plaque Psoriasis' },
  { id: 'acne.vulgaris', name: 'Acne Vulgaris' },
  { id: 'tinea.corporis', name: 'Tinea Corporis' },
  // Map some high-value topics from new hierarchy
  { id: 'medical-dermatology.inflammatory-conditions.psoriasis', name: 'Psoriasis' },
  { id: 'medical-dermatology.inflammatory-conditions.eczema-dermatitis', name: 'Eczema & Dermatitis' },
  { id: 'medical-dermatology.infectious-diseases.bacterial-infections', name: 'Bacterial Infections' },
  { id: 'medical-dermatology.infectious-diseases.viral-infections', name: 'Viral Infections' },
  { id: 'medical-dermatology.infectious-diseases.fungal-infections', name: 'Fungal Infections' },
  { id: 'dermatopharmacology.systemic-agents.biologics', name: 'Biologics (Systemic)' },
  { id: 'dermatopharmacology.topical-therapies.steroids', name: 'Topical Corticosteroids' }
];

// Helper functions for topic management
export function getTopicByFullId(fullId: string): TopicHierarchy | undefined {
  return ALL_TOPICS.find(topic => topic.id === fullId);
}

export function getTopicsByCategory(categoryId: string): TopicHierarchy[] {
  return ALL_TOPICS.filter(topic => topic.category === categoryId);
}

export function getTopicsByBoardRelevance(relevance: 'high' | 'medium' | 'low'): TopicHierarchy[] {
  return ALL_TOPICS.filter(topic => topic.boardRelevance === relevance);
}

export function getTopicsByDifficulty(difficulty: 'basic' | 'intermediate' | 'advanced'): TopicHierarchy[] {
  return ALL_TOPICS.filter(topic => topic.difficulty === difficulty);
}

export function getKnowledgeBaseEntities(topicId: string): string[] {
  const topic = getTopicByFullId(topicId);
  return topic?.kbEntities || [];
}
