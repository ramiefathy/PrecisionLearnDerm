import { useState, useEffect, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Simple inline icons to avoid dependency issues
const ChevronRightIcon = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

interface TaxonomySelection {
  category: string;
  subcategories: string[];
  subSubcategories: Record<string, string[]>; // subcategory -> sub-subcategories
}

interface MultiSelectTaxonomyProps {
  value: TaxonomySelection[];
  onChange: (selections: TaxonomySelection[]) => void;
  showEntityCount?: boolean;
}

interface TaxonomyData {
  categories: string[];
  structure: Record<string, Record<string, Record<string, any[]>>>; // category -> subcategory -> sub-subcategory -> entities
  entityCounts: Record<string, number>;
  totalEntities: number;
}

export default function MultiSelectTaxonomy({ 
  value = [], 
  onChange,
  showEntityCount = true 
}: MultiSelectTaxonomyProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxonomyData, setTaxonomyData] = useState<TaxonomyData | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  
  const functions = getFunctions();
  const getTaxonomy = httpsCallable(functions, 'admin_getTaxonomy');

  // Load taxonomy structure on mount
  useEffect(() => {
    loadTaxonomyStructure();
  }, []);

  const loadTaxonomyStructure = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getTaxonomy({});
      const data = result.data as any;
      
      if (data.success && data.structure) {
        setTaxonomyData({
          categories: data.categories || [],
          structure: data.structure || {},
          entityCounts: data.entityCounts || {},
          totalEntities: data.stats?.totalEntities || 0
        });
      } else {
        setError('Failed to load taxonomy structure');
      }
    } catch (err) {
      console.error('Error loading taxonomy:', err);
      setError('Failed to load taxonomy structure');
    } finally {
      setLoading(false);
    }
  };

  // Toggle category expansion
  const toggleCategoryExpanded = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
        // Collapse all subcategories when category is collapsed
        const subcatKeys = Object.keys(taxonomyData?.structure[category] || {});
        subcatKeys.forEach(subcat => {
          setExpandedSubcategories(prev => {
            const newSubSet = new Set(prev);
            newSubSet.delete(`${category}::${subcat}`);
            return newSubSet;
          });
        });
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Toggle subcategory expansion
  const toggleSubcategoryExpanded = (category: string, subcategory: string) => {
    setExpandedSubcategories(prev => {
      const newSet = new Set(prev);
      const key = `${category}::${subcategory}`;
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Check if category is selected (all subcategories selected)
  const isCategorySelected = (category: string): boolean => {
    const categoryData = value.find(v => v.category === category);
    if (!categoryData) return false;
    
    const allSubcategories = Object.keys(taxonomyData?.structure[category] || {});
    return allSubcategories.length > 0 && 
           allSubcategories.every(sub => categoryData.subcategories.includes(sub));
  };

  // Check if category is partially selected (some subcategories selected)
  const isCategoryPartiallySelected = (category: string): boolean => {
    const categoryData = value.find(v => v.category === category);
    if (!categoryData || categoryData.subcategories.length === 0) return false;
    
    const allSubcategories = Object.keys(taxonomyData?.structure[category] || {});
    return categoryData.subcategories.length < allSubcategories.length;
  };

  // Check if subcategory is selected (all sub-subcategories selected)
  const isSubcategorySelected = (category: string, subcategory: string): boolean => {
    const categoryData = value.find(v => v.category === category);
    if (!categoryData || !categoryData.subcategories.includes(subcategory)) return false;
    
    const allSubSubs = Object.keys(taxonomyData?.structure[category]?.[subcategory] || {});
    const selectedSubSubs = categoryData.subSubcategories[subcategory] || [];
    return allSubSubs.length > 0 && allSubSubs.length === selectedSubSubs.length;
  };

  // Check if subcategory is partially selected
  const isSubcategoryPartiallySelected = (category: string, subcategory: string): boolean => {
    const categoryData = value.find(v => v.category === category);
    if (!categoryData) return false;
    
    const selectedSubSubs = categoryData.subSubcategories[subcategory] || [];
    if (selectedSubSubs.length === 0) return false;
    
    const allSubSubs = Object.keys(taxonomyData?.structure[category]?.[subcategory] || {});
    return selectedSubSubs.length < allSubSubs.length;
  };

  // Check if sub-subcategory is selected
  const isSubSubcategorySelected = (category: string, subcategory: string, subSubcategory: string): boolean => {
    const categoryData = value.find(v => v.category === category);
    if (!categoryData) return false;
    
    const selectedSubSubs = categoryData.subSubcategories[subcategory] || [];
    return selectedSubSubs.includes(subSubcategory);
  };

  // Toggle category selection
  const toggleCategory = (category: string) => {
    const isCurrentlySelected = isCategorySelected(category);
    const newValue = [...value];
    const existingIndex = newValue.findIndex(v => v.category === category);
    
    if (isCurrentlySelected) {
      // Deselect all
      if (existingIndex >= 0) {
        newValue.splice(existingIndex, 1);
      }
    } else {
      // Select all subcategories and sub-subcategories
      const allSubcategories = Object.keys(taxonomyData?.structure[category] || {});
      const allSubSubcategories: Record<string, string[]> = {};
      
      allSubcategories.forEach(subcat => {
        allSubSubcategories[subcat] = Object.keys(taxonomyData?.structure[category]?.[subcat] || {});
      });
      
      if (existingIndex >= 0) {
        newValue[existingIndex] = {
          category,
          subcategories: allSubcategories,
          subSubcategories: allSubSubcategories
        };
      } else {
        newValue.push({
          category,
          subcategories: allSubcategories,
          subSubcategories: allSubSubcategories
        });
      }
    }
    
    onChange(newValue);
  };

  // Toggle subcategory selection
  const toggleSubcategory = (category: string, subcategory: string) => {
    const isCurrentlySelected = isSubcategorySelected(category, subcategory);
    const newValue = [...value];
    let categoryData = newValue.find(v => v.category === category);
    
    if (!categoryData) {
      // Create new category entry
      categoryData = {
        category,
        subcategories: [],
        subSubcategories: {}
      };
      newValue.push(categoryData);
    }
    
    if (isCurrentlySelected) {
      // Deselect subcategory
      categoryData.subcategories = categoryData.subcategories.filter(s => s !== subcategory);
      delete categoryData.subSubcategories[subcategory];
      
      // Remove category if empty
      if (categoryData.subcategories.length === 0) {
        const index = newValue.findIndex(v => v.category === category);
        if (index >= 0) newValue.splice(index, 1);
      }
    } else {
      // Select all sub-subcategories in this subcategory
      if (!categoryData.subcategories.includes(subcategory)) {
        categoryData.subcategories.push(subcategory);
      }
      categoryData.subSubcategories[subcategory] = Object.keys(
        taxonomyData?.structure[category]?.[subcategory] || {}
      );
    }
    
    onChange(newValue);
  };

  // Toggle sub-subcategory selection
  const toggleSubSubcategory = (category: string, subcategory: string, subSubcategory: string) => {
    const newValue = [...value];
    let categoryData = newValue.find(v => v.category === category);
    
    if (!categoryData) {
      // Create new category entry
      categoryData = {
        category,
        subcategories: [],
        subSubcategories: {}
      };
      newValue.push(categoryData);
    }
    
    const isCurrentlySelected = isSubSubcategorySelected(category, subcategory, subSubcategory);
    
    if (isCurrentlySelected) {
      // Deselect sub-subcategory
      const subSubs = categoryData.subSubcategories[subcategory] || [];
      categoryData.subSubcategories[subcategory] = subSubs.filter(s => s !== subSubcategory);
      
      // Remove subcategory if no sub-subcategories selected
      if (categoryData.subSubcategories[subcategory].length === 0) {
        categoryData.subcategories = categoryData.subcategories.filter(s => s !== subcategory);
        delete categoryData.subSubcategories[subcategory];
      }
      
      // Remove category if empty
      if (categoryData.subcategories.length === 0) {
        const index = newValue.findIndex(v => v.category === category);
        if (index >= 0) newValue.splice(index, 1);
      }
    } else {
      // Select sub-subcategory
      if (!categoryData.subcategories.includes(subcategory)) {
        categoryData.subcategories.push(subcategory);
      }
      if (!categoryData.subSubcategories[subcategory]) {
        categoryData.subSubcategories[subcategory] = [];
      }
      categoryData.subSubcategories[subcategory].push(subSubcategory);
    }
    
    onChange(newValue);
  };

  // Calculate selection counts
  const selectionSummary = useMemo(() => {
    let totalCategories = 0;
    let totalSubcategories = 0;
    let totalSubSubcategories = 0;
    
    value.forEach(cat => {
      if (cat.subcategories.length > 0) totalCategories++;
      totalSubcategories += cat.subcategories.length;
      Object.values(cat.subSubcategories).forEach(subs => {
        totalSubSubcategories += subs.length;
      });
    });
    
    return { totalCategories, totalSubcategories, totalSubSubcategories };
  }, [value]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-sm text-gray-600 mt-2">Loading taxonomy structure...</p>
      </div>
    );
  }

  if (error || !taxonomyData) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-600">{error || 'Failed to load taxonomy'}</p>
        <button 
          onClick={loadTaxonomyStructure}
          className="mt-2 text-sm text-red-700 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add CSS animation styles */}
      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
      
      {/* Selection Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 transition-all duration-300">
        <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Current Selection
        </h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
            <span className="text-gray-600">Categories:</span>
            <span className="font-semibold text-blue-800 ml-1">{selectionSummary.totalCategories}</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-indigo-500 rounded-full mr-2"></div>
            <span className="text-gray-600">Subcategories:</span>
            <span className="font-semibold text-indigo-800 ml-1">{selectionSummary.totalSubcategories}</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
            <span className="text-gray-600">Topics:</span>
            <span className="font-semibold text-purple-800 ml-1">{selectionSummary.totalSubSubcategories}</span>
          </div>
        </div>
        {selectionSummary.totalSubSubcategories === 0 && (
          <p className="text-sm text-gray-500 mt-2 italic">No selections made yet. Expand categories below to choose topics.</p>
        )}
      </div>

      {/* Category Tree */}
      <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {(Array.isArray(taxonomyData.categories) ? taxonomyData.categories : []).map((category) => (
          <div key={category} className="border-b border-gray-200 last:border-b-0">
            {/* Category Header */}
            <div className="flex items-center p-4 hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50 transition-all duration-200 group">
              <button
                onClick={() => toggleCategoryExpanded(category)}
                className="p-2 hover:bg-blue-100 rounded-lg transition-colors duration-200 group-hover:scale-110"
              >
                <div className={`transform transition-transform duration-300 ${expandedCategories.has(category) ? 'rotate-90' : 'rotate-0'}`}>
                  <ChevronRightIcon className="h-4 w-4 text-gray-600" />
                </div>
              </button>
              <input
                type="checkbox"
                checked={isCategorySelected(category)}
                ref={input => {
                  if (input) {
                    input.indeterminate = isCategoryPartiallySelected(category);
                  }
                }}
                onChange={() => toggleCategory(category)}
                className="ml-2 h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 transition-colors duration-200"
              />
              <label className="ml-4 flex-1 font-semibold text-gray-900 cursor-pointer select-none">
                <span className="flex items-center">
                  {category}
                  {showEntityCount && taxonomyData.entityCounts[category] && (
                    <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 transition-colors duration-200">
                      {taxonomyData.entityCounts[category]} topics
                    </span>
                  )}
                  {isCategorySelected(category) && (
                    <svg className="ml-2 w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  {isCategoryPartiallySelected(category) && (
                    <svg className="ml-2 w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 000 2h4a1 1 0 100-2H8z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              </label>
            </div>

            {/* Subcategories */}
            {expandedCategories.has(category) && (
              <div className="ml-6 bg-gradient-to-r from-gray-50 to-blue-50 border-t border-gray-100 animate-slideDown">
                {Object.keys(taxonomyData.structure[category] || {}).map((subcategory) => (
                  <div key={subcategory} className="border-b border-gray-100 last:border-b-0">
                    {/* Subcategory Header */}
                    <div className="flex items-center p-3 hover:bg-white hover:shadow-sm transition-all duration-200 group">
                      <button
                        onClick={() => toggleSubcategoryExpanded(category, subcategory)}
                        className="p-1.5 hover:bg-indigo-100 rounded-md transition-colors duration-200"
                      >
                        <div className={`transform transition-transform duration-300 ${expandedSubcategories.has(`${category}::${subcategory}`) ? 'rotate-90' : 'rotate-0'}`}>
                          <ChevronRightIcon className="h-3 w-3 text-gray-600" />
                        </div>
                      </button>
                      <input
                        type="checkbox"
                        checked={isSubcategorySelected(category, subcategory)}
                        ref={input => {
                          if (input) {
                            input.indeterminate = isSubcategoryPartiallySelected(category, subcategory);
                          }
                        }}
                        onChange={() => toggleSubcategory(category, subcategory)}
                        className="ml-2 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 transition-colors duration-200"
                      />
                      <label className="ml-3 flex-1 text-sm font-medium text-gray-800 cursor-pointer select-none">
                        <span className="flex items-center">
                          {subcategory}
                          {showEntityCount && taxonomyData.entityCounts[`${category}::${subcategory}`] && (
                            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {taxonomyData.entityCounts[`${category}::${subcategory}`]} topics
                            </span>
                          )}
                          {isSubcategorySelected(category, subcategory) && (
                            <svg className="ml-2 w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                      </label>
                    </div>

                    {/* Sub-subcategories */}
                    {expandedSubcategories.has(`${category}::${subcategory}`) && (
                      <div className="ml-4 bg-gradient-to-r from-white to-purple-50 border-l-2 border-purple-200 animate-slideDown">
                        {Object.keys(taxonomyData.structure[category][subcategory] || {}).map((subSubcategory) => (
                          <div key={subSubcategory} className="flex items-center p-3 hover:bg-purple-50 transition-colors duration-200 group border-b border-purple-100 last:border-b-0">
                            <div className="flex items-center">
                              <div className="w-2 h-2 bg-purple-300 rounded-full mr-3 group-hover:bg-purple-400 transition-colors duration-200"></div>
                              <input
                                type="checkbox"
                                checked={isSubSubcategorySelected(category, subcategory, subSubcategory)}
                                onChange={() => toggleSubSubcategory(category, subcategory, subSubcategory)}
                                className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 transition-colors duration-200"
                              />
                            </div>
                            <label className="ml-3 flex-1 text-sm text-gray-700 cursor-pointer select-none font-medium group-hover:text-gray-900">
                              <span className="flex items-center">
                                {subSubcategory}
                                {showEntityCount && taxonomyData.entityCounts[`${category}::${subcategory}::${subSubcategory}`] && (
                                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 group-hover:bg-purple-200">
                                    {taxonomyData.entityCounts[`${category}::${subcategory}::${subSubcategory}`]} topics
                                  </span>
                                )}
                                {isSubSubcategorySelected(category, subcategory, subSubcategory) && (
                                  <svg className="ml-2 w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}