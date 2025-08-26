# 📚 PrecisionLearnDerm Taxonomy System

**Last Updated**: 2025-08-15  
**Version**: 2025.08

---

## Overview

The PrecisionLearnDerm taxonomy system provides a hierarchical organization of dermatology topics to ensure comprehensive coverage of all subject areas in question generation and learning paths.

## Taxonomy Structure

### Hierarchy Levels:
1. **Categories** - Top-level domains (e.g., Medical Dermatology, Surgical Dermatology)
2. **Topics** - Specific conditions or areas within categories
3. **Subtopics** - Detailed aspects of each topic (e.g., Diagnosis, Treatment, Histopathology)

---

## Complete Taxonomy

### 1. BASIC SCIENCE
```
├── Skin Biology
│   ├── Structure & Function
│   └── Barrier & Physiology
└── Immunology
    ├── Innate Immunity
    └── Adaptive Immunity
```

### 2. EPIDEMIOLOGY AND STATISTICS
```
├── Study Design
│   ├── Design Types
│   └── Bias & Confounding
└── Diagnostic Tests
    ├── Sensitivity/Specificity
    └── Likelihood Ratios
```

### 3. MEDICAL DERMATOLOGY
```
├── Psoriasis
│   ├── Diagnosis
│   ├── Treatment
│   ├── Physical Exam
│   └── Histopathology
│   Aliases: ["Psoriatic disease"]
│   KB Anchors: ["Psoriasis"]
│
├── Urticaria
│   ├── Diagnosis
│   ├── Treatment
│   ├── Physical Exam
│   └── Pathophysiology
│   Aliases: ["Hives", "Chronic spontaneous urticaria"]
│   KB Anchors: ["Urticaria"]
│
├── Eczema/Atopic Dermatitis
│   ├── Types
│   ├── Triggers
│   ├── Management
│   └── Complications
│
├── Acne
│   ├── Pathophysiology
│   ├── Classification
│   ├── Treatment
│   └── Scarring
│
├── Rosacea
│   ├── Subtypes
│   ├── Triggers
│   ├── Treatment
│   └── Differential Diagnosis
│
├── Vitiligo
│   ├── Pathogenesis
│   ├── Classification
│   ├── Treatment
│   └── Prognosis
│
├── Melanoma
│   ├── Risk Factors
│   ├── Diagnosis
│   ├── Staging
│   └── Treatment
│
└── Other Skin Cancers
    ├── Basal Cell Carcinoma
    ├── Squamous Cell Carcinoma
    └── Rare Tumors
```

### 4. PEDIATRIC DERMATOLOGY
```
└── Genodermatoses
    ├── Overview
    └── Management
```

### 5. SURGICAL DERMATOLOGY
```
└── Mohs Surgery
    ├── Indications
    └── Technique
```

### 6. INFECTIOUS DISEASES
```
├── Fungal Infections
│   ├── Superficial Mycoses
│   ├── Deep Mycoses
│   ├── Systemic Mycoses
│   └── Treatment
│
├── Bacterial Infections
│   ├── Pyodermas
│   ├── Cellulitis
│   ├── Necrotizing Infections
│   └── Treatment
│
└── Viral Infections
    ├── HSV (Herpes Simplex)
    ├── VZV (Varicella-Zoster)
    ├── HPV (Human Papillomavirus)
    └── Molluscum Contagiosum
```

---

## Coverage Analysis

### Current Coverage Status

| Category | Topics | Subtopics | Question Coverage | Status |
|----------|--------|-----------|------------------|--------|
| **Medical Dermatology** | 8 | 32 | High | ✅ Well covered |
| **Infectious Diseases** | 3 | 11 | Medium | ⚠️ Needs expansion |
| **Basic Science** | 2 | 4 | Low | ❌ Underrepresented |
| **Surgical Dermatology** | 1 | 2 | Low | ❌ Needs content |
| **Pediatric Dermatology** | 1 | 2 | Low | ❌ Limited coverage |
| **Epidemiology** | 2 | 4 | Low | ❌ Minimal questions |

### Topic-Subtopic Coverage Matrix

#### High Coverage Topics (20+ questions per subtopic):
- ✅ Psoriasis (all subtopics)
- ✅ Melanoma (diagnosis, treatment)
- ✅ Eczema (management)

#### Medium Coverage Topics (10-20 questions per subtopic):
- ⚠️ Acne (treatment)
- ⚠️ Rosacea (subtypes)
- ⚠️ Fungal infections (superficial)

