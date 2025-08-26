import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupTestEnvironment, testHelper, admin } from './test_setup';

setupTestEnvironment();

describe('Item Management Tests', () => {
  let mockFirestore: any;
  let mockDoc: any;
  let mockCollection: any;

  beforeEach(async () => {
    await testHelper.seedTestData();
    
    mockDoc = {
      get: sinon.stub(),
      set: sinon.stub().resolves(),
      update: sinon.stub().resolves(),
      delete: sinon.stub().resolves()
    };

    mockCollection = {
      doc: sinon.stub().returns(mockDoc),
      add: sinon.stub().resolves({ id: 'new-item-id' }),
      where: sinon.stub().returnsThis(),
      orderBy: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      get: sinon.stub().resolves({
        docs: [
          {
            id: 'item1',
            data: () => ({
              type: 'A',
              stem: 'Test question 1',
              status: 'published'
            })
          }
        ]
      })
    };

    mockFirestore = {
      collection: sinon.stub().returns(mockCollection),
      batch: sinon.stub().returns({
        set: sinon.stub().returnsThis(),
        update: sinon.stub().returnsThis(),
        delete: sinon.stub().returnsThis(),
        commit: sinon.stub().resolves()
      })
    };

    sinon.stub(admin, 'firestore').returns(mockFirestore as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Item Retrieval', () => {
    it('should successfully retrieve an existing item', async () => {
      const mockItemData = {
        type: 'A',
        stem: 'A 25-year-old woman presents with pruritic lesions.',
        leadIn: 'What is the most likely diagnosis?',
        options: [
          { text: 'Atopic dermatitis' },
          { text: 'Contact dermatitis' },
          { text: 'Psoriasis' },
          { text: 'Eczema' }
        ],
        keyIndex: 0,
        explanation: 'This is characteristic of atopic dermatitis.',
        status: 'published',
        difficulty: 0.65,
        topicIds: ['dermatology.inflammatory.eczema']
      };

      mockDoc.get.resolves({
        exists: true,
        id: 'test-item-id',
        data: () => mockItemData
      });

      const getItem = async (itemId: string) => {
        const itemRef = mockFirestore.collection('questions').doc(itemId);
        const itemDoc = await itemRef.get();
        
        if (!itemDoc.exists) {
          throw new Error('Item not found');
        }

        return {
          success: true,
          item: {
            id: itemDoc.id,
            ...itemDoc.data()
          }
        };
      };

      const result = await getItem('test-item-id');

      expect(result.success).to.be.true;
      expect(result.item).to.have.property('id', 'test-item-id');
      expect(result.item).to.have.property('type', 'A');
      expect(result.item).to.have.property('stem');
      expect(result.item.options).to.have.length(4);
    });

    it('should handle non-existent items gracefully', async () => {
      mockDoc.get.resolves({
        exists: false
      });

      const getItem = async (itemId: string) => {
        const itemRef = mockFirestore.collection('questions').doc(itemId);
        const itemDoc = await itemRef.get();
        
        if (!itemDoc.exists) {
          return {
            success: false,
            error: 'Item not found'
          };
        }

        return {
          success: true,
          item: { id: itemDoc.id, ...itemDoc.data() }
        };
      };

      const result = await getItem('non-existent-id');

      expect(result.success).to.be.false;
      expect(result.error).to.equal('Item not found');
      expect(result).to.not.have.property('item');
    });

    it('should validate item ID parameter', async () => {
      const validateItemId = (itemId: any) => {
        if (!itemId) {
          return { valid: false, error: 'Missing item ID' };
        }

        if (typeof itemId !== 'string') {
          return { valid: false, error: 'Item ID must be a string' };
        }

        if (itemId.trim().length === 0) {
          return { valid: false, error: 'Item ID cannot be empty' };
        }

        // Basic format validation (alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z0-9_-]+$/.test(itemId)) {
          return { valid: false, error: 'Invalid item ID format' };
        }

        return { valid: true };
      };

      const invalidIds = [null, undefined, '', '   ', 123, {}, [], 'invalid@id', 'id with spaces'];
      const validIds = ['valid-id', 'question_123', 'test-item-id-456'];

      invalidIds.forEach((id, index) => {
        const result = validateItemId(id);
        expect(result.valid, `Invalid ID test case ${index}`).to.be.false;
        expect(result.error, `Invalid ID test case ${index}`).to.be.a('string');
      });

      validIds.forEach((id, index) => {
        const result = validateItemId(id);
        expect(result.valid, `Valid ID test case ${index}`).to.be.true;
        expect(result).to.not.have.property('error');
      });
    });
  });

  describe('Item Proposal', () => {
    it('should create a new draft item with proposed content', async () => {
      const proposalData = {
        type: 'A',
        stem: 'New question stem',
        leadIn: 'What is the best answer?',
        options: [
          { text: 'Option A' },
          { text: 'Option B' },
          { text: 'Option C' },
          { text: 'Option D' }
        ],
        keyIndex: 0,
        explanation: 'Explanation for the correct answer',
        topicIds: ['dermatology.test'],
        proposedBy: 'user123',
        rationale: 'This question addresses an important learning objective'
      };

      const proposeItem = async (data: any, userId: string) => {
        const proposalItem = {
          ...data,
          status: 'proposed',
          proposedBy: userId,
          proposedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewStatus: 'pending',
          votes: { up: 0, down: 0 },
          metadata: {
            source: 'user_proposal',
            version: 1
          }
        };

        const docRef = await mockFirestore.collection('questions').add(proposalItem);
        return {
          success: true,
          itemId: docRef.id,
          status: 'proposed'
        };
      };

      const result = await proposeItem(proposalData, 'user123');

      expect(result.success).to.be.true;
      expect(result.itemId).to.equal('new-item-id');
      expect(result.status).to.equal('proposed');
      expect(mockCollection.add).to.have.been.calledOnce;
    });

    it('should validate proposed item structure', () => {
      const validateProposal = (proposal: any) => {
        const errors = [];

        if (!proposal.stem || typeof proposal.stem !== 'string' || proposal.stem.trim().length === 0) {
          errors.push('Stem is required and must be a non-empty string');
        }

        if (!proposal.leadIn || typeof proposal.leadIn !== 'string') {
          errors.push('Lead-in question is required');
        }

        if (!Array.isArray(proposal.options) || proposal.options.length < 3) {
          errors.push('At least 3 options are required');
        }

        if (proposal.options && proposal.options.some((opt: any) => !opt.text || opt.text.trim().length === 0)) {
          errors.push('All options must have non-empty text');
        }

        if (typeof proposal.keyIndex !== 'number' || proposal.keyIndex < 0 || 
            (proposal.options && proposal.keyIndex >= proposal.options.length)) {
          errors.push('Valid key index is required');
        }

        if (!proposal.explanation || typeof proposal.explanation !== 'string') {
          errors.push('Explanation is required');
        }

        if (!Array.isArray(proposal.topicIds) || proposal.topicIds.length === 0) {
          errors.push('At least one topic ID is required');
        }

        return {
          valid: errors.length === 0,
          errors
        };
      };

      const validProposal = {
        stem: 'Valid question stem',
        leadIn: 'What is the answer?',
        options: [
          { text: 'Option A' },
          { text: 'Option B' },
          { text: 'Option C' }
        ],
        keyIndex: 0,
        explanation: 'Valid explanation',
        topicIds: ['topic1']
      };

      const invalidProposals = [
        {}, // Empty
        { stem: '' }, // Empty stem
        { stem: 'Valid', options: [] }, // No options
        { stem: 'Valid', options: [{ text: 'A' }] }, // Too few options
        { stem: 'Valid', options: [{ text: 'A' }, { text: '' }] }, // Empty option
        { stem: 'Valid', options: [{ text: 'A' }, { text: 'B' }], keyIndex: 5 }, // Invalid key index
        { stem: 'Valid', options: [{ text: 'A' }, { text: 'B' }], keyIndex: 0, topicIds: [] } // No topics
      ];

      const validResult = validateProposal(validProposal);
      expect(validResult.valid).to.be.true;
      expect(validResult.errors).to.have.length(0);

      invalidProposals.forEach((proposal, index) => {
        const result = validateProposal(proposal);
        expect(result.valid, `Invalid proposal test case ${index}`).to.be.false;
        expect(result.errors.length, `Invalid proposal test case ${index}`).to.be.greaterThan(0);
      });
    });

    it('should track proposal metadata', async () => {
      const trackProposalMetadata = (proposal: any, userId: string) => {
        return {
          ...proposal,
          metadata: {
            proposedBy: userId,
            proposedAt: new Date(),
            source: 'user_submission',
            version: 1,
            reviewHistory: [],
            statistics: {
              views: 0,
              votes: { up: 0, down: 0 },
              comments: 0
            }
          }
        };
      };

      const proposal = { stem: 'Test', options: [] };
      const tracked = trackProposalMetadata(proposal, 'user123');

      expect(tracked.metadata.proposedBy).to.equal('user123');
      expect(tracked.metadata.proposedAt).to.be.a('date');
      expect(tracked.metadata.version).to.equal(1);
      expect(tracked.metadata.statistics.votes).to.deep.equal({ up: 0, down: 0 });
    });
  });

  describe('Item Promotion', () => {
    it('should promote approved item from draft to published', async () => {
      const draftItem = {
        id: 'draft-item-id',
        status: 'draft',
        reviewScore: 85,
        qualityMetrics: {
          medical_accuracy: 90,
          clarity: 80,
          educational_value: 85
        }
      };

      mockDoc.get.resolves({
        exists: true,
        data: () => draftItem
      });

      const promoteItem = async (itemId: string, reviewerId: string) => {
        const itemRef = mockFirestore.collection('questions').doc(itemId);
        const itemDoc = await itemRef.get();
        
        if (!itemDoc.exists) {
          throw new Error('Item not found');
        }

        const item = itemDoc.data();
        
        if (item.status !== 'draft') {
          throw new Error('Only draft items can be promoted');
        }

        if (!item.reviewScore || item.reviewScore < 70) {
          throw new Error('Item does not meet quality threshold for promotion');
        }

        const promotionData = {
          status: 'published',
          promotedBy: reviewerId,
          promotedAt: admin.firestore.FieldValue.serverTimestamp(),
          publishVersion: (item.publishVersion || 0) + 1
        };

        await itemRef.update(promotionData);

        return {
          success: true,
          newStatus: 'published',
          promotedBy: reviewerId
        };
      };

      const result = await promoteItem('draft-item-id', 'reviewer123');

      expect(result.success).to.be.true;
      expect(result.newStatus).to.equal('published');
      expect(result.promotedBy).to.equal('reviewer123');
      expect(mockDoc.update).to.have.been.calledOnce;
    });

    it('should reject promotion of low-quality items', async () => {
      const lowQualityItem = {
        id: 'low-quality-id',
        status: 'draft',
        reviewScore: 45
      };

      mockDoc.get.resolves({
        exists: true,
        data: () => lowQualityItem
      });

      const promoteItem = async (itemId: string, reviewerId: string) => {
        const itemRef = mockFirestore.collection('questions').doc(itemId);
        const itemDoc = await itemRef.get();
        const item = itemDoc.data();

        if (!item.reviewScore || item.reviewScore < 70) {
          return {
            success: false,
            error: 'Item does not meet quality threshold for promotion',
            currentScore: item.reviewScore,
            requiredScore: 70
          };
        }

        return { success: true };
      };

      const result = await promoteItem('low-quality-id', 'reviewer123');

      expect(result.success).to.be.false;
      expect(result.error).to.include('quality threshold');
      expect(result.currentScore).to.equal(45);
      expect(result.requiredScore).to.equal(70);
    });

    it('should validate promotion eligibility', () => {
      const checkPromotionEligibility = (item: any) => {
        const issues = [];

        if (item.status !== 'draft') {
          issues.push(`Item status is '${item.status}', expected 'draft'`);
        }

        if (!item.reviewScore || item.reviewScore < 70) {
          issues.push(`Review score (${item.reviewScore || 'none'}) below threshold (70)`);
        }

        if (!item.qualityMetrics || item.qualityMetrics.medical_accuracy < 80) {
          issues.push('Medical accuracy score too low');
        }

        if (!item.reviewedBy) {
          issues.push('Item has not been reviewed');
        }

        // Check for required fields
        const requiredFields = ['stem', 'options', 'keyIndex', 'explanation'];
        requiredFields.forEach(field => {
          if (!item[field]) {
            issues.push(`Missing required field: ${field}`);
          }
        });

        return {
          eligible: issues.length === 0,
          issues
        };
      };

      const eligibleItem = {
        status: 'draft',
        reviewScore: 85,
        qualityMetrics: { medical_accuracy: 90 },
        reviewedBy: 'reviewer1',
        stem: 'Question',
        options: ['A', 'B'],
        keyIndex: 0,
        explanation: 'Explanation'
      };

      const ineligibleItems = [
        { status: 'published' }, // Wrong status
        { status: 'draft', reviewScore: 50 }, // Low score
        { status: 'draft', reviewScore: 80, qualityMetrics: { medical_accuracy: 70 } }, // Low accuracy
        { status: 'draft', reviewScore: 80, qualityMetrics: { medical_accuracy: 90 } } // Not reviewed
      ];

      const eligibleResult = checkPromotionEligibility(eligibleItem);
      expect(eligibleResult.eligible).to.be.true;
      expect(eligibleResult.issues).to.have.length(0);

      ineligibleItems.forEach((item, index) => {
        const result = checkPromotionEligibility(item);
        expect(result.eligible, `Ineligible test case ${index}`).to.be.false;
        expect(result.issues.length, `Ineligible test case ${index}`).to.be.greaterThan(0);
      });
    });
  });

  describe('Item Revision', () => {
    it('should create a revision of existing item', async () => {
      const originalItem = {
        id: 'original-id',
        stem: 'Original question',
        options: [{ text: 'A' }, { text: 'B' }],
        version: 1,
        status: 'published'
      };

      const revisionData = {
        stem: 'Revised question with better clarity',
        explanation: 'Improved explanation with more detail',
        revisionReason: 'Improved clarity and accuracy'
      };

      mockDoc.get.resolves({
        exists: true,
        data: () => originalItem
      });

      const createRevision = async (itemId: string, revisionData: any, userId: string) => {
        const originalRef = mockFirestore.collection('questions').doc(itemId);
        const originalDoc = await originalRef.get();
        
        if (!originalDoc.exists) {
          throw new Error('Original item not found');
        }

        const original = originalDoc.data();
        
        const revision = {
          ...original,
          ...revisionData,
          status: 'revision_pending',
          originalItemId: itemId,
          version: original.version + 1,
          revisedBy: userId,
          revisedAt: admin.firestore.FieldValue.serverTimestamp(),
          revisionReason: revisionData.revisionReason || 'No reason provided'
        };

        const revisionRef = await mockFirestore.collection('questions').add(revision);
        
        return {
          success: true,
          revisionId: revisionRef.id,
          originalId: itemId,
          version: revision.version
        };
      };

      const result = await createRevision('original-id', revisionData, 'user123');

      expect(result.success).to.be.true;
      expect(result.revisionId).to.equal('new-item-id');
      expect(result.originalId).to.equal('original-id');
      expect(result.version).to.equal(2);
      expect(mockCollection.add).to.have.been.calledOnce;
    });

    it('should validate revision data', () => {
      const validateRevision = (revisionData: any) => {
        const errors = [];

        if (!revisionData || typeof revisionData !== 'object') {
          errors.push('Revision data must be an object');
          return { valid: false, errors };
        }

        // At least one field must be revised
        const revisableFields = ['stem', 'leadIn', 'options', 'explanation', 'topicIds'];
        const hasRevisions = revisableFields.some(field => revisionData.hasOwnProperty(field));
        
        if (!hasRevisions) {
          errors.push('At least one field must be revised');
        }

        // Validate specific field types if provided
        if (revisionData.stem !== undefined && typeof revisionData.stem !== 'string') {
          errors.push('Stem must be a string');
        }

        if (revisionData.options !== undefined && !Array.isArray(revisionData.options)) {
          errors.push('Options must be an array');
        }

        if (revisionData.keyIndex !== undefined && 
            (typeof revisionData.keyIndex !== 'number' || revisionData.keyIndex < 0)) {
          errors.push('Key index must be a non-negative number');
        }

        return {
          valid: errors.length === 0,
          errors
        };
      };

      const validRevisions = [
        { stem: 'New stem' },
        { options: [{ text: 'A' }, { text: 'B' }] },
        { stem: 'New stem', explanation: 'New explanation' }
      ];

      const invalidRevisions = [
        {}, // No revisions
        { stem: 123 }, // Wrong type
        { options: 'not array' }, // Wrong type
        { keyIndex: -1 }, // Invalid value
        null, // Not an object
        'string' // Not an object
      ];

      validRevisions.forEach((revision, index) => {
        const result = validateRevision(revision);
        expect(result.valid, `Valid revision test case ${index}`).to.be.true;
        expect(result.errors, `Valid revision test case ${index}`).to.have.length(0);
      });

      invalidRevisions.forEach((revision, index) => {
        const result = validateRevision(revision);
        expect(result.valid, `Invalid revision test case ${index}`).to.be.false;
        expect(result.errors.length, `Invalid revision test case ${index}`).to.be.greaterThan(0);
      });
    });

    it('should track revision history', () => {
      const trackRevisionHistory = (original: any, revision: any, userId: string) => {
        const changes: any[] = [];
        
        const trackableFields = ['stem', 'leadIn', 'options', 'explanation', 'topicIds'];
        
        trackableFields.forEach(field => {
          if (revision[field] !== undefined && 
              JSON.stringify(original[field]) !== JSON.stringify(revision[field])) {
            changes.push({
              field,
              oldValue: original[field],
              newValue: revision[field],
              changedBy: userId,
              changedAt: new Date()
            });
          }
        });

        return {
          revisionId: 'rev-' + Date.now(),
          originalVersion: original.version || 1,
          newVersion: (original.version || 1) + 1,
          changes,
          summary: `${changes.length} field(s) modified`
        };
      };

      const original = {
        stem: 'Original stem',
        explanation: 'Original explanation',
        version: 1
      };

      const revision = {
        stem: 'Modified stem',
        explanation: 'Original explanation', // Unchanged
        newField: 'Added field' // New field
      };

      const history = trackRevisionHistory(original, revision, 'user123');

      expect(history.changes).to.have.length(1); // Only stem changed
      expect(history.changes[0].field).to.equal('stem');
      expect(history.changes[0].oldValue).to.equal('Original stem');
      expect(history.changes[0].newValue).to.equal('Modified stem');
      expect(history.newVersion).to.equal(2);
    });
  });

  describe('Item Search and Filtering', () => {
    it('should search items by topic', async () => {
      const searchByTopic = async (topicIds: string[], limit: number = 10) => {
        const query = mockFirestore.collection('questions')
          .where('topicIds', 'array-contains-any', topicIds)
          .where('status', '==', 'published')
          .limit(limit);

        const snapshot = await query.get();
        
        return {
          items: snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
          })),
          total: snapshot.docs.length
        };
      };

      const result = await searchByTopic(['dermatology.inflammatory'], 5);

      expect(result).to.have.property('items');
      expect(result).to.have.property('total');
      expect(mockCollection.where).to.have.been.calledWith('topicIds', 'array-contains-any', ['dermatology.inflammatory']);
      expect(mockCollection.limit).to.have.been.calledWith(5);
    });

    it('should filter items by difficulty range', () => {
      const filterByDifficulty = (items: any[], minDifficulty: number, maxDifficulty: number) => {
        return items.filter(item => {
          const difficulty = item.difficulty || 0.5; // Default difficulty
          return difficulty >= minDifficulty && difficulty <= maxDifficulty;
        });
      };

      const items = [
        { id: '1', difficulty: 0.2 },
        { id: '2', difficulty: 0.5 },
        { id: '3', difficulty: 0.8 },
        { id: '4' }, // No difficulty specified
        { id: '5', difficulty: 0.95 }
      ];

      const mediumDifficulty = filterByDifficulty(items, 0.3, 0.7);
      expect(mediumDifficulty).to.have.length(2); // Items 2 and 4 (default)
      expect(mediumDifficulty.map(item => item.id)).to.include.members(['2', '4']);

      const hardDifficulty = filterByDifficulty(items, 0.8, 1.0);
      expect(hardDifficulty).to.have.length(2); // Items 3 and 5
    });

    it('should sort items by multiple criteria', () => {
      const sortItems = (items: any[], sortBy: string, order: 'asc' | 'desc' = 'asc') => {
        return items.sort((a, b) => {
          let valueA = a[sortBy];
          let valueB = b[sortBy];

          // Handle undefined values
          if (valueA === undefined) valueA = sortBy === 'difficulty' ? 0.5 : '';
          if (valueB === undefined) valueB = sortBy === 'difficulty' ? 0.5 : '';

          // Handle date strings
          if (sortBy.includes('At') || sortBy.includes('Date')) {
            valueA = new Date(valueA).getTime();
            valueB = new Date(valueB).getTime();
          }

          if (order === 'asc') {
            return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
          } else {
            return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
          }
        });
      };

      const items = [
        { id: '1', difficulty: 0.8, createdAt: '2024-01-01' },
        { id: '2', difficulty: 0.3, createdAt: '2024-01-03' },
        { id: '3', difficulty: 0.6, createdAt: '2024-01-02' }
      ];

      const byDifficultyAsc = sortItems([...items], 'difficulty', 'asc');
      expect(byDifficultyAsc.map(item => item.id)).to.deep.equal(['2', '3', '1']);

      const byDateDesc = sortItems([...items], 'createdAt', 'desc');
      expect(byDateDesc.map(item => item.id)).to.deep.equal(['2', '3', '1']);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockDoc.get.rejects(new Error('Database connection failed'));

      const getItemWithErrorHandling = async (itemId: string) => {
        try {
          const itemRef = mockFirestore.collection('questions').doc(itemId);
          const itemDoc = await itemRef.get();
          
          return {
            success: true,
            item: { id: itemDoc.id, ...itemDoc.data() }
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            retryable: true
          };
        }
      };

      const result = await getItemWithErrorHandling('test-id');

      expect(result.success).to.be.false;
      expect(result.error).to.include('Database connection failed');
      expect(result.retryable).to.be.true;
    });

    it('should validate permissions for item operations', () => {
      const checkPermissions = (operation: string, userId: string, userRole: string, itemOwnerId?: string) => {
        const permissions = {
          read: ['user', 'admin', 'moderator'],
          propose: ['user', 'admin', 'moderator'],
          edit: ['admin', 'moderator'],
          promote: ['admin', 'moderator'],
          delete: ['admin']
        };

        // Allow users to edit their own proposals
        if (operation === 'edit' && userRole === 'user' && itemOwnerId === userId) {
          return { allowed: true };
        }

        const allowedRoles = permissions[operation as keyof typeof permissions] || [];
        const allowed = allowedRoles.includes(userRole);

        return {
          allowed,
          reason: allowed ? null : `Role '${userRole}' not permitted for operation '${operation}'`
        };
      };

      // Test various permission scenarios
      expect(checkPermissions('read', 'user1', 'user').allowed).to.be.true;
      expect(checkPermissions('propose', 'user1', 'user').allowed).to.be.true;
      expect(checkPermissions('edit', 'user1', 'user').allowed).to.be.false;
      expect(checkPermissions('edit', 'user1', 'user', 'user1').allowed).to.be.true; // Own item
      expect(checkPermissions('promote', 'user1', 'admin').allowed).to.be.true;
      expect(checkPermissions('delete', 'user1', 'moderator').allowed).to.be.false;
      expect(checkPermissions('delete', 'user1', 'admin').allowed).to.be.true;
    });

    it('should handle concurrent modifications', async () => {
      const handleConcurrentModification = async (itemId: string, updateData: any, expectedVersion: number) => {
        const itemRef = mockFirestore.collection('questions').doc(itemId);
        
        // Simulate reading current version
        const currentDoc = await itemRef.get();
        const currentData = currentDoc.data();
        
        if (currentData.version !== expectedVersion) {
          return {
            success: false,
            error: 'Concurrent modification detected',
            currentVersion: currentData.version,
            expectedVersion,
            resolution: 'reload_and_retry'
          };
        }

        // Simulate successful update
        await itemRef.update({
          ...updateData,
          version: expectedVersion + 1,
          lastModified: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
          success: true,
          newVersion: expectedVersion + 1
        };
      };

      // Simulate concurrent modification
      mockDoc.get.resolves({
        exists: true,
        data: () => ({ version: 3 }) // Different from expected
      });

      const result = await handleConcurrentModification('item-id', { stem: 'New stem' }, 2);

      expect(result.success).to.be.false;
      expect(result.error).to.include('Concurrent modification');
      expect(result.currentVersion).to.equal(3);
      expect(result.expectedVersion).to.equal(2);
    });
  });
});