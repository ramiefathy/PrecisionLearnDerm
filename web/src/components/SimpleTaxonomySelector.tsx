import TaxonomySelector from './TaxonomySelector';

interface SimpleTaxonomySelectorProps {
  value: {
    category?: string;
    subcategory?: string;
    subSubcategory?: string;
  } | null;
  onChange: (selection: {
    category?: string;
    subcategory?: string;
    subSubcategory?: string;
  } | null) => void;
  showStats?: boolean;
}

/**
 * Simplified wrapper around TaxonomySelector for user-facing quiz configuration
 * Hides entity selection and shows entities as informational context only
 */
export function SimpleTaxonomySelector({ value, onChange, showStats = false }: SimpleTaxonomySelectorProps) {
  const handleCategoryChange = (category: string) => {
    onChange(category ? { category } : null);
  };

  const handleSubcategoryChange = (subcategory: string) => {
    if (!value?.category) return;
    onChange(subcategory ? { ...value, subcategory } : { category: value.category });
  };

  const handleSubSubcategoryChange = (subSubcategory: string) => {
    if (!value?.category || !value?.subcategory) return;
    onChange(subSubcategory ? { ...value, subSubcategory } : { category: value.category, subcategory: value.subcategory });
  };

  const handleEntityChange = () => {
    // No-op for user-facing interface
  };

  return (
    <TaxonomySelector
      selectedCategory={value?.category || ''}
      selectedSubcategory={value?.subcategory || ''}
      selectedSubSubcategory={value?.subSubcategory || ''}
      onCategoryChange={handleCategoryChange}
      onSubcategoryChange={handleSubcategoryChange}
      onSubSubcategoryChange={handleSubSubcategoryChange}
      onEntityChange={handleEntityChange}
      showEntitySelector={false} // Users cannot select specific entities
      showEntityList={true}      // But show what entities are included
      showStats={showStats}
    />
  );
}