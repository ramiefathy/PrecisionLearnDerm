import { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface TaxonomyEntity {
  name: string;
  category: string;
  subcategory: string;
  sub_subcategory: string;
  completenessScore?: number;
  description?: string;
}

interface TaxonomyStats {
  totalEntities: number;
  categories: number;
  subcategories: number;
  subSubcategories: number;
  categoryDistribution: Record<string, number>;
}

interface TaxonomySelectorProps {
  selectedCategory?: string;
  selectedSubcategory?: string;
  selectedSubSubcategory?: string;
  selectedEntity?: string;
  onCategoryChange: (category: string) => void;
  onSubcategoryChange: (subcategory: string) => void;
  onSubSubcategoryChange: (subSubcategory: string) => void;
  onEntityChange: (entity: TaxonomyEntity | null) => void;
  showEntitySelector?: boolean;
  showStats?: boolean;
  showEntityList?: boolean; // NEW: show entities as informational context
}

export default function TaxonomySelector({
  selectedCategory,
  selectedSubcategory,
  selectedSubSubcategory,
  selectedEntity,
  onCategoryChange,
  onSubcategoryChange,
  onSubSubcategoryChange,
  onEntityChange,
  showEntitySelector = false,
  showStats = false,
  showEntityList = false // NEW: show entities as informational context
}: TaxonomySelectorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [subSubcategories, setSubSubcategories] = useState<string[]>([]);
  const [entities, setEntities] = useState<TaxonomyEntity[]>([]);
  const [stats, setStats] = useState<TaxonomyStats | null>(null);

  const functions = getFunctions();
  const getTaxonomy = httpsCallable(functions, 'admin_getTaxonomy');
  const getTaxonomyEntities = httpsCallable(functions, 'admin_getTaxonomyEntities');

  // Load initial taxonomy structure
  useEffect(() => {
    loadTaxonomy();
  }, []);

  // Load subcategories when category changes
  useEffect(() => {
    if (selectedCategory && categories.includes(selectedCategory)) {
      loadSubcategories(selectedCategory);
    } else {
      setSubcategories([]);
      setSubSubcategories([]);
      setEntities([]);
    }
  }, [selectedCategory, categories]);

  // Load sub-subcategories when subcategory changes
  useEffect(() => {
    if (selectedCategory && selectedSubcategory && subcategories.includes(selectedSubcategory)) {
      loadSubSubcategories(selectedCategory, selectedSubcategory);
    } else {
      setSubSubcategories([]);
      setEntities([]);
    }
  }, [selectedSubcategory, subcategories]);

  // Load entities when sub-subcategory changes (if entity selector or list is enabled)
  useEffect(() => {
    if ((showEntitySelector || showEntityList) && selectedCategory && selectedSubcategory && selectedSubSubcategory) {
      loadEntities(selectedCategory, selectedSubcategory, selectedSubSubcategory);
    } else if ((showEntitySelector || showEntityList) && selectedCategory && selectedSubcategory && !selectedSubSubcategory) {
      loadEntities(selectedCategory, selectedSubcategory);
    } else if ((showEntitySelector || showEntityList) && selectedCategory && !selectedSubcategory && !selectedSubSubcategory) {
      loadEntities(selectedCategory);
    }
  }, [selectedSubSubcategory, showEntitySelector, showEntityList]);

  const loadTaxonomy = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await getTaxonomy({});
      const data = result.data as any;
      
      if (data.success) {
        setCategories(data.categories || []);
        if (showStats) {
          setStats(data.stats);
        }
      } else {
        setError('Failed to load taxonomy');
      }
    } catch (err) {
      console.error('Error loading taxonomy:', err);
      setError('Failed to load taxonomy structure');
    } finally {
      setLoading(false);
    }
  };

  const loadSubcategories = async (category: string) => {
    if (!categories.includes(category)) return;
    
    try {
      const result = await getTaxonomyEntities({ category });
      const data = result.data as any;
      
      if (data.success) {
        const subcats = [...new Set(data.entities.map((e: TaxonomyEntity) => e.subcategory))].sort() as string[];
        setSubcategories(subcats);
      }
    } catch (err) {
      console.error('Error loading subcategories:', err);
    }
  };

  const loadSubSubcategories = async (category: string, subcategory: string) => {
    try {
      const result = await getTaxonomyEntities({ category, subcategory });
      const data = result.data as any;
      
      if (data.success) {
        const subSubcats = [...new Set(data.entities.map((e: TaxonomyEntity) => e.sub_subcategory))].sort() as string[];
        setSubSubcategories(subSubcats);
      }
    } catch (err) {
      console.error('Error loading sub-subcategories:', err);
    }
  };

  const loadEntities = async (category: string, subcategory?: string, subSubcategory?: string) => {
    try {
      const result = await getTaxonomyEntities({ category, subcategory, subSubcategory });
      const data = result.data as any;
      
      if (data.success) {
        setEntities(data.entities || []);
      }
    } catch (err) {
      console.error('Error loading entities:', err);
    }
  };

  const handleCategoryChange = (value: string) => {
    onCategoryChange(value);
    onSubcategoryChange('');
    onSubSubcategoryChange('');
    if (showEntitySelector) {
      onEntityChange(null);
    }
  };

  const handleSubcategoryChange = (value: string) => {
    onSubcategoryChange(value);
    onSubSubcategoryChange('');
    if (showEntitySelector) {
      onEntityChange(null);
    }
  };

  const handleSubSubcategoryChange = (value: string) => {
    onSubSubcategoryChange(value);
    if (showEntitySelector) {
      onEntityChange(null);
    }
  };

  const handleEntityChange = (value: string) => {
    const entity = entities.find(e => e.name === value);
    onEntityChange(entity || null);
  };

  const formatCategoryName = (category: string) => {
    return category.replace(/([A-Z])/g, ' $1').trim();
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="text-sm text-gray-600 mt-2">Loading taxonomy...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-600">{error}</p>
        <button 
          onClick={loadTaxonomy}
          className="mt-2 text-sm text-red-700 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showStats && stats && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-2">Knowledge Base Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Entities:</span>
              <p className="font-semibold">{stats.totalEntities.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-600">Categories:</span>
              <p className="font-semibold">{stats.categories}</p>
            </div>
            <div>
              <span className="text-gray-600">Subcategories:</span>
              <p className="font-semibold">{stats.subcategories}</p>
            </div>
            <div>
              <span className="text-gray-600">Sub-subcategories:</span>
              <p className="font-semibold">{stats.subSubcategories}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={selectedCategory || ''}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>
                {formatCategoryName(category)}
                {stats && ` (${stats.categoryDistribution[category] || 0})`}
              </option>
            ))}
          </select>
        </div>

        {/* Subcategory Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subcategory
          </label>
          <select
            value={selectedSubcategory || ''}
            onChange={(e) => handleSubcategoryChange(e.target.value)}
            disabled={!selectedCategory || subcategories.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">All Subcategories</option>
            {subcategories.map(subcategory => (
              <option key={subcategory} value={subcategory}>
                {subcategory}
              </option>
            ))}
          </select>
        </div>

        {/* Sub-subcategory Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sub-subcategory
          </label>
          <select
            value={selectedSubSubcategory || ''}
            onChange={(e) => handleSubSubcategoryChange(e.target.value)}
            disabled={!selectedSubcategory || subSubcategories.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">All Sub-subcategories</option>
            {subSubcategories.map(subSubcategory => (
              <option key={subSubcategory} value={subSubcategory}>
                {subSubcategory}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Entity Selector (if enabled) */}
      {showEntitySelector && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Specific Entity
          </label>
          <select
            value={selectedEntity || ''}
            onChange={(e) => handleEntityChange(e.target.value)}
            disabled={entities.length === 0}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">Select Entity</option>
            {entities.map(entity => (
              <option key={entity.name} value={entity.name}>
                {entity.name}
                {entity.completenessScore && ` (Score: ${Math.round(entity.completenessScore)})`}
              </option>
            ))}
          </select>
          {entities.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {entities.length} entities available
            </p>
          )}
        </div>
      )}

      {/* Entity List Display (for informational context) */}
      {showEntityList && !showEntitySelector && entities.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-2">
            Topics covered in this category:
          </h4>
          <div className="flex flex-wrap gap-2">
            {entities.slice(0, 12).map(entity => (
              <span
                key={entity.name}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-700"
              >
                {entity.name}
              </span>
            ))}
            {entities.length > 12 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                +{entities.length - 12} more topics
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            This selection includes {entities.length} dermatology topics
          </p>
        </div>
      )}

      {/* Selection Summary */}
      {(selectedCategory || selectedSubcategory || selectedSubSubcategory) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="font-medium text-blue-900 mb-1">Selection:</h4>
          <p className="text-sm text-blue-800">
            {selectedCategory && formatCategoryName(selectedCategory)}
            {selectedSubcategory && ` → ${selectedSubcategory}`}
            {selectedSubSubcategory && ` → ${selectedSubSubcategory}`}
            {showEntitySelector && selectedEntity && ` → ${selectedEntity}`}
          </p>
        </div>
      )}
    </div>
  );
}