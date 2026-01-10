
export type PartOfSpeech = 'noun' | 'verb' | 'adj' | 'adv' | 'pron' | 'prep' | 'num' | 'other';

export interface Grammar {
  gender?: 'm' | 'f' | 'n';
  conjugation?: '1' | '2' | 'mixed' | 'irregular' | string;
  reflexive?: boolean;
  plural_only?: boolean;
  special?: string;
}

export interface WordItem {
  lemma: string;
  translation: string;
  pos: PartOfSpeech;
  forms?: string[];
  grammar?: Grammar;
  syntax_note?: string;
}

export interface Category {
  category: string;
  items: WordItem[];
}

// Extended interface for AI analysis results
export interface AIWordAnalysis {
  stressedLemma: string;
  ipa: string;
  exampleSentence: string;
  exampleTranslation: string;
}

export type ReviewStrategy = 'random' | 'smart_sort' | 'hard_only' | 'sequential';
