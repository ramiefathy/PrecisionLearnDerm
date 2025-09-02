/**
 * Extract lightweight taxonomy-only data from the full knowledge base
 * This creates a minimal file with just the hierarchical structure
 */

import * as fs from 'fs';
import * as path from 'path';

interface TaxonomyOnlyEntity {
  name: string;
  category: string;
  subcategory: string;
  sub_subcategory: string;
  completenessScore?: number;
  entityId?: string;
}

interface TaxonomyOnlyData {
  taxonomy: {
    version: string;
    lastUpdated: string;
    entityCount: number;
    categories: {
      [category: string]: {
        count: number;
        subcategories: {
          [subcategory: string]: {
            count: number;
            subSubcategories: {
              [subSubcategory: string]: {
                count: number;
                entities: TaxonomyOnlyEntity[];
              };
            };
          };
        };
      };
    };
  };
  metadata: {
    source: string;
    purpose: string;
    fileSize?: string;
  };
}

function extractTaxonomy() {
  try {
    console.log('Starting taxonomy extraction...');
    
    // Find the full KB file
    const kbPath = path.join(__dirname, '../kb/knowledgeBase.json');
    
    if (!fs.existsSync(kbPath)) {
      console.error(`Knowledge base not found at ${kbPath}`);
      process.exit(1);
    }
    
    // Read and parse the full KB
    console.log('Reading full knowledge base...');
    const rawData = fs.readFileSync(kbPath, 'utf-8');
    const fullKB = JSON.parse(rawData);
    
    console.log(`Full KB size: ${(rawData.length / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Total entities: ${fullKB.entities?.length || 0}`);
    
    // Initialize the taxonomy structure
    const taxonomyData: TaxonomyOnlyData = {
      taxonomy: {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        entityCount: 0,
        categories: {}
      },
      metadata: {
        source: 'extracted_from_full_kb',
        purpose: 'lightweight_taxonomy_only'
      }
    };
    
    let processedCount = 0;
    let skippedCount = 0;
    
    // Process each entity
    for (const entity of fullKB.entities) {
      if (!entity.taxonomy || !entity.taxonomy.name) {
        skippedCount++;
        continue;
      }
      
      const tax = entity.taxonomy;
      const category = tax.category || 'Unknown';
      const subcategory = tax.subcategory || 'General';
      const subSubcategory = tax.sub_subcategory || 'General';
      
      // Skip meta categories
      if (category === 'Taxonomy' || category === 'Hubs') {
        skippedCount++;
        continue;
      }
      
      // Create minimal taxonomy entity (no medical content)
      const taxonomyEntity: TaxonomyOnlyEntity = {
        name: tax.name,
        category,
        subcategory,
        sub_subcategory: subSubcategory,
        completenessScore: entity.completeness_score,
        entityId: entity.id || tax.name.toLowerCase().replace(/\s+/g, '_')
      };
      
      // Build hierarchical structure
      if (!taxonomyData.taxonomy.categories[category]) {
        taxonomyData.taxonomy.categories[category] = {
          count: 0,
          subcategories: {}
        };
      }
      
      if (!taxonomyData.taxonomy.categories[category].subcategories[subcategory]) {
        taxonomyData.taxonomy.categories[category].subcategories[subcategory] = {
          count: 0,
          subSubcategories: {}
        };
      }
      
      if (!taxonomyData.taxonomy.categories[category].subcategories[subcategory].subSubcategories[subSubcategory]) {
        taxonomyData.taxonomy.categories[category].subcategories[subcategory].subSubcategories[subSubcategory] = {
          count: 0,
          entities: []
        };
      }
      
      // Add entity to the structure
      taxonomyData.taxonomy.categories[category].subcategories[subcategory].subSubcategories[subSubcategory].entities.push(taxonomyEntity);
      
      // Update counts
      taxonomyData.taxonomy.categories[category].count++;
      taxonomyData.taxonomy.categories[category].subcategories[subcategory].count++;
      taxonomyData.taxonomy.categories[category].subcategories[subcategory].subSubcategories[subSubcategory].count++;
      
      processedCount++;
    }
    
    taxonomyData.taxonomy.entityCount = processedCount;
    
    // Write the lightweight taxonomy file
    const outputPath = path.join(__dirname, '../kb/taxonomyOnly.json');
    const outputData = JSON.stringify(taxonomyData, null, 2);
    fs.writeFileSync(outputPath, outputData, 'utf-8');
    
    const outputSize = Buffer.byteLength(outputData, 'utf-8');
    taxonomyData.metadata.fileSize = `${(outputSize / 1024).toFixed(2)} KB`;
    
    // Write again with file size included
    fs.writeFileSync(outputPath, JSON.stringify(taxonomyData, null, 2), 'utf-8');
    
    // Print statistics
    console.log('\n✅ Taxonomy extraction complete!');
    console.log(`   Output file: ${outputPath}`);
    console.log(`   File size: ${(outputSize / 1024).toFixed(2)} KB (vs ${(rawData.length / 1024 / 1024).toFixed(2)} MB original)`);
    console.log(`   Size reduction: ${((1 - outputSize / rawData.length) * 100).toFixed(1)}%`);
    console.log(`   Entities processed: ${processedCount}`);
    console.log(`   Entities skipped: ${skippedCount}`);
    console.log(`   Categories: ${Object.keys(taxonomyData.taxonomy.categories).length}`);
    
    // Print category breakdown
    console.log('\nCategory breakdown:');
    for (const [category, data] of Object.entries(taxonomyData.taxonomy.categories)) {
      console.log(`   ${category}: ${data.count} entities`);
    }
    
  } catch (error) {
    console.error('Error extracting taxonomy:', error);
    process.exit(1);
  }
}

// Run the extraction
extractTaxonomy();