import type { QuestionBlueprint } from '../../types/questionBlueprint';

export const BLUEPRINTS: QuestionBlueprint[] = [
  {
    id: 'dx_image_based_basic',
    leadIn: 'Which of the following is the most likely diagnosis?',
    cognitiveTarget: 'diagnosis',
    requiredClues: ['patient demographics', 'morphology', 'distribution'],
    optionalClues: ['dermoscopy', 'image features'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Basic', bannedPhrases: ['always', 'never', 'except', 'all of the above', 'none of the above'] },
    optionStrategy: 'lookAlikes',
    explanationOutline: [
      'Key clinical features supporting the correct diagnosis',
      'How distractor 1 differs clinically/histologically',
      'How distractor 2 differs clinically/histologically',
      'How distractor 3 differs clinically/histologically',
      'How distractor 4 differs clinically/histologically'
    ],
    a11y: { imageRequired: true, altTextRequired: true }
  },
  {
    id: 'dx_histo_correlation_intermediate',
    leadIn: 'Which histopathologic pattern is most consistent with these biopsy findings?',
    cognitiveTarget: 'diagnosis',
    requiredClues: ['biopsy findings', 'clinical correlation'],
    optionalClues: ['immunostains'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Intermediate', bannedPhrases: ['always', 'never', 'except'] },
    optionStrategy: 'lookAlikes',
    explanationOutline: [
      'Correlate histo findings with clinical picture',
      'Why each distractor is not supported histologically'
    ]
  },
  {
    id: 'management_initial_step_basic',
    leadIn: 'Which of the following is the most appropriate initial step in management?',
    cognitiveTarget: 'management',
    requiredClues: ['chief complaint', 'duration', 'exam findings'],
    optionalClues: ['labs/imaging'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Basic', bannedPhrases: ['always', 'never', 'except'] },
    optionStrategy: 'homogeneous',
    explanationOutline: [
      'First-line guideline-based therapy rationale',
      'Why alternatives are less appropriate at this step'
    ]
  },
  {
    id: 'management_next_step_intermediate',
    leadIn: 'Which of the following is the most appropriate next step in therapy?',
    cognitiveTarget: 'management',
    requiredClues: ['prior treatments', 'response', 'current severity'],
    optionalClues: ['comorbidities', 'pregnancy status'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Intermediate' },
    optionStrategy: 'homogeneous',
    explanationOutline: [
      'Step-up logic and safety considerations',
      'Why each alternative is inferior/contraindicated now'
    ]
  },
  {
    id: 'pharm_mechanism_intermediate',
    leadIn: "This medication's therapeutic effect is achieved by which mechanism of action?",
    cognitiveTarget: 'pharm',
    requiredClues: ['drug class', 'indication', 'common adverse effects'],
    optionalClues: ['monitoring requirements'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Intermediate' },
    optionStrategy: 'mechanismDistractors',
    explanationOutline: [
      'Mechanism-pathway link for the correct agent',
      'Mechanisms of distractors and why not applicable'
    ]
  },
  {
    id: 'diagnostic_evaluation_confirm',
    leadIn: 'Which laboratory test would be most useful to confirm the diagnosis?',
    cognitiveTarget: 'evaluation',
    requiredClues: ['key clinical features', 'differential narrowed'],
    optionalClues: ['initial screening results'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Intermediate' },
    optionStrategy: 'homogeneous',
    explanationOutline: [
      'Why the chosen test confirms the suspected condition',
      'Limitations/false positives for alternatives'
    ]
  },
  {
    id: 'mechanism_pathophys_advanced',
    leadIn: 'This patient’s condition is most likely caused by which mechanism?',
    cognitiveTarget: 'mechanism',
    requiredClues: ['salient pathophysiologic clues', 'temporal pattern'],
    optionalClues: ['genetic associations'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Advanced' },
    optionStrategy: 'mechanismDistractors',
    explanationOutline: [
      'Mechanism and linkage to presented findings',
      'Why alternate mechanisms do not fit'
    ]
  },
  {
    id: 'epi_prevention_basic',
    leadIn: 'Which preventive strategy is most appropriate for this patient?',
    cognitiveTarget: 'epi',
    requiredClues: ['risk factors', 'exposures', 'outcome of interest'],
    optionalClues: ['screening context'],
    constraints: { optionsCount: 5, singleBestAnswer: true, difficulty: 'Basic' },
    optionStrategy: 'homogeneous',
    explanationOutline: [
      'Evidence-based prevention rationale',
      'Why alternatives are not indicated'
    ]
  }
];
