export interface QuestionBlueprint {
  id: string;
  leadIn: string;
  cognitiveTarget: 'diagnosis'|'management'|'mechanism'|'evaluation'|'pharm'|'epi'|'interpretation';
  requiredClues: string[];
  optionalClues?: string[];
  constraints: {
    optionsCount: 5;
    singleBestAnswer: true;
    difficulty: 'Basic'|'Intermediate'|'Advanced';
    bannedPhrases?: string[];
  };
  optionStrategy: 'homogeneous'|'mechanismDistractors'|'lookAlikes'|'frequencyDistractors';
  explanationOutline: string[];
  references?: string[];
  a11y?: { imageRequired?: boolean; altTextRequired?: boolean };
}
