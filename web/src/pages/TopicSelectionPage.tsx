import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../app/store';
import { listCategoryOptions, listTopicOptions, listSubtopicOptions } from '../lib/taxonomy';

export default function TopicSelectionPage() {
  const [selectedSubtopics, setSelectedSubtopics] = useState<string[]>([]);
  const setQuizConfig = useAppStore(s => s.setActiveQuiz);

  const [categoryId, setCategoryId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');

  const categories = listCategoryOptions();
  const topics = categoryId ? listTopicOptions(categoryId) : [];
  const subtopics = topicId ? listSubtopicOptions(topicId) : [];

  function toggleSubtopic(id: string) {
    setSelectedSubtopics(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function proceedToConfig() {
    setQuizConfig({
      startedAt: 0,
      items: [],
      answers: {},
      config: {
        numQuestions: 10,
        timed: false,
        durationMins: 30,
        progressionMode: 'batch',
        captureConfidence: true,
        topicIds: selectedSubtopics
      },
      currentIndex: 0,
      schemaVersion: 1
    });
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur border-b border-gray-200/50 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/app" className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 grid place-items-center transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Choose Your Topics</h1>
                <p className="text-sm text-gray-500">Organized by Category → Topic → Subtopic</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{selectedSubtopics.length} selected</span>
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Progress indicator */}
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: '25%' }}
          className="h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-8"
        />

        {/* Taxonomy selectors */}
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <select value={categoryId} onChange={(e)=>{ setCategoryId(e.target.value); setTopicId(''); }} className="w-full p-3 rounded-xl border-2 bg-white/80">
            <option value="">Select Category</option>
            {categories.map((c: { value: string; label: string }) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select value={topicId} onChange={(e)=> setTopicId(e.target.value)} disabled={!categoryId} className="w-full p-3 rounded-xl border-2 bg-white/80 disabled:opacity-50">
            <option value="">Select Topic</option>
            {topics.map((t: { value: string; label: string }) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <button onClick={()=> setSelectedSubtopics([])} className="p-3 rounded-xl border-2 bg-white/80">Clear Selected</button>
        </div>

        {/* Subtopic Grid */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8"
        >
          {subtopics.map((s: { value: string; label: string }, index: number) => {
            const isSelected = selectedSubtopics.includes(s.value);
            const colorClass = 'from-blue-500 to-indigo-500';
            const icon = '📚';
            const description = 'Subtopic';
            return (
              <motion.div
                key={s.value}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: index * 0.03 }}
                whileHover={{ scale: 1.02, y: -4 }}
                whileTap={{ scale: 0.98 }}
              >
                <button
                  onClick={() => toggleSubtopic(s.value)}
                  className={`w-full p-6 rounded-3xl border-2 transition-all text-left ${isSelected ? `bg-gradient-to-br ${colorClass} text-white border-transparent shadow-xl` : 'bg-white/80 backdrop-blur border-gray-200 hover:border-gray-300 shadow-soft hover:shadow-lg'}`}
                >
                  <div className={`text-3xl mb-3 ${isSelected ? '' : 'grayscale'}`}>{icon}</div>
                  <h3 className={`font-bold text-lg mb-2 ${isSelected ? 'text-white' : 'text-gray-900'}`}>{s.label}</h3>
                  <p className={`text-sm ${isSelected ? 'text-white/90' : 'text-gray-600'}`}>{description}</p>
                  <div className={`mt-4 flex items-center justify-between`}>
                    <span className={`text-xs font-medium ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>Taxonomy</span>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-white bg-white' : 'border-gray-300'}`}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Continue button */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex justify-center"
        >
          <Link
            to="/quiz/config"
            onClick={proceedToConfig}
            className={`px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 ${selectedSubtopics.length > 0 ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-xl hover:shadow-2xl hover:scale-105' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            style={{ pointerEvents: selectedSubtopics.length > 0 ? 'auto' : 'none' }}
          >
            Continue with {selectedSubtopics.length} subtopic{selectedSubtopics.length !== 1 ? 's' : ''}
            <svg className="w-5 h-5 ml-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
        </motion.div>

        {/* Helpful tip */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 text-sm">
            💡 <span>Pick multiple subtopics within a topic for a focused session.</span>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
