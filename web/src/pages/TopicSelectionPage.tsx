import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../app/store';
import MultiSelectTaxonomy from '../components/MultiSelectTaxonomy';

interface TaxonomySelection {
  category: string;
  subcategories: string[];
  subSubcategories: Record<string, string[]>; // subcategory -> sub-subcategories
}

export default function TopicSelectionPage() {
  const setQuizConfig = useAppStore(s => s.setActiveQuiz);
  const [taxonomySelections, setTaxonomySelections] = useState<TaxonomySelection[]>([]);

  function proceedToConfig() {
    // Create quiz config with taxonomy filters
    setQuizConfig({
      startedAt: 0,
      items: [],
      answers: {},
      config: {
        numQuestions: 25,
        timed: false,
        durationMins: 30,
        progressionMode: 'one-by-one',
        captureConfidence: true,
        topicIds: [], // Clear legacy topics
        taxonomyFilter: taxonomySelections
      },
      currentIndex: 0,
      schemaVersion: 1
    });
  }

  const getTotalSelections = () => {
    return taxonomySelections.reduce((total, selection) => {
      const subcategoryCount = selection.subcategories.length;
      const subSubcategoryCount = Object.values(selection.subSubcategories)
        .reduce((sum, subSubs) => sum + subSubs.length, 0);
      
      // If no specific subcategories/sub-subcategories are selected, count as 1 (whole category)
      if (subcategoryCount === 0 && subSubcategoryCount === 0) {
        return total + 1;
      }
      
      // Count specific selections
      return total + Math.max(subcategoryCount, subSubcategoryCount);
    }, 0);
  };

  const totalSelections = getTotalSelections();

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
                <p className="text-sm text-gray-500">Organized by Category → Subcategory → Sub-subcategory</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">{totalSelections} selected</span>
              <div className={`w-2 h-2 rounded-full ${totalSelections > 0 ? 'bg-green-500' : 'bg-gray-300'}`} />
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

        {/* Taxonomy Selection */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="bg-white/90 backdrop-blur rounded-2xl p-6 shadow-lg border border-gray-100 mb-8"
        >
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Select Medical Categories</h2>
            <p className="text-sm text-gray-600">
              Choose from our structured dermatology knowledge base. You can select entire categories, specific subcategories, or individual topics to customize your quiz content.
            </p>
          </div>

          <MultiSelectTaxonomy
            value={taxonomySelections}
            onChange={setTaxonomySelections}
            showEntityCount={true}
          />
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
            className={`px-8 py-4 rounded-2xl font-semibold text-lg transition-all duration-300 ${
              totalSelections > 0 
                ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white shadow-xl hover:shadow-2xl hover:scale-105' 
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
            style={{ pointerEvents: totalSelections > 0 ? 'auto' : 'none' }}
          >
            Continue with {totalSelections} selection{totalSelections !== 1 ? 's' : ''}
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
            💡 <span>Expand categories to select specific subcategories and topics for focused learning.</span>
          </div>
        </motion.div>
      </div>
    </main>
  );
}