#### Low Coverage Topics (<10 questions per subtopic):
- ❌ Basic Science topics
- ❌ Surgical procedures
- ❌ Pediatric conditions
- ❌ Statistical concepts

---

## Integration with Question Generation

### How Taxonomy Guides Generation:

1. **Topic Selection**
   - Questions are tagged with topic IDs (e.g., "MED.PSOR" for Psoriasis)
   - Subtopic IDs ensure coverage of all aspects (e.g., "MED.PSOR.TX" for treatment)

2. **Knowledge Base Anchoring**
   - KB anchors link topics to knowledge base entities
   - Aliases ensure questions are found under different search terms

3. **Balanced Generation**
   - System tracks questions per topic/subtopic pair
   - Identifies gaps in coverage
   - Prioritizes underrepresented areas

### Current Implementation:

```typescript
// Example from question generation
const topicIds = ["psoriasis"]; // Maps to MED.PSOR
const subtopics = ["diagnosis", "treatment"]; // Maps to MED.PSOR.DX, MED.PSOR.TX

// Generation ensures coverage
generateQuestionForTopic(topicId, subtopicId) {
  // Checks existing coverage
  // Prioritizes gaps
  // Generates targeted question
}
```

---

## Gap Analysis & Recommendations

### Critical Gaps to Address:

1. **Basic Science Foundation**
   - Need questions on skin anatomy
   - Immunology concepts underrepresented
   - Barrier function questions missing

2. **Surgical Topics**
   - Mohs surgery techniques
   - Excision procedures
   - Reconstruction methods

3. **Pediatric Dermatology**
   - Congenital conditions
   - Childhood eruptions
   - Genetic disorders

4. **Statistical Concepts**
   - Study interpretation
   - Test characteristics
   - Evidence-based medicine

### Recommended Actions:

1. **Immediate (Week 1)**
   - Generate 50 questions for Basic Science topics
   - Add 30 questions for common surgical procedures
   - Create 20 questions on statistical concepts

2. **Short-term (Month 1)**
   - Achieve minimum 10 questions per subtopic
   - Balance coverage across all categories
   - Add image-based questions for visual topics

3. **Long-term (Quarter 1)**
   - Complete coverage of all taxonomy nodes
   - Minimum 20 questions per subtopic
   - Add case-based scenarios for each topic

---

## Tracking & Monitoring

### Metrics to Track:

```javascript
{
  "coverage_metrics": {
    "total_topics": 20,
    "topics_with_questions": 12,
    "coverage_percentage": 60,
    "questions_per_topic": {
      "psoriasis": 45,
      "melanoma": 38,
      "eczema": 25,
      // ... etc
    },
    "gaps": [
      "BASIC.BIO.STRUCT",
      "SURG.MOHS.TECHNIQUE",
      "PEDS.GENODERM.OVERVIEW"
    ]
  }
}
```

### Dashboard Requirements:

1. **Coverage Heatmap** - Visual representation of question density
2. **Gap Identifier** - Automatic detection of underserved topics
3. **Generation Prioritizer** - Queue for targeted question creation
4. **Quality by Topic** - Track question quality per taxonomy node

---

## API Integration

### Endpoints for Taxonomy Management:

```typescript
// Get taxonomy structure
GET /api/taxonomy/structure

// Get coverage statistics
GET /api/taxonomy/coverage

// Get gaps analysis
GET /api/taxonomy/gaps

// Generate questions for specific topic/subtopic
POST /api/questions/generate-targeted
{
  "topicId": "MED.PSOR",
  "subtopicId": "MED.PSOR.TX",
  "count": 5,
  "difficulty": 0.5
}
```

---

## Future Enhancements

1. **Dynamic Taxonomy Updates**
   - Add new topics as dermatology evolves
   - Incorporate emerging treatments
   - Update based on board exam changes

2. **AI-Driven Coverage**
   - Automatic gap detection
   - Smart question distribution
   - Adaptive generation based on usage

3. **Personalized Learning Paths**
   - Track individual topic mastery
   - Recommend questions based on gaps
   - Create custom study plans

4. **Cross-Topic Integration**
   - Questions spanning multiple topics
   - Differential diagnosis scenarios
   - Comprehensive case studies

---

## Conclusion

The taxonomy system is fundamental to ensuring comprehensive coverage of dermatology topics. Current implementation shows good coverage in core medical dermatology topics but significant gaps in basic science, surgical, and pediatric areas. Systematic generation targeting these gaps will ensure complete board exam preparation coverage.
