import React, { useState, useEffect, useMemo } from 'react';
import { WordItem, ReviewStrategy, AIWordAnalysis } from '../types';
import { Volume2, Check, X, Eye, BookOpen, RefreshCw, Sparkles, Loader2, Brain, Activity } from 'lucide-react';
import { POS_LABELS, CONJUGATION_LABELS } from '../constants';
import { AudioVoice, speakRussian } from '../services/audioService';
import { analyzeWordWithGemini } from '../services/geminiService';

interface FlashcardModeProps {
  items: WordItem[];
  onExit: () => void;
  direction: 'ru-zh' | 'zh-ru';
  strategy: ReviewStrategy;
  limit: number | 'all';
  onResetFilter: () => void;
  selectedVoice: AudioVoice | null;
  learningThreshold?: number;
}

// LocalStorage Key
const STATS_KEY = 'ruvocab-progress';

interface WordStats {
  difficulty: 'easy' | 'hard';
  lastReviewed: number;
  streak: number; 
}

export const FlashcardMode: React.FC<FlashcardModeProps> = ({ 
  items, 
  onExit, 
  direction, 
  strategy,
  limit,
  onResetFilter,
  selectedVoice,
  learningThreshold = 30
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionItems, setSessionItems] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // AI Analysis State
  const [analysis, setAnalysis] = useState<AIWordAnalysis | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Helper to generate unique key based on direction
  const getStorageKey = (lemma: string) => `${direction}:${lemma}`;

  // Helper to read stats
  const getStats = () => {
    try {
      const statsStr = localStorage.getItem(STATS_KEY);
      return statsStr ? JSON.parse(statsStr) : {};
    } catch {
      return {};
    }
  };

  // Initialize Session Items
  useEffect(() => {
    setLoading(true);
    let candidateItems = [...items]; // Copy array
    const stats = getStats();

    // 1. Filter logic for 'hard_only'
    if (strategy === 'hard_only') {
      candidateItems = candidateItems.filter(item => {
        const key = getStorageKey(item.lemma);
        const stat = stats[key];
        return stat && (stat.difficulty === 'hard' || stat.streak === 0);
      });
      candidateItems.sort(() => Math.random() - 0.5);
    } 
    // 2. Sequential
    else if (strategy === 'sequential') {
      // keep order
    }
    // 3. Random
    else if (strategy === 'random') {
      candidateItems.sort(() => Math.random() - 0.5);
    }
    // 4. SMART SORT
    else if (strategy === 'smart_sort') {
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      // Workload Management
      let activeCount = 0;
      candidateItems.forEach(item => {
        const stat = stats[getStorageKey(item.lemma)];
        if (stat) {
          const isHard = stat.difficulty === 'hard' || stat.streak === 0;
          const isLearning = stat.streak > 0 && stat.streak < 3;
          if (isHard || isLearning) activeCount++;
        }
      });

      if (activeCount >= learningThreshold) {
        // Filter out new words if overloaded
        candidateItems = candidateItems.filter(item => !!stats[getStorageKey(item.lemma)]);
      }

      // Probabilistic Sorting
      candidateItems = candidateItems.map(item => {
        const stat = stats[getStorageKey(item.lemma)];
        let weight = 0;
        
        if (!stat) {
           weight = 40; 
        } else {
           const daysSince = (now - stat.lastReviewed) / ONE_DAY;
           if (stat.difficulty === 'hard' || stat.streak === 0) {
             weight = 100 + (daysSince * 20);
           } else if (stat.streak < 3) {
             weight = 60 + (daysSince * 10);
           } else {
             weight = 5 + (daysSince * 0.5);
           }
        }
        return { item, sortScore: weight * Math.random() };
      })
      .sort((a, b) => b.sortScore - a.sortScore)
      .map(wrapper => wrapper.item);
    }

    if (limit !== 'all') {
      candidateItems = candidateItems.slice(0, limit);
    }

    setSessionItems(candidateItems);
    setCurrentIndex(0);
    setIsFlipped(false);
    setLoading(false);
  }, [items, strategy, limit, direction, learningThreshold]); 

  // Reset state when index changes
  useEffect(() => {
    setIsFlipped(false);
    setAnalysis(null); // Reset AI analysis
    setLoadingAI(false);
  }, [currentIndex]);

  // Calculate current session stats for the dashboard
  const sessionStats = useMemo(() => {
    const stats = getStats();
    let counts = { new: 0, hard: 0, learning: 0, mastered: 0 };
    
    sessionItems.forEach(item => {
      const s = stats[getStorageKey(item.lemma)];
      if (!s) {
        counts.new++;
      } else if (s.difficulty === 'hard' || s.streak === 0) {
        counts.hard++;
      } else if (s.streak >= 3) {
        counts.mastered++;
      } else {
        counts.learning++;
      }
    });
    return counts;
  }, [sessionItems, currentIndex]); // Recalculate when items or index changes (as stats might update)

  const currentItem = sessionItems[currentIndex];

  const handleNext = (difficulty?: 'easy' | 'hard') => {
    if (difficulty && currentItem) {
      const stats = getStats();
      const key = getStorageKey(currentItem.lemma);
      const currentStat = stats[key];
      const currentStreak = currentStat?.streak || 0;

      const newStreak = difficulty === 'hard' ? 0 : currentStreak + 1;
      
      stats[key] = {
        difficulty,
        lastReviewed: Date.now(),
        streak: newStreak
      };
      
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    }

    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % sessionItems.length);
    }, 150);
  };

  const handlePlayAudio = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    speakRussian(text, selectedVoice);
  };

  const handleAIAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (analysis) return;
    setLoadingAI(true);
    const result = await analyzeWordWithGemini(currentItem);
    setAnalysis(result);
    setLoadingAI(false);
  };

  // --- Render Logic ---

  if (loading) return <div className="text-center p-10 text-slate-500">Preparing study session...</div>;

  if (sessionItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <Check size={32} />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">No items to review!</h3>
        <p className="text-slate-600 mb-8">
          {strategy === 'hard_only' 
            ? "No 'Hard' words found. Great job!" 
            : "No words match your criteria or workload limit."}
        </p>
        <div className="flex gap-4">
          <button onClick={onResetFilter} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <RefreshCw size={18} /> Study All
          </button>
          <button onClick={onExit} className="px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">
            Exit
          </button>
        </div>
      </div>
    );
  }

  const isFrontRussian = direction === 'ru-zh';
  const displayLemma = analysis ? analysis.stressedLemma : currentItem.lemma;

  // Render the "Rich" Russian details (used on Front if RU->ZH, or Back for full details)
  const renderRichRussianDetails = (showTranslation: boolean) => (
    <div className="flex flex-col items-center w-full px-4">
      {/* 1. Word Header */}
      <div className="relative mb-4 text-center">
         <span className={`inline-block mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${POS_LABELS[currentItem.pos].color}`}>
            {POS_LABELS[currentItem.pos].label}
         </span>
         <div className="flex items-center justify-center gap-2">
            <h2 className="text-4xl font-bold text-slate-900 font-cyrillic leading-tight break-words">
              {displayLemma}
            </h2>
            <button 
              onClick={(e) => handlePlayAudio(e, displayLemma)}
              className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-105 transition-all"
            >
              <Volume2 size={24} />
            </button>
         </div>
         {analysis?.ipa && <div className="text-slate-400 font-mono text-sm mt-1">[{analysis.ipa}]</div>}
      </div>

      {/* 2. Translation (If requested) */}
      {showTranslation && (
        <div className="mb-6 text-2xl text-slate-700 font-medium text-center border-t border-slate-100 pt-4 w-full">
          {currentItem.translation}
        </div>
      )}

      {/* 3. Grammar Tags */}
      <div className="flex flex-wrap gap-2 justify-center mb-4">
          {currentItem.grammar?.gender && (
            <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono border border-slate-200">
              {currentItem.grammar.gender}
            </span>
          )}
          {currentItem.grammar?.conjugation && (
             <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-100">
                {CONJUGATION_LABELS[currentItem.grammar.conjugation] || currentItem.grammar.conjugation}
             </span>
          )}
          {currentItem.forms && currentItem.forms.map((f, i) => (
            <span key={i} className="px-2 py-1 bg-slate-50 rounded text-xs font-cyrillic text-slate-600 border border-slate-200">
              {f}
            </span>
          ))}
      </div>

      {/* 4. Notes */}
      {currentItem.syntax_note && (
        <div className="flex items-center gap-2 text-amber-800 bg-amber-50 px-3 py-2 rounded-lg text-sm border border-amber-100 max-w-sm text-center mb-4">
          <BookOpen size={14} className="shrink-0" /> <span className="italic">{currentItem.syntax_note}</span>
        </div>
      )}

      {/* 5. AI Analysis Section */}
      <div className="w-full max-w-sm mt-2">
         {analysis ? (
            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 text-sm text-left animate-in fade-in duration-300">
              <p className="font-cyrillic text-indigo-900 mb-1"><strong>Ex:</strong> {analysis.exampleSentence}</p>
              <p className="text-indigo-600 italic text-xs">{analysis.exampleTranslation}</p>
            </div>
         ) : (
            <button 
              onClick={handleAIAnalysis}
              disabled={loadingAI}
              className="w-full py-2 flex items-center justify-center gap-2 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors"
            >
               {loadingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
               AI Analyze (Context & Examples)
            </button>
         )}
      </div>
    </div>
  );

  // --- Face Content Logic ---

  // Front Face Content
  const FrontFace = (
    <div className="flex flex-col items-center justify-center flex-1 w-full p-6">
       {isFrontRussian ? (
          // RU->ZH Front: Just the Russian word, clean
          <div className="text-center">
             <span className={`inline-block mb-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border opacity-50 ${POS_LABELS[currentItem.pos].color}`}>
                {POS_LABELS[currentItem.pos].label}
             </span>
             <h2 className="text-4xl font-bold text-slate-900 font-cyrillic mb-4">{currentItem.lemma}</h2>
             <button onClick={(e) => handlePlayAudio(e, currentItem.lemma)} className="mx-auto p-2 rounded-full bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                <Volume2 size={24} />
             </button>
          </div>
       ) : (
          // ZH->RU Front: Just the Chinese translation
          <div className="text-center">
             <h3 className="text-3xl font-bold text-slate-800">{currentItem.translation}</h3>
          </div>
       )}
       <div className="absolute bottom-4 text-slate-400 text-xs flex items-center gap-2">
          <Eye size={14} /> Tap to see details
       </div>
    </div>
  );

  // Back Face Content (Always Rich)
  const BackFace = (
    <div className="flex flex-col items-center justify-center flex-1 w-full py-6 overflow-y-auto">
      {/* We always render rich details on the back. 
          If RU->ZH, we need to show translation.
          If ZH->RU, we need to show translation (the prompt) as well contextually, or just the Russian word details?
          Usually Back = Answer. 
          RU->ZH Back = Chinese + Full Russian Info.
          ZH->RU Back = Russian (Answer) + Full Russian Info.
      */}
      {renderRichRussianDetails(true)} 
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-start min-h-[calc(100vh-140px)] p-4">
      
      {/* 1. Session Stats Dashboard (Replaces Counter) */}
      <div className="w-full flex justify-between items-center mb-6 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 px-2">
           <div className="flex items-center gap-1.5" title="New / Unseen in session">
             <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
             <span className="text-xs font-bold text-slate-600">{sessionStats.new}</span>
           </div>
           <div className="flex items-center gap-1.5" title="Learning (Streak < 3)">
             <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
             <span className="text-xs font-bold text-slate-600">{sessionStats.learning}</span>
           </div>
           <div className="flex items-center gap-1.5" title="Hard">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
             <span className="text-xs font-bold text-slate-600">{sessionStats.hard}</span>
           </div>
           <div className="flex items-center gap-1.5" title="Mastered">
             <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
             <span className="text-xs font-bold text-slate-600">{sessionStats.mastered}</span>
           </div>
        </div>
        <button onClick={onExit} className="text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-1 rounded-lg hover:bg-slate-100 transition-colors">
          Exit
        </button>
      </div>

      {/* 2. Main Card Area */}
      <div 
        className="relative w-full h-[480px] perspective-1000 group cursor-pointer"
        onClick={() => !loadingAI && setIsFlipped(!isFlipped)} // Prevent flip if clicking AI button bubbles up, handled by propagation stop but safe measure
      >
        <div className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front Face */}
          <div className="absolute w-full h-full backface-hidden bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center overflow-hidden">
             {FrontFace}
          </div>

          {/* Back Face */}
          <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white rounded-2xl shadow-lg border border-blue-200 flex flex-col items-center overflow-hidden">
             {/* Background tint for back side */}
             <div className="absolute inset-0 bg-slate-50/50 pointer-events-none" />
             <div className="relative z-10 w-full h-full flex flex-col items-center">
                {BackFace}
             </div>
          </div>
        </div>
      </div>

      {/* 3. Controls */}
      <div className="flex items-center gap-8 mt-6 w-full max-w-xs justify-center">
        <button 
          onClick={(e) => { e.stopPropagation(); handleNext('hard'); }}
          className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-red-500 transition-colors group flex-1"
        >
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm group-hover:border-red-200 group-hover:bg-red-50 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200">
            <X size={24} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide">Hard</span>
        </button>

        <button 
          onClick={(e) => { e.stopPropagation(); handleNext('easy'); }}
          className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-green-600 transition-colors group flex-1"
        >
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm group-hover:border-green-200 group-hover:bg-green-50 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200">
            <Check size={24} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide">Good</span>
        </button>
      </div>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
};