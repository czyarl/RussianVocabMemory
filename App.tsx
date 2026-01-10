import React, { useState, useMemo } from 'react';
import { INITIAL_DATA, POS_LABELS } from './constants';
import { WordCard } from './components/WordCard';
import { FlashcardMode } from './components/FlashcardMode';
import { Search, Layers, Book, Grid, List, Zap, Filter, Settings, Brain, ArrowRightLeft, ListFilter, Shuffle } from 'lucide-react';
import { PartOfSpeech } from './types';

export type ReviewStrategy = 'random' | 'smart_sort' | 'hard_only';

const App: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [selectedPos, setSelectedPos] = useState<PartOfSpeech | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [viewMode, setViewMode] = useState<'browse' | 'flashcard'>('browse');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Study Settings
  const [studyDirection, setStudyDirection] = useState<'ru-zh' | 'zh-ru'>('ru-zh');
  const [reviewStrategy, setReviewStrategy] = useState<ReviewStrategy>('smart_sort');
  const [cardLimit, setCardLimit] = useState<number | 'all'>('all');

  // Flatten items for easy filtering
  const allItems = useMemo(() => {
    return INITIAL_DATA.flatMap(cat => 
      cat.items.map(item => ({ ...item, categoryName: cat.category }))
    );
  }, []);

  const categories = ['All', ...INITIAL_DATA.map(c => c.category)];

  const filteredItems = useMemo(() => {
    return allItems.filter(item => {
      const matchesCategory = activeCategory === 'All' || item.categoryName === activeCategory;
      const matchesPos = selectedPos === 'All' || item.pos === selectedPos;
      const matchesSearch = item.lemma.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.translation.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesPos && matchesSearch;
    });
  }, [allItems, activeCategory, selectedPos, searchQuery]);

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
                        <option value="random">Shuffle (Random)</option>
                        <option value="smart_sort">Smart Priority</option>
                        <option value="hard_only">Hard Only</option>
                      </select>
                      <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        {reviewStrategy === 'random' ? <Shuffle size={12} /> : 
                         reviewStrategy === 'smart_sort' ? <Brain size={12} /> : <Filter size={12} />}
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
                  onResetFilter={() => {
                    setReviewStrategy('smart_sort');
                    setCardLimit('all');
                  }}
               />
             ) : (
               <div className="flex flex-col items-center justify-center min-h-[50vh] p-8">
                 <p className="text-lg text-slate-500 mb-4">No words match your current filters.</p>
                 <button onClick={() => { setActiveCategory('All'); setSelectedPos('All'); setSearchQuery(''); }} className="text-blue-600 hover:underline">Clear Filters</button>
               </div>
             )}
           </div>
        </main>
      ) : (
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          
          {/* Controls Bar */}
          <div className="mb-8 space-y-4">
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
                <WordCard key={`${item.lemma}-${index}`} item={item} layout={layoutMode} />
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