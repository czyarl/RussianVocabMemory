import React, { useState } from 'react';
import { Volume2, Sparkles, BookOpen, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { WordItem, AIWordAnalysis } from '../types';
import { POS_LABELS } from '../constants';
import { analyzeWordWithGemini } from '../services/geminiService';

interface WordCardProps {
  item: WordItem;
  layout?: 'grid' | 'list';
}

export const WordCard: React.FC<WordCardProps> = ({ item, layout = 'grid' }) => {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AIWordAnalysis | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const playAudio = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ru-RU';
      utterance.rate = 0.8; // Slightly slower for learners
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAIAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (analysis) return; // Already fetched
    setLoadingAI(true);
    const result = await analyzeWordWithGemini(item);
    setAnalysis(result);
    setLoadingAI(false);
    setExpanded(true); // Auto expand to show results
  };

  const toggleExpand = () => setExpanded(!expanded);

  const displayLemma = analysis ? analysis.stressedLemma : item.lemma;

  return (
    <div 
      className={`bg-white rounded-xl shadow-sm border border-slate-200 transition-all hover:shadow-md ${
        layout === 'list' ? 'flex flex-col md:flex-row md:items-center p-4 gap-4' : 'flex flex-col p-5'
      }`}
    >
      {/* Header Section */}
      <div className={`flex-1 ${layout === 'list' ? 'md:w-1/3' : ''}`}>
        <div className="flex justify-between items-start mb-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${POS_LABELS[item.pos].color}`}>
            {POS_LABELS[item.pos].label}
          </span>
          {item.grammar?.gender && (
            <span className="text-xs text-slate-500 font-mono border border-slate-200 px-1.5 py-0.5 rounded ml-2">
              {item.grammar.gender}
            </span>
          )}
        </div>
        
        <div className="flex items-baseline gap-2">
          <h3 
            className="text-2xl font-bold text-slate-900 font-cyrillic cursor-pointer hover:text-blue-700 transition-colors"
            onClick={() => playAudio(displayLemma)}
          >
            {displayLemma}
          </h3>
          <button 
            onClick={(e) => { e.stopPropagation(); playAudio(displayLemma); }}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"
            title="Listen"
          >
            <Volume2 size={18} />
          </button>
        </div>
        
        {analysis?.ipa && (
          <p className="text-sm text-slate-400 font-mono mt-1">[{analysis.ipa}]</p>
        )}
        
        <p className="text-lg text-slate-700 mt-2 font-medium">{item.translation}</p>
      </div>

      {/* Details Section */}
      <div className={`flex-1 ${layout === 'list' ? 'md:w-1/3 md:border-l md:border-slate-100 md:pl-4' : 'mt-4 border-t border-slate-100 pt-3'}`}>
        {(item.forms || item.syntax_note || item.grammar?.special) && (
          <div className="space-y-2 text-sm">
            {item.forms && (
              <div className="flex flex-wrap gap-1">
                {item.forms.map((form, idx) => (
                  <span key={idx} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs font-cyrillic">
                    {form}
                  </span>
                ))}
              </div>
            )}
            
            {item.grammar?.conjugation && (
               <div className="text-xs text-slate-500">
                 Conjugation: <span className="font-semibold">{item.grammar.conjugation}</span>
                 {item.grammar.reflexive && <span className="ml-2 italic">(reflexive)</span>}
               </div>
            )}

            {item.syntax_note && (
              <div className="flex items-start gap-1.5 text-amber-700 bg-amber-50 p-2 rounded-md border border-amber-100">
                <BookOpen size={14} className="mt-0.5 shrink-0" />
                <span className="italic">{item.syntax_note}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions / Expansion */}
      <div className={`flex flex-col justify-end ${layout === 'list' ? 'md:w-auto md:items-end' : 'mt-4 pt-2'}`}>
         {/* AI Analysis Result */}
         {expanded && analysis && (
            <div className="mb-4 bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-sm">
              <p className="font-cyrillic text-indigo-900 mb-1">{analysis.exampleSentence}</p>
              <p className="text-indigo-600 italic">{analysis.exampleTranslation}</p>
            </div>
         )}

         <div className="flex gap-2 w-full md:w-auto">
           <button 
              onClick={handleAIAnalysis}
              disabled={loadingAI}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                analysis 
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-200' 
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}
           >
             {loadingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
             {analysis ? 'Analyzed' : 'AI Analyze'}
           </button>
           
           {(layout === 'grid' || analysis) && (
             <button 
                onClick={toggleExpand}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
             >
               {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
             </button>
           )}
         </div>
      </div>
    </div>
  );
};