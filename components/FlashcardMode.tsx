import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { WordItem, ReviewStrategy, AIWordAnalysis } from '../types';
import { Volume2, Check, X, Eye, BookOpen, RefreshCw, Sparkles, Loader2, Brain, Activity, Lock } from 'lucide-react';
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

type GroupType = 'new' | 'learning' | 'hard' | 'mastered';

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
  // --- State ---
  const [currentCard, setCurrentCard] = useState<WordItem | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Session Tracking
  const [reviewedCount, setReviewedCount] = useState(0);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [isWorkloadCapped, setIsWorkloadCapped] = useState(false);
  
  // Algorithm State for Hierarchical Scheduling
  const [tick, setTick] = useState(0); // Global clock for staleness
  const [groupLastPicked, setGroupLastPicked] = useState<Record<GroupType, number>>({
    new: 0,
    hard: 0,
    learning: 0,
    mastered: 0
  });

  // For Non-Smart Strategies (Static Queue)
  const [staticQueue, setStaticQueue] = useState<WordItem[]>([]);
  const [staticIndex, setStaticIndex] = useState(0);

  // AI Analysis State
  const [analysis, setAnalysis] = useState<AIWordAnalysis | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Helper: Get Storage Key
  const getStorageKey = useCallback((lemma: string) => `${direction}:${lemma}`, [direction]);

  // Helper: Get Stats
  const getStats = useCallback(() => {
    try {
      const statsStr = localStorage.getItem(STATS_KEY);
      return statsStr ? JSON.parse(statsStr) : {};
    } catch {
      return {};
    }
  }, []);

  // --- CORE: Hierarchical Group Scheduling (Smart Sort) ---
  const selectNextSmartCard = useCallback(() => {
    const stats = getStats();
    
    // 1. Bucketize Items
    const groups: Record<GroupType, WordItem[]> = {
      new: [],
      hard: [],
      learning: [],
      mastered: []
    };

    let activeLoadCount = 0;

    items.forEach(item => {
      const key = getStorageKey(item.lemma);
      const s = stats[key];

      if (!s) {
        groups.new.push(item);
      } else {
        const { streak, difficulty } = s;
        if (difficulty === 'hard' || streak === 0) {
          groups.hard.push(item);
          activeLoadCount++;
        } else if (streak < 3) {
          groups.learning.push(item);
          activeLoadCount++;
        } else {
          groups.mastered.push(item);
        }
      }
    });

    // 2. Check Load Cap
    const isCapped = activeLoadCount >= learningThreshold;
    setIsWorkloadCapped(isCapped);

    // 3. Define Base Weights
    // New: If capped 0, else 40
    // Hard: High priority (100)
    // Learning: Medium priority (60)
    // Mastered: Low priority (5)
    const baseWeights: Record<GroupType, number> = {
      new: isCapped ? 0 : 40,
      hard: 100,
      learning: 60,
      mastered: 5
    };

    // 4. Calculate Final Weights with Staleness Bonus
    // Formula: Base + (CurrentTick - LastPickedTick) * Bonus
    // This ensures if 'mastered' hasn't been picked for 100 ticks, it gets +200 weight
    const STALENESS_BONUS = 2; 
    const finalWeights: Record<string, number> = {};
    let totalWeight = 0;

    (Object.keys(groups) as GroupType[]).forEach(type => {
      if (groups[type].length === 0) {
        finalWeights[type] = 0;
        return;
      }

      // If New is strictly 0 (capped), it stays 0 regardless of staleness
      if (type === 'new' && isCapped) {
        finalWeights[type] = 0;
        return;
      }

      const staleness = tick - groupLastPicked[type];
      // Prevent negative staleness if tick reset
      const safeStaleness = Math.max(0, staleness); 
      
      finalWeights[type] = baseWeights[type] + (safeStaleness * STALENESS_BONUS);
      totalWeight += finalWeights[type];
    });

    // 5. Select Group (Weighted Random)
    if (totalWeight <= 0) {
       // Fallback: If everything is 0 (e.g., only new words exist but we are capped),
       // we might be in a deadlock. If so, return null to finish session.
       // OR, if we are capped but have no other cards, we MUST show something? 
       // Actually, if activeLoad > threshold, we have Hard/Learning cards. 
       // So totalWeight=0 implies No Hard, No Learning, No Mastered, AND New is locked?
       // That's impossible unless threshold is 0. 
       // Edge case: Only Mastered cards exist. Base weight 5 > 0.
       // Edge case: Only New cards exist. If capped, weight 0. Wait, if only New exist, activeLoad is 0, so not capped.
       return null;
    }

    let randomPointer = Math.random() * totalWeight;
    let selectedGroup: GroupType = 'new'; // default

    for (const type of ['hard', 'learning', 'new', 'mastered'] as GroupType[]) {
      const w = finalWeights[type];
      if (randomPointer < w) {
        selectedGroup = type;
        break;
      }
      randomPointer -= w;
    }

    // Update Staleness State for the chosen group
    // We do this via a return value or side effect outside render. 
    // Since this is called in event handler or effect, we can return the group type too.

    // 6. Select Item Within Group (Queue-like + Randomness)
    const candidates = groups[selectedGroup];
    
    // Sort logic: "Insert at back" means we want the ones with OLDEST lastReviewed (or None) at the front (index 0).
    // Sort Ascending by lastReviewed.
    candidates.sort((a, b) => {
      const timeA = stats[getStorageKey(a.lemma)]?.lastReviewed || 0;
      const timeB = stats[getStorageKey(b.lemma)]?.lastReviewed || 0;
      return timeA - timeB; // Oldest (smallest timestamp) first
    });

    // "Fixed sequence but with a bit of randomness"
    // We pick from the top N candidates (e.g., top 3 oldest items)
    const poolSize = Math.min(candidates.length, 3);
    const randomIndex = Math.floor(Math.random() * poolSize);
    
    return { item: candidates[randomIndex], group: selectedGroup };

  }, [items, getStats, getStorageKey, learningThreshold, tick, groupLastPicked]);


  // --- Initialization & Strategy Switching ---
  useEffect(() => {
    setLoading(true);
    setReviewedCount(0);
    setSessionFinished(false);
    setTick(0);
    setGroupLastPicked({ new: 0, hard: 0, learning: 0, mastered: 0 });

    if (strategy === 'smart_sort') {
      const result = selectNextSmartCard();
      if (result) {
        setCurrentCard(result.item);
        // Initial tick update not strictly needed for display, but helps logic consistency
        setGroupLastPicked(prev => ({ ...prev, [result.group]: 0 }));
      }
      setLoading(false);
    } else {
      // Static Generation for other modes
      const stats = getStats();
      let pool = [...items];
      
      if (strategy === 'hard_only') {
        pool = pool.filter(item => {
          const s = stats[getStorageKey(item.lemma)];
          return s && (s.difficulty === 'hard' || s.streak === 0);
        });
        pool.sort(() => Math.random() - 0.5);
      } else if (strategy === 'random') {
        pool.sort(() => Math.random() - 0.5);
      }
      // 'sequential' does nothing (keeps order)

      if (limit !== 'all') {
        pool = pool.slice(0, limit);
      }

      setStaticQueue(pool);
      setStaticIndex(0);
      setCurrentCard(pool[0] || null);
      setLoading(false);
    }
  }, [items, strategy, limit, direction, learningThreshold]); // Removed selectNextSmartCard from dep to avoid loop

  // --- Reset UI on card change ---
  useEffect(() => {
    setIsFlipped(false);
    setAnalysis(null);
    setLoadingAI(false);
  }, [currentCard]);


  // --- Interaction Handler ---
  const handleNext = (difficulty?: 'easy' | 'hard') => {
    if (!currentCard) return;

    // 1. Update Stats
    if (difficulty) {
      const stats = getStats();
      const key = getStorageKey(currentCard.lemma);
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

    // 2. Check Session Limit
    const newCount = reviewedCount + 1;
    setReviewedCount(newCount);
    
    if (limit !== 'all' && newCount >= limit) {
      setSessionFinished(true);
      return;
    }

    // 3. Select Next Card
    setIsFlipped(false);
    
    // Advance global tick
    const nextTick = tick + 1;
    setTick(nextTick);

    setTimeout(() => {
      if (strategy === 'smart_sort') {
        const result = selectNextSmartCard();
        if (result) {
          setCurrentCard(result.item);
          // Update the specific group's last picked tick
          setGroupLastPicked(prev => ({ ...prev, [result.group]: nextTick }));
        } else {
          setSessionFinished(true);
        }
      } else {
        // Static Next
        const nextIndex = staticIndex + 1;
        if (nextIndex < staticQueue.length) {
          setStaticIndex(nextIndex);
          setCurrentCard(staticQueue[nextIndex]);
        } else {
          setSessionFinished(true);
        }
      }
    }, 150);
  };

  // --- Helpers ---
  const handlePlayAudio = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    speakRussian(text, selectedVoice);
  };

  const handleAIAnalysis = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (analysis) return;
    setLoadingAI(true);
    const result = await analyzeWordWithGemini(currentCard!);
    setAnalysis(result);
    setLoadingAI(false);
  };

  // --- Dashboard Stats (Reactive) ---
  const scopeStats = useMemo(() => {
    const stats = getStats(); // Will run when 'tick' changes (via handleNext updates)
    let counts = { new: 0, hard: 0, learning: 0, mastered: 0 };
    
    items.forEach(item => {
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
  }, [items, tick, getStats, getStorageKey]);

  // --- RENDER ---

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[480px]">
      <Loader2 className="animate-spin text-slate-400 mb-2" size={32} />
      <span className="text-slate-500">Preparing session...</span>
    </div>
  );

  if (!currentCard || sessionFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] p-8 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
          <Check size={32} />
        </div>
        <h3 className="text-2xl font-bold text-slate-800 mb-2">Session Complete!</h3>
        <p className="text-slate-600 mb-6">
          You have reviewed {reviewedCount} cards.
          {isWorkloadCapped && strategy === 'smart_sort' && (
             <span className="block mt-2 text-yellow-600 text-sm bg-yellow-50 p-2 rounded border border-yellow-200">
               Note: New words are currently paused because you reached your active load limit ({learningThreshold}).
             </span>
          )}
        </p>
        <div className="flex gap-4">
          <button onClick={onResetFilter} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
            <RefreshCw size={18} /> Review All
          </button>
          <button onClick={onExit} className="px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors">
            Exit
          </button>
        </div>
      </div>
    );
  }

  const isFrontRussian = direction === 'ru-zh';
  const displayLemma = analysis ? analysis.stressedLemma : currentCard.lemma;

  // Render Rich Details (Common for Front/Back)
  const renderRichRussianDetails = (showTranslation: boolean) => (
    <div className="flex flex-col items-center w-full px-4">
      {/* 1. Word Header */}
      <div className="relative mb-4 text-center">
         <span className={`inline-block mb-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${POS_LABELS[currentCard!.pos].color}`}>
            {POS_LABELS[currentCard!.pos].label}
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

      {/* 2. Translation */}
      {showTranslation && (
        <div className="mb-6 text-2xl text-slate-700 font-medium text-center border-t border-slate-100 pt-4 w-full">
          {currentCard!.translation}
        </div>
      )}

      {/* 3. Grammar Tags */}
      <div className="flex flex-wrap gap-2 justify-center mb-4">
          {currentCard!.grammar?.gender && (
            <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-500 font-mono border border-slate-200">
              {currentCard!.grammar.gender}
            </span>
          )}
          {currentCard!.grammar?.conjugation && (
             <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-100">
                {CONJUGATION_LABELS[currentCard!.grammar.conjugation] || currentCard!.grammar.conjugation}
             </span>
          )}
          {currentCard!.forms && currentCard!.forms.map((f, i) => (
            <span key={i} className="px-2 py-1 bg-slate-50 rounded text-xs font-cyrillic text-slate-600 border border-slate-200">
              {f}
            </span>
          ))}
      </div>

      {/* 4. Notes */}
      {currentCard!.syntax_note && (
        <div className="flex items-center gap-2 text-amber-800 bg-amber-50 px-3 py-2 rounded-lg text-sm border border-amber-100 max-w-sm text-center mb-4">
          <BookOpen size={14} className="shrink-0" /> <span className="italic">{currentCard!.syntax_note}</span>
        </div>
      )}

      {/* 5. AI Analysis */}
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

  // Front Face
  const FrontFace = (
    <div className="flex flex-col items-center justify-center flex-1 w-full p-6">
       {isFrontRussian ? (
          <div className="text-center">
             <span className={`inline-block mb-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border opacity-50 ${POS_LABELS[currentCard!.pos].color}`}>
                {POS_LABELS[currentCard!.pos].label}
             </span>
             <h2 className="text-4xl font-bold text-slate-900 font-cyrillic mb-4">{currentCard!.lemma}</h2>
             <button onClick={(e) => handlePlayAudio(e, currentCard!.lemma)} className="mx-auto p-2 rounded-full bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors">
                <Volume2 size={24} />
             </button>
          </div>
       ) : (
          <div className="text-center">
             <h3 className="text-3xl font-bold text-slate-800">{currentCard!.translation}</h3>
          </div>
       )}
       <div className="absolute bottom-4 text-slate-400 text-xs flex items-center gap-2">
          <Eye size={14} /> Tap to see details
       </div>
    </div>
  );

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-start min-h-[calc(100vh-140px)] p-4">
      
      {/* 1. Dashboard */}
      <div className="w-full flex justify-between items-center mb-6 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4 px-2 overflow-x-auto no-scrollbar">
           {/* New */}
           <div className={`flex items-center gap-1.5 shrink-0 ${isWorkloadCapped && strategy === 'smart_sort' ? 'opacity-50 grayscale' : ''}`} title="New words available">
             <div className="w-2.5 h-2.5 rounded-full bg-slate-300"></div>
             <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-600 leading-none">{scopeStats.new}</span>
                {isWorkloadCapped && strategy === 'smart_sort' && <span className="text-[9px] text-slate-400">Locked</span>}
             </div>
           </div>

           {/* Learning */}
           <div className="flex items-center gap-1.5 shrink-0" title="Learning (Streak 1-2)">
             <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse"></div>
             <span className="text-xs font-bold text-slate-600">{scopeStats.learning}</span>
           </div>

           {/* Hard */}
           <div className="flex items-center gap-1.5 shrink-0" title="Hard / Reset">
             <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
             <span className="text-xs font-bold text-slate-600">{scopeStats.hard}</span>
           </div>

           {/* Mastered */}
           <div className="flex items-center gap-1.5 shrink-0" title="Mastered (Streak 3+)">
             <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
             <span className="text-xs font-bold text-slate-600">{scopeStats.mastered}</span>
           </div>
        </div>

        <div className="flex items-center gap-2">
           {limit !== 'all' && (
             <div className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">
               {reviewedCount} / {limit}
             </div>
           )}
           {strategy === 'smart_sort' && isWorkloadCapped && (
             <div className="text-[10px] font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">
               <Activity size={10} /> Max Load
             </div>
           )}
           <button onClick={onExit} className="text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0">
             Exit
           </button>
        </div>
      </div>

      {/* 2. Main Card Area */}
      <div 
        className="relative w-full h-[480px] perspective-1000 group cursor-pointer"
        onClick={() => !loadingAI && setIsFlipped(!isFlipped)} 
      >
        <div className={`relative w-full h-full duration-500 transform-style-3d transition-transform ${isFlipped ? 'rotate-y-180' : ''}`}>
          {/* Front Face */}
          <div className="absolute w-full h-full backface-hidden bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center overflow-hidden">
             {FrontFace}
          </div>

          {/* Back Face */}
          <div className="absolute w-full h-full backface-hidden rotate-y-180 bg-white rounded-2xl shadow-lg border border-blue-200 flex flex-col items-center overflow-hidden">
             <div className="absolute inset-0 bg-slate-50/50 pointer-events-none" />
             <div className="relative z-10 w-full h-full flex flex-col items-center">
                {renderRichRussianDetails(true)}
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
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
};
