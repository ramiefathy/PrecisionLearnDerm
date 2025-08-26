import { expect } from 'chai';
import * as admin from 'firebase-admin';
import functionsTest from 'firebase-functions-test';
import './test_setup';
import { itemsGet } from '../items/get';

const test = functionsTest();

describe('Item Management Functions', () => {
  let db: admin.firestore.Firestore;

  before(() => {
    db = admin.firestore();
  });

  let testItem: any;

  beforeEach(async () => {
    // Create a test item
    const itemRef = db.collection('items').doc();
    testItem = {
      id: itemRef.id,
      stem: 'Test question',
      options: [
        { text: 'Option A', isCorrect: true },
        { text: 'Option B', isCorrect: false },
        { text: 'Option C', isCorrect: false },
        { text: 'Option D', isCorrect: false },
      ],
      explanation: 'Test explanation'
    };
    await itemRef.set(testItem);
  });

  afterEach(async () => {
    // Delete the test item
    await db.collection('items').doc(testItem.id).delete();
  });

  describe('itemsGet', () => {
    it('should return an item when a valid ID is provided', async () => {
      const wrapped = test.wrap(itemsGet);
      const result = await wrapped({ itemId: testItem.id }, { auth: { uid: 'test-user' } });
      expect(result.success).to.be.true;
      expect(result.item.id).to.equal(testItem.id);
    });

    it('should return an error when an invalid ID is provided', async () => {
      const wrapped = test.wrap(itemsGet);
      const result = await wrapped({ itemId: 'invalid-id' }, { auth: { uid: 'test-user' } });
      expect(result.success).to.be.false;
      expect(result.error).to.equal('Item not found');
    });

    it('should return an error when the user is not authenticated', async () => {
      const wrapped = test.wrap(itemsGet);
      try {
        await wrapped({ itemId: testItem.id }, {});
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).to.equal('Authentication required');
      }
    });
  });
});
