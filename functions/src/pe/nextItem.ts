import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export const getNextItem = functions.https.onCall(async (data: any, context: any) => {
  try {
    const topicIds: string[] | undefined = data?.topicIds;
    const taxonomyFilter = data?.taxonomyFilter; // New taxonomy filtering
    
    // Allow either topicIds OR taxonomyFilter (not both required)
    if (!topicIds && !taxonomyFilter) {
      throw new Error('Either topicIds array or taxonomyFilter is required');
    }
    
    const db = admin.firestore();
    const userId = context?.auth?.uid;
    
    if (!userId) {
      throw new Error('User not authenticated');
    }
    
    // Get user's ability ratings for the topics
    const abilityRef = db.collection('userAbilities').doc(userId);
    const abilityDoc = await abilityRef.get();
    
    let userAbilities: any = {};
    if (abilityDoc.exists) {
      const abilityData = abilityDoc.data();
      userAbilities = abilityData?.topicAbilities || {};
    }
    
    // Build query based on filtering method
    const itemsRef = db.collection('items');
    let query: admin.firestore.Query = itemsRef;
    
    if (taxonomyFilter) {
      // Handle both single object (legacy) and array (new multi-select) formats
      const filters = Array.isArray(taxonomyFilter) ? taxonomyFilter : [taxonomyFilter];
      
      if (filters.length === 1) {
        // Single selection - use direct where clauses for efficiency
        const filter = filters[0];
        if (filter.category) {
          query = query.where('taxonomyCategory', '==', filter.category);
        }
        if (filter.subcategory) {
          query = query.where('taxonomySubcategory', '==', filter.subcategory);
        }
        if (filter.subSubcategory) {
          query = query.where('taxonomySubSubcategory', '==', filter.subSubcategory);
        }
        if (filter.entity) {
          query = query.where('taxonomyEntity', '==', filter.entity);
        }
      } else {
        // Multiple selections - need to build OR queries
        // For multiple taxonomy selections, we'll need to fetch all matching items
        // and filter in memory since Firestore doesn't support complex OR queries
        const allItems: any[] = [];
        
        for (const filter of filters) {
          let filterQuery: admin.firestore.Query = itemsRef.where('status', '==', 'active');
          
          // For each selection, we need to handle the hierarchy
          if (filter.subSubcategories && Object.keys(filter.subSubcategories).length > 0) {
            // User selected specific sub-subcategories within subcategories
            for (const [subcategory, subSubcategories] of Object.entries(filter.subSubcategories)) {
              if (Array.isArray(subSubcategories) && subSubcategories.length > 0) {
                // Query for each sub-subcategory
                for (const subSubcategory of subSubcategories) {
                  const specificQuery = itemsRef
                    .where('status', '==', 'active')
                    .where('taxonomyCategory', '==', filter.category)
                    .where('taxonomySubcategory', '==', subcategory)
                    .where('taxonomySubSubcategory', '==', subSubcategory)
                    .limit(20);
                  
                  const specificSnapshot = await specificQuery.get();
                  allItems.push(...specificSnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                  })));
                }
              } else {
                // All sub-subcategories in this subcategory
                const subcatQuery = itemsRef
                  .where('status', '==', 'active')
                  .where('taxonomyCategory', '==', filter.category)
                  .where('taxonomySubcategory', '==', subcategory)
                  .limit(20);
                
                const subcatSnapshot = await subcatQuery.get();
                allItems.push(...subcatSnapshot.docs.map(doc => ({
                  id: doc.id,
                  ...doc.data()
                })));
              }
            }
          } else if (filter.subcategories && filter.subcategories.length > 0) {
            // User selected subcategories but no specific sub-subcategories
            for (const subcategory of filter.subcategories) {
              const subcatQuery = itemsRef
                .where('status', '==', 'active')
                .where('taxonomyCategory', '==', filter.category)
                .where('taxonomySubcategory', '==', subcategory)
                .limit(20);
              
              const subcatSnapshot = await subcatQuery.get();
              allItems.push(...subcatSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })));
            }
          } else {
            // Entire category selected
            const catQuery = itemsRef
              .where('status', '==', 'active')
              .where('taxonomyCategory', '==', filter.category)
              .limit(20);
            
            const catSnapshot = await catQuery.get();
            allItems.push(...catSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })));
          }
        }
        
        // Remove duplicates based on item ID
        const uniqueItems = allItems.filter((item, index, arr) => 
          arr.findIndex(i => i.id === item.id) === index
        );
        
        // Continue with the collected items without executing query
        const items = uniqueItems;
        
        if (items.length === 0) {
          return {
            success: false,
            error: `No items found for the specified taxonomy filters`
          };
        }
        
        // Continue with scoring logic below...
        return await scoreAndReturnItems(items, userAbilities);
      }
    } 
    
    // Handle single selection or legacy topicIds
    if (topicIds && Array.isArray(topicIds) && topicIds.length > 0) {
      // Fallback to legacy topicIds filtering
      query = query.where('topicIds', 'array-contains-any', topicIds);
    }
    
    // Filter by status
    query = query.where('status', '==', 'active');
    
    const snapshot = await query.limit(50).get();
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    return await scoreAndReturnItems(items, userAbilities, taxonomyFilter ? 'taxonomy filter' : 'topics');
  } catch (error: any) {
    console.error('Error getting next item:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
});

// Helper function to score and return items
async function scoreAndReturnItems(items: any[], userAbilities: any, filterType: string = 'filter'): Promise<any> {
  if (items.length === 0) {
    return {
      success: false,
      error: `No items found for the specified ${filterType}`
    };
  }
  
  // Score items based on user ability and item difficulty
  const scoredItems = items.map(item => {
    const topicAbility = userAbilities[item.topicIds?.[0]] || 1500;
    const difficulty = item.difficulty || 0.5;
    
    // Calculate score (higher is better)
    const score = topicAbility - (difficulty * 1000);
    
    return {
      ...item,
      score
    };
  });
  
  // Sort by score and return the best match
  scoredItems.sort((a, b) => b.score - a.score);
  
  return {
    success: true,
    item: scoredItems[0],
    alternatives: scoredItems.slice(1, 4),
    totalAvailable: scoredItems.length
  };
}
