import { GoogleGenAI, Type } from "@google/genai";
import { AIWordAnalysis, WordItem } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeWordWithGemini = async (word: WordItem): Promise<AIWordAnalysis | null> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini analysis");
    return null;
  }

  try {
    const prompt = `
      Analyze the Russian word "${word.lemma}".
      Context/Meaning: ${word.translation}.
      Part of Speech: ${word.pos}.
      
      Please provide:
      1. The word with correct stress mark (acute accent U+0301).
      2. The IPA pronunciation.
      3. A simple example sentence in Russian using this word (and its translation).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            stressedLemma: { type: Type.STRING, description: "The word with stress mark" },
            ipa: { type: Type.STRING, description: "IPA pronunciation" },
            exampleSentence: { type: Type.STRING, description: "Example sentence in Russian" },
            exampleTranslation: { type: Type.STRING, description: "Translation of the example sentence" }
          },
          required: ["stressedLemma", "ipa", "exampleSentence", "exampleTranslation"]
        }
      }
    });

    const result = response.text;
    if (!result) return null;
    
    return JSON.parse(result) as AIWordAnalysis;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};