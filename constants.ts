import { Category, PartOfSpeech } from './types';

export const POS_LABELS: Record<PartOfSpeech, { label: string; color: string }> = {
  noun: { label: 'Noun', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  verb: { label: 'Verb', color: 'bg-red-100 text-red-800 border-red-200' },
  adj: { label: 'Adjective', color: 'bg-green-100 text-green-800 border-green-200' },
  adv: { label: 'Adverb', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  pron: { label: 'Pronoun', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  prep: { label: 'Preposition', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  num: { label: 'Number', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  other: { label: 'Other', color: 'bg-teal-100 text-teal-800 border-teal-200' },
};

// --- PASTE YOUR JSON DATA BELOW ---
export const INITIAL_DATA: Category[] = [
  {
    "category": "Time: Days, Months & Seasons",
    "items": [
      { "lemma": "понедельник", "translation": "星期一", "pos": "noun", "grammar": { "gender": "m" } },
      { "lemma": "вторник", "translation": "星期二", "pos": "noun", "grammar": { "gender": "m" } },
      { "lemma": "среда", "translation": "星期三", "pos": "noun", "grammar": { "gender": "f" } },
      { "lemma": "четверг", "translation": "星期四", "pos": "noun", "grammar": { "gender": "m" } },
      { "lemma": "пятница", "translation": "星期五", "pos": "noun", "grammar": { "gender": "f" } },
      { "lemma": "суббота", "translation": "星期六", "pos": "noun", "grammar": { "gender": "f" } },
      { "lemma": "воскресенье", "translation": "星期日", "pos": "noun", "grammar": { "gender": "n" } },
      { "lemma": "год", "translation": "年", "pos": "noun", "grammar": { "gender": "m" }, "syntax_note": "в этом году (this year)" },
      { "lemma": "месяц", "translation": "月", "pos": "noun", "grammar": { "gender": "m" } }
    ]
  },
  {
    "category": "Education & Study",
    "items": [
      { 
        "lemma": "учиться", 
        "translation": "学习 (intr.)", 
        "pos": "verb", 
        "forms": ["учусь", "учишься"], 
        "grammar": { "conjugation": "II", "reflexive": true }, 
        "syntax_note": "где? (at school/uni)" 
      },
      { 
        "lemma": "изучать", 
        "translation": "学习/研究 (tr.)", 
        "pos": "verb", 
        "forms": ["изучаю", "изучаешь"], 
        "grammar": { "conjugation": "I" }, 
        "syntax_note": "+ 4g (Accusative)" 
      },
      { "lemma": "университет", "translation": "大学", "pos": "noun", "grammar": { "gender": "m" } }
    ]
  },
  {
    "category": "Common Adjectives",
    "items": [
      { "lemma": "хороший", "translation": "好的", "pos": "adj", "grammar": { "gender": "m" } },
      { "lemma": "плохой", "translation": "坏的", "pos": "adj", "grammar": { "gender": "m" } },
      { "lemma": "большой", "translation": "大的", "pos": "adj", "grammar": { "gender": "m" } }
    ]
  },
  {
    "category": "Daily Phrases",
    "items": [
      { "lemma": "привет", "translation": "你好", "pos": "other" },
      { "lemma": "спасибо", "translation": "谢谢", "pos": "other" }
    ]
  }
];