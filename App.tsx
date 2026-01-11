import React, { useState, useMemo, useEffect } from 'react';
import { INITIAL_DATA, POS_LABELS } from './constants';
import { WordCard } from './components/WordCard';
import { FlashcardMode } from './components/FlashcardMode';
import { Search, Layers, Book, Grid, List, Zap, Filter, Settings, Brain, ArrowRightLeft, ListFilter, Shuffle, SortAsc, PieChart, Trash2, Volume2, Activity, Check } from 'lucide-react';
import { PartOfSpeech, ReviewStrategy } from './types';
import { getBrowserVoices, AudioVoice, GOOGLE_VOICE_URI } from './services/audioService';

const STATS_KEY = 'ruvocab-progress';
const MISTAKES_CATEGORY = "⚡ Exam Cram (Mistakes)";

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedPos, setSelectedPos] = useState<PartOfSpeech | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [viewMode, setViewMode] = useState<'browse' | 'flashcard'>('browse');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Forces stats recalculation

  // Store full stats data for filtering
  const [statsData, setStatsData] = useState<Record<string, any>>({});

  // --- Audio Settings ---
  const [voices, setVoices] = useState<AudioVoice[]>([]);
  // Default to Google Online as it's usually best quality, fall back to whatever is first later
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(GOOGLE_VOICE_URI);

  // Load voices on mount and when changed
  useEffect(() => {
    const loadVoices = () => {
      const browserVoices = getBrowserVoices();
      const googleOption: AudioVoice = {
        name: 'Google Translate (Online)',
        voiceURI: GOOGLE_VOICE_URI,
        lang: 'ru-RU',
        localService: false
      };
      
      // Combine online option with detected browser voices
      setVoices([googleOption, ...browserVoices]);
    };

    loadVoices();
    
    // Chrome requires this event listener
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Find the actual voice object based on the selected URI
  const currentVoiceObject = useMemo(() => {
    return voices.find(v => v.voiceURI === selectedVoiceURI) || voices[0] || null;
  }, [voices, selectedVoiceURI]);

  // Study Settings
  const [studyDirection, setStudyDirection] = useState<'ru-zh' | 'zh-ru'>('ru-zh');
  const [reviewStrategy, setReviewStrategy] = useState<ReviewStrategy>('smart_sort');
  const [cardLimit, setCardLimit] = useState<number | 'all'>('all');
  const [learningThreshold, setLearningThreshold] = useState<number>(30); // Default threshold for active words

  // Flatten items for easy filtering
  const allItems = useMemo(() => {
    return INITIAL_DATA.flatMap(cat => 
      cat.items.map(item => ({ ...item, categoryName: cat.category }))
    );
  }, []);

  const categories = ['All', MISTAKES_CATEGORY, ...INITIAL_DATA.map(c => c.category)];

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      // 1. Category Filter
      let matchesCategory = true;
      if (activeCategory === 'All') {
        matchesCategory = true;
      } else if (activeCategory === MISTAKES_CATEGORY) {
        // Special logic for Mistakes: Check statsData
        const key = `${studyDirection}:${item.lemma}`;
        const stat = statsData[key];
        matchesCategory = stat && stat.mistakeCount > 0;
      } else {
        matchesCategory = item.categoryName === activeCategory;
      }

      // 2. POS Filter
      const matchesPos = selectedPos === 'All' || item.pos === selectedPos;

      // 3. Search Filter
      const matchesSearch = item.lemma.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.translation.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesCategory && matchesPos && matchesSearch;
    });
  }, [allItems, activeCategory, selectedPos, searchQuery, statsData, studyDirection]);

  // --- Statistics Calculation ---
  const [stats, setStats] = useState({ total: 0, hard: 0, learning: 0, mastered: 0, unseen: 0 });

  useEffect(() => {
    // Load stats from localStorage
    try {
      const statsStr = localStorage.getItem(STATS_KEY);
      const storageData = statsStr ? JSON.parse(statsStr) : {};
      
      // Update the full stats object state for filtering
      setStatsData(storageData);

      // Calculate counts for dashboard
      let hard = 0;
      let learning = 0;
      let mastered = 0;
      let unseen = 0;
      
      allItems.forEach(item => {
        const key = `${studyDirection}:${item.lemma}`;
        const record = storageData[key];
        
        if (!record) {
          unseen++;
        } else {
            const streak = record.streak || 0;
            if (record.difficulty === 'hard' || streak === 0) {
              hard++;
            } else if (streak >= 3) {
              mastered++;
            } else {
              learning++; // streak 1 or 2
            }
        }
      });
      
      setStats({ total: allItems.length, hard, learning, mastered, unseen });
    } catch (e) {
      console.error("Error calculating stats:", e);
      setStats({ total: allItems.length, hard: 0, learning: 0, mastered: 0, unseen: allItems.length });
      setStatsData({});
    }
  }, [viewMode, studyDirection, allItems, refreshTrigger]);

  const handleResetProgress = () => {
    const directionLabel = studyDirection === 'ru-zh' ? 'Russian → Chinese' : 'Chinese → Russian';
    if (window.confirm(`Are you sure you want to reset all progress for ${directionLabel}? This cannot be undone.`)) {
      try {
        const statsStr = localStorage.getItem(STATS_KEY);
        if (statsStr) {
          const data = JSON.parse(statsStr);
          const newData: Record<string, any> = {};
          // Only keep keys that DON'T match the current direction
          const prefix = `${studyDirection}:`;
          let deletedCount = 0;

          Object.keys(data).forEach(key => {
            if (!key.startsWith(prefix)) {
              newData[key] = data[key];
            } else {
              deletedCount++;
            }
          });
          
          console.log(`Resetting progress: Deleted ${deletedCount} records for prefix ${prefix}`);
          localStorage.setItem(STATS_KEY, JSON.stringify(newData));
        }
        
        // Optimistic UI update
        setStats({
          total: allItems.length,
          hard: 0,
          learning: 0,
          mastered: 0,
          unseen: allItems.length
        });
        setStatsData({}); // Clear internal data cache

        // Trigger refresh for other components if needed
        setRefreshTrigger(prev => prev + 1);
        
      } catch (e) {
        console.error("Failed to reset progress:", e);
        alert("An error occurred while resetting progress. Please try refreshing the page.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setViewMode('browse')}>
              <div className="bg-blue-600 text-white p-1.5 rounded-lg group-hover:bg-blue-700 transition-colors">
                <Book size={20} />
              </div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight hidden sm:block">RuVocab</h1>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Audio Source Selector */}
              <div className="hidden sm:flex items-center gap-2 mr-2 bg-slate-100 rounded-lg p-1 max-w-[200px] md:max-w-xs">
                <div className="px-2 text-slate-400">
                  <Volume2 size={16} />
                </div>
                <select 
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer pr-2 w-full truncate"
                  title="Select Voice"
                >
                  {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={() => setViewMode(viewMode === 'browse' ? 'flashcard' : 'browse')}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  viewMode === 'flashcard' 
                    ? 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700' 
                    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400'
                }`}
              >
                {viewMode === 'browse' ? <Zap size={16} className="fill-current" /> : <Grid size={16} />}
                {viewMode === 'browse' ? 'Start Study' : 'Browse List'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {viewMode === 'flashcard' ? (
        <main className="flex-1 flex flex-col bg-slate-100 relative">
           {/* Flashcard Settings Bar - Elevated z-index to sit above 3D context */}
           <div className="bg-white border-b border-slate-200 px-4 py-3 shadow-sm relative z-20">
             <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                
                {/* Left: Label */}
                <div className="flex items-center gap-2 text-slate-700 font-medium shrink-0">
                  <Settings size={18} />
                  <span className="text-sm">Study Options</span>
                  {activeCategory === MISTAKES_CATEGORY && (
                     <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-bold">
                       Mistakes Mode
                     </span>
                  )}
                </div>
                
                {/* Right: Controls */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  
                  {/* Direction */}
                  <button 
                    onClick={() => setStudyDirection(prev => prev === 'ru-zh' ? 'zh-ru' : 'ru-zh')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 hover:bg-white hover:border-blue-300 hover:text-blue-600 transition-all text-slate-700 cursor-pointer"
                  >
                    <ArrowRightLeft size={14} />
                    {studyDirection === 'ru-zh' ? 'RU → ZH' : 'ZH → RU'}
                  </button>

                  <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>

                  {/* Strategy Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase hidden sm:block">Mode:</label>
                    <div className="relative">
                      <select
                        value={reviewStrategy}
                        onChange={(e) => setReviewStrategy(e.target.value as ReviewStrategy)}
                        className="appearance-none pl-8 pr-8 py-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer text-slate-700"
                      >
                        <option value="smart_sort">Smart Cram (Recommended)</option>
                        <option value="sequential">Sequential (Default Order)</option>
                        <option value="random">Shuffle (Random)</option>
                        <option value="hard_only">Hard Only</option>
                      </select>
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        {reviewStrategy === 'random' ? <Shuffle size={12} /> : 
                         reviewStrategy === 'smart_sort' ? <Brain size={12} /> : 
                         reviewStrategy === 'sequential' ? <SortAsc size={12} /> :
                         <Filter size={12} />}
                      </div>
                    </div>
                  </div>

                  {/* Limit Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase hidden sm:block">Count:</label>
                    <div className="relative">
                      <select
                        value={cardLimit}
                        onChange={(e) => setCardLimit(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="appearance-none pl-8 pr-8 py-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer text-slate-700"
                      >
                        <option value="all">All Words</option>
                        <option value="10">10 Cards</option>
                        <option value="20">20 Cards</option>
                        <option value="50">50 Cards</option>
                      </select>
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <ListFilter size={12} />
                      </div>
                    </div>
                  </div>

                   {/* Learning Threshold (Load Cap) */}
                   <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase hidden sm:block">Load:</label>
                    <div className="relative" title="Max active (learning + hard) words allowed before stopping new words">
                      <select
                        value={learningThreshold}
                        onChange={(e) => setLearningThreshold(Number(e.target.value))}
                        className="appearance-none pl-8 pr-8 py-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer text-slate-700"
                      >
                        <option value="15">15 Active</option>
                        <option value="30">30 Active</option>
                        <option value="50">50 Active</option>
                        <option value="10000">No Limit</option>
                      </select>
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <Activity size={12} />
                      </div>
                    </div>
                  </div>

                </div>
             </div>
           </div>

           {/* Content */}
           <div className="relative z-10">
             {filteredItems.length > 0 ? (
               <FlashcardMode 
                  items={filteredItems} 
                  onExit={() => setViewMode('browse')} 
                  direction={studyDirection}
                  strategy={reviewStrategy}
                  limit={cardLimit}
                  learningThreshold={learningThreshold}
                  selectedVoice={currentVoiceObject}
                  onResetFilter={() => {
                    setReviewStrategy('smart_sort');
                    setCardLimit('all');
                  }}
               />
             ) : (
               <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
                 {activeCategory === MISTAKES_CATEGORY ? (
                    <div className="text-center">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Check size={32} />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">No Mistakes Recorded!</h2>
                        <p className="text-slate-500">You haven't marked any cards as "Hard" yet in this direction.</p>
                    </div>
                 ) : (
                    <>
                      <p className="text-lg text-slate-500 mb-4">No words match your current filters.</p>
                      <button onClick={() => { setActiveCategory('All'); setSelectedPos('All'); setSearchQuery(''); }} className="text-blue-600 hover:underline">Clear Filters</button>
                    </>
                 )}
               </div>
             )}
           </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Controls Bar */}
          <div className="mb-8 space-y-4">
            
            {/* PROGRESS DASHBOARD */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <PieChart size={20} className="text-indigo-600" />
                  <span>Your Progress</span>
                  <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded ml-2">
                    {studyDirection === 'ru-zh' ? 'Russian → Chinese' : 'Chinese → Russian'}
                  </span>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Switch Direction for stats */}
                    <button 
                      onClick={() => setStudyDirection(prev => prev === 'ru-zh' ? 'zh-ru' : 'ru-zh')}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <ArrowRightLeft size={12} /> Switch Direction
                    </button>

                    <button 
                      onClick={handleResetProgress}
                      className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                      title={`Reset progress for ${studyDirection === 'ru-zh' ? 'Russian -> Chinese' : 'Chinese -> Russian'}`}
                    >
                      <Trash2 size={12} /> Reset Progress
                    </button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden flex">
                <div 
                  className="bg-green-500 h-full transition-all duration-500" 
                  style={{ width: `${(stats.mastered / stats.total) * 100}%` }}
                  title={`${stats.mastered} Mastered (Streak 3+)`}
                />
                <div 
                  className="bg-yellow-400 h-full transition-all duration-500" 
                  style={{ width: `${(stats.learning / stats.total) * 100}%` }}
                  title={`${stats.learning} Learning (Streak 1-2)`}
                />
                <div 
                  className="bg-red-500 h-full transition-all duration-500" 
                  style={{ width: `${(stats.hard / stats.total) * 100}%` }}
                  title={`${stats.hard} Hard`}
                />
                {/* Remaining is gray (unseen) */}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm">
                <div className="flex items-center gap-2" title="Streak 3+">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-slate-600">Mastered: <strong>{stats.mastered}</strong></span>
                </div>
                <div className="flex items-center gap-2" title="Streak 1-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <span className="text-slate-600">Learning: <strong>{stats.learning}</strong></span>
                </div>
                <div className="flex items-center gap-2" title="Streak 0 or Hard">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-slate-600">Hard: <strong>{stats.hard}</strong></span>
                </div>
                 <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                  <span className="text-slate-600">New: <strong>{stats.unseen}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search size={18} className="text-slate-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search Russian or Chinese meanings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm shadow-sm transition-shadow"
                />
              </div>

               {/* Mobile Audio Select (Visible only on small screens) */}
               <div className="md:hidden flex items-center gap-2 bg-slate-100 rounded-lg p-2 border border-slate-200">
                <Volume2 size={18} className="text-slate-500" />
                <select 
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none w-full"
                >
                   {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Filters Button (Mobile) */}
              <button 
                className="md:hidden flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 rounded-lg bg-white"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter size={18} /> Filters
              </button>
              
              {/* Layout Switcher (Desktop) */}
              <div className="hidden md:flex bg-white rounded-lg border border-slate-300 p-1">
                <button 
                  onClick={() => setLayoutMode('grid')}
                  className={`p-1.5 rounded ${layoutMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Grid size={18} />
                </button>
                <button 
                  onClick={() => setLayoutMode('list')}
                  className={`p-1.5 rounded ${layoutMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>

            {/* Filters Area */}
            <div className={`${showFilters ? 'block' : 'hidden'} md:block bg-white p-4 rounded-xl border border-slate-200 shadow-sm`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Categories */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Category</label>
                  <select 
                    value={activeCategory}
                    onChange={(e) => setActiveCategory(e.target.value)}
                    className="block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                  >
                    {categories.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* POS Filter */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Part of Speech</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                       onClick={() => setSelectedPos('All')}
                       className={`px-3 py-1 text-xs rounded-full border transition-all ${
                         selectedPos === 'All' 
                          ? 'bg-slate-800 text-white border-slate-800' 
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                       }`}
                    >
                      All
                    </button>
                    {(Object.keys(POS_LABELS) as PartOfSpeech[]).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setSelectedPos(pos)}
                        className={`px-3 py-1 text-xs rounded-full border transition-all ${
                          selectedPos === pos 
                            ? POS_LABELS[pos].color.replace('text-', 'bg-').replace('bg-', 'text-white border-transparent ') // Invert for active state hack
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                        style={selectedPos === pos ? { backgroundColor: 'var(--tw-bg-opacity)'} : {}} // Simplification for active state
                      >
                         {POS_LABELS[pos].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Results Grid/List */}
          <div className="mb-4 text-sm text-slate-500 font-medium">
            Showing {filteredItems.length} words
          </div>

          {filteredItems.length > 0 ? (
            <div className={`
              ${layoutMode === 'grid' 
                ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6' 
                : 'flex flex-col gap-3'
              }
            `}>
              {filteredItems.map((item, index) => (
                <WordCard 
                  key={`${item.lemma}-${index}`} 
                  item={item} 
                  layout={layoutMode} 
                  selectedVoice={currentVoiceObject} 
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <Layers className="mx-auto h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900">No words found</h3>
              <p className="text-slate-500">Try adjusting your search or filters.</p>
            </div>
          )}
        </main>
      )}
    </div>
  );
};

export default App;