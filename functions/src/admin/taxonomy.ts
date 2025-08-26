import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { requireAdmin } from '../util/auth';

export const admin_listUncategorized = functions.https.onCall(async (data: any, context) => {
	try {
		requireAdmin(context);

		const limit = Math.min(Number(data?.limit || 50), 200);

		const db = admin.firestore();
		const itemsRef = db.collection('items');

		// Find items without taxonomy tags
		const snapshot = await itemsRef
			.where('categoryId', '==', null)
			.limit(limit)
			.get();

		const uncategorizedItems = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data()
		}));

		return {
			success: true,
			items: uncategorizedItems,
			count: uncategorizedItems.length,
			limit
		};

	} catch (error: any) {
		console.error('Error listing uncategorized items:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
});

export const admin_setItemTaxonomy = functions.https.onCall(async (data: any, context: any) => {
	try {
		requireAdmin(context);

		const { itemId, categoryId, topicId, subtopicId } = data || {};

		if (!itemId) {
			throw new Error('Missing required parameter: itemId');
		}

		const db = admin.firestore();
		const itemRef = db.collection('items').doc(itemId);

		const itemDoc = await itemRef.get();
		if (!itemDoc.exists) {
			throw new Error('Item not found');
		}

		// Update taxonomy fields
		const updateData: any = {
			updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			taxonomyUpdatedBy: context?.auth?.uid || 'admin',
			taxonomyUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
		};

		if (categoryId !== undefined) updateData.categoryId = categoryId;
		if (topicId !== undefined) updateData.topicId = topicId;
		if (subtopicId !== undefined) updateData.subtopicId = subtopicId;

		await itemRef.update(updateData);

		return {
			success: true,
			message: 'Item taxonomy updated successfully',
			itemId,
			updates: updateData
		};

	} catch (error: any) {
		console.error('Error setting item taxonomy:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}); 