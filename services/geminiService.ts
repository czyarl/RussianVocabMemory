import { GoogleGenAI, Type } from "@google/genai";
import { AIWordAnalysis, WordItem } from '../types';

export const analyzeWordWithGemini = async (word: WordItem): Promise<AIWordAnalysis | null> => {
  // 1. Try Gemini First
  if (process.env.API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
  } 
  
  // 2. Fallback to OpenAI if OPENAI_API_KEY is present
  else if (process.env.OPENAI_API_KEY) {
    try {
       const prompt = `
        Analyze the Russian word "${word.lemma}".
        Context/Meaning: ${word.translation}.
        Part of Speech: ${word.pos}.
        
        Return a JSON object with:
        - stressedLemma: The word with correct stress mark (acute accent U+0301).
        - ipa: The IPA pronunciation.
        - exampleSentence: A simple example sentence in Russian.
        - exampleTranslation: Translation of the example sentence.
      `;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini", // Use a lightweight model
          messages: [
            { role: "system", content: "You are a helpful Russian language tutor. Output valid JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) return null;
      return JSON.parse(content) as AIWordAnalysis;

    } catch (error) {
       console.error("OpenAI Analysis Error:", error);
       return null;
    }
  }

  else {
    console.warn("No API Key found (Gemini or OpenAI) for analysis");
    return null;
  }
};