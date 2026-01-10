import React, { useState, useEffect } from 'react';
import { WordItem, ReviewStrategy } from '../types';
import { Volume2, Check, X, Eye, BookOpen, RefreshCw } from 'lucide-react';
import { POS_LABELS } from '../constants';

interface FlashcardModeProps {
  items: WordItem[];
  onExit: () => void;
  direction: 'ru-zh' | 'zh-ru';
  strategy: ReviewStrategy;
  limit: number | 'all';
  onResetFilter: () => void;
}

// LocalStorage Key
const STATS_KEY = 'ruvocab-progress';

interface WordStats {
  difficulty: 'easy' | 'hard';
  lastReviewed: number;
  streak: number; // Added streak for repetition logic
}

export const FlashcardMode: React.FC<FlashcardModeProps> = ({ 
  items, 
  onExit, 
  direction, 
  strategy,
  limit,
  onResetFilter 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionItems, setSessionItems] = useState<WordItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to generate unique key based on direction
  const getStorageKey = (lemma: string) => `${direction}:${lemma}`;

  // Initialize Session Items
  useEffect(() => {
    setLoading(true);
    let candidateItems = [...items]; // Copy array
    const statsStr = localStorage.getItem(STATS_KEY);
    const stats: Record<string, WordStats> = statsStr ? JSON.parse(statsStr) : {};

    // 1. PRE-SHUFFLE for Smart/Random/Hard modes
    // This solves the problem where "New" words appear in logical order (Jan, Feb, Mar)
    // allowing users to guess context. We shuffle BEFORE scoring.
    if (strategy !== 'sequential') {
      candidateItems.sort(() => Math.random() - 0.5);
    }

    // 2. Filter logic for 'hard_only'
    if (strategy === 'hard_only') {
      candidateItems = candidateItems.filter(item => {
        const key = getStorageKey(item.lemma);
        const stat = stats[key];
        // Hard is defined as explicit 'hard' OR streak reset to 0 after being seen
        return stat && (stat.difficulty === 'hard' || stat.streak === 0);
      });
    }

    // 3. Sort logic
    if (strategy === 'smart_sort') {
      // Smart Cram Mode Logic with Streak
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      candidateItems.sort((a, b) => {
        const keyA = getStorageKey(a.lemma);
        const keyB = getStorageKey(b.lemma);
        const statA = stats[keyA];
        const statB = stats[keyB];
        
        const getScore = (stat?: WordStats) => {
          // Score components:
          // 1. New words (No stat): Priority High (but below active Hard) -> Score 500
          // 2. Hard words (Streak 0): Priority Highest -> Score 1000+
          // 3. Learning words (Streak 1-2): Priority Medium (Spaced Repetition) -> Score 700
          // 4. Mastered words (Streak 3+): Priority Low -> Score 0-100 (based on time)

          if (!stat) return 500; 

          // Hard / Reset words
          if (stat.difficulty === 'hard' || stat.streak === 0) {
             return 1000 + (now - stat.lastReviewed) / ONE_DAY;
          }

          // Learning Phase (Streak 1 or 2)
          // We want to verify these again relatively soon to build the streak
          if (stat.streak < 3) {
             return 700 + (now - stat.lastReviewed) / ONE_DAY;
          }
          
          // Mastered Phase (Streak 3+)
          // Push to back, sort by time since last review
          const daysSince = (now - stat.lastReviewed) / ONE_DAY;
          return daysSince; 
        };

        return getScore(statB) - getScore(statA);
      });
    }

    // 4. Limit logic
    if (limit !== 'all') {
      candidateItems = candidateItems.slice(0, limit);
    }

    setSessionItems(candidateItems);
    setCurrentIndex(0);
    setIsFlipped(false);
    setLoading(false);
  }, [items, strategy, limit, direction]); 

  // Reset flip state when index changes
  useEffect(() => {
    setIsFlipped(false);
  }, [currentIndex]);

  const currentItem = sessionItems[currentIndex];

  const handleNext = (difficulty?: 'easy' | 'hard') => {
    if (difficulty && currentItem) {
      // Save stats to localStorage with Direction Prefix
      const statsStr = localStorage.getItem(STATS_KEY);
      const stats: Record<string, WordStats> = statsStr ? JSON.parse(statsStr) : {};
      
      const key = getStorageKey(currentItem.lemma);
      const currentStat = stats[key];
      const currentStreak = currentStat?.streak || 0;

      // Logic: 
      // Hard -> Reset streak to 0
      // Easy -> Increment streak
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

  const playAudio = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 0.8;
    window.speechSynthesis.speak(utterance);
  };

  // --- Render States ---

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
            ? `You don't have any words marked as 'Hard' for ${direction === 'ru-zh' ? 'Russian -> Chinese' : 'Chinese -> Russian'}. Great job!` 
            : "No words match your criteria."}
        </p>
        <div className="flex gap-4">
          <button 
             onClick={onResetFilter}
             className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={18} />
            Study All Words
          </button>
          <button onClick={onExit} className="px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">
            Exit
          </button>
        </div>
      </div>
    );
  }

  // Helper to render content based on direction
  const isFrontRussian = direction === 'ru-zh';
  
  const RussianContent = (
    <>
      <div className="absolute top-6 left-6 right-6 flex justify-end">
        <span className={`px-2 py-1 rounded-md text-xs font-bold border ${POS_LABELS[currentItem.pos].color}`}>
          {POS_LABELS[currentItem.pos].label}
        </span>
      </div>
      
      <div className="flex flex-col items-center justify-center flex-1 w-full">
        <h2 className="text-4xl font-bold text-slate-900 font-cyrillic text-center leading-tight break-words px-4">
          {currentItem.lemma}
        </h2>
        
        <button 
          onClick={(e) => { e.stopPropagation(); playAudio(currentItem.lemma); }}
          className="mt-4 p-2.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-all shadow-sm"
          title="Play Audio"
        >
          <Volume2 size={24} />
        </button>
      </div>

      {!isFrontRussian && (
         <div className="mb-6 w-full px-6">
            {currentItem.forms && (
                <div className="flex flex-wrap gap-2 justify-center mb-3">
                  {currentItem.forms.map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-100 rounded-md text-xs font-cyrillic text-slate-600 border border-slate-200">
                      {f}
                    </span>
                  ))}
                </div>
            )}
            {currentItem.syntax_note && (
              <div className="flex items-center justify-center gap-2 text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg text-sm border border-amber-100 w-full text-center">
                <BookOpen size={14} className="shrink-0" /> <span className="italic">{currentItem.syntax_note}</span>
              </div>
            )}
         </div>
      )}
    </>
  );

  const ChineseContent = (
    <>
      {!isFrontRussian && (
        <div className="absolute top-6 left-6 right-6 flex justify-end">
          <span className={`px-2 py-1 rounded-md text-xs font-bold border ${POS_LABELS[currentItem.pos].color}`}>
            {POS_LABELS[currentItem.pos].label}
          </span>
        </div>
      )}
      <div className="flex flex-col items-center justify-center flex-1 w-full p-4">
        <h3 className="text-3xl font-bold text-slate-800 text-center leading-relaxed break-words">
          {currentItem.translation}
        </h3>
        
        {isFrontRussian && currentItem.syntax_note && (
          <div className="mt-4 px-4 py-2 bg-slate-50 rounded-lg border border-slate-200 text-slate-600 text-sm italic max-w-sm text-center">
            Note: {currentItem.syntax_note}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-start min-h-[calc(100vh-140px)] p-4">
      
      {/* Header Info */}
      <div className="w-full flex justify-between items-center mb-4 text-slate-500 font-medium">
        <span className="bg-white px-3 py-1 rounded-full border border-slate-200 text-xs shadow-sm">
          Card {currentIndex + 1} / {sessionItems.length}
        </span>
        <button onClick={onExit} className="hover:text-slate-800 hover:bg-white px-3 py-1 text-sm rounded-full transition-all">
          Exit Review
        </button>
      </div>

      {/* Main Card Area */}
      <div 
        className="relative w-full h-[400px] perspective-1000 group cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front Face */}
          <div className="absolute w-full h-full backface-hidden bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center justify-between overflow-hidden">
             {isFrontRussian ? RussianContent : ChineseContent}
             <div className="w-full py-2.5 bg-slate-50 border-t border-slate-100 text-slate-400 text-xs flex items-center justify-center gap-2">
               <Eye size={14} /> Tap card to flip
             </div>
          </div>

          {/* Back Face */}
          <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white rounded-2xl shadow-lg border border-blue-100 flex flex-col items-center justify-between overflow-hidden">
             <div className="absolute inset-0 bg-blue-50/30 pointer-events-none" />
             <div className="relative z-10 w-full h-full flex flex-col items-center">
               {isFrontRussian ? ChineseContent : RussianContent}
             </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-8 mt-6 w-full max-w-xs justify-center">
        <button 
          onClick={(e) => { e.stopPropagation(); handleNext('hard'); }}
          className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-red-500 transition-colors group flex-1"
        >
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm group-hover:border-red-200 group-hover:bg-red-50 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200">
            <X size={24} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide">Hard / Forgot</span>
        </button>

        <button 
          onClick={(e) => { e.stopPropagation(); handleNext('easy'); }}
          className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-green-600 transition-colors group flex-1"
        >
          <div className="w-12 h-12 rounded-xl bg-white border-2 border-slate-200 flex items-center justify-center shadow-sm group-hover:border-green-200 group-hover:bg-green-50 group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-200">
            <Check size={24} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wide">Got it</span>
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