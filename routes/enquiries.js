import express from 'express';
import { Query } from 'node-appwrite';
import { db } from '../config/appwriteClient.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

const DB_ID = process.env.APPWRITE_DATABASE_ID;
const ENQUIRY_COLL_ID = process.env.ENQUIRY_COLLECTION_ID;
const TRASH_COLL_ID = process.env.ENQUIRY_TRASH_COLLECTION_ID;
const USERS_COLL_ID = process.env.USERS_COLLECTION_ID;

router.use(authMiddleware); // ✅ Middleware for all enquiry routes

// 🔍 Get Enquiries
router.get('/list', async (req, res) => {
  const role = req.user.role;
  const username = req.user.username;

  try {
    let queries = [];
    if (role === 'employee') {
      queries.push(Query.equal('username', username));
    }

    const enquiries = await db.listDocuments(DB_ID, ENQUIRY_COLL_ID, queries);
    const users = await db.listDocuments(DB_ID, USERS_COLL_ID);
    const usernameToName = Object.fromEntries(users.documents.map(user => [user.username, user.name]));

    const enriched = enquiries.documents.map(e => ({
      ...e,
      employeeName: usernameToName[e.username] || 'Unknown'
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➕ Create Enquiry
router.post('/new', async (req, res) => {
  const data = req.body;
  const currentUser = req.user;

  data.createdAt = new Date().toISOString();
  data.createdBy = currentUser.username;
  data.username = currentUser.username; // employee ID for filtering
  data.updatedAt = null;
  data.updateHistory = [];

  try {
    // 🔍 Fetch name of user from Users collection
    const userDetails = await db.getDocument(DB_ID, USERS_COLL_ID, currentUser.$id);
    data.employeeName = userDetails.name;

    const result = await db.createDocument(DB_ID, ENQUIRY_COLL_ID, 'unique()', data);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.put('/update/:id', async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const updates = req.body;

  try {
    const enquiry = await db.getDocument(DB_ID, ENQUIRY_COLL_ID, id);
    const updatedAt = new Date().toISOString();
    updates.updatedAt = updatedAt;

    const changeLogEntries = [];

    for (const key in updates) {
      if (['updateHistory', 'updatedAt'].includes(key)) continue;

      const oldVal = enquiry[key];
      const newVal = updates[key];

      if (oldVal !== newVal) {
        changeLogEntries.push(`${key}: ${oldVal} ➝ ${newVal}`);
      }
    }

    let singleLog = `${currentUser.username} @ ${updatedAt}`;
    if (changeLogEntries.length > 0) {
      singleLog += ` | ${changeLogEntries.join(', ')}`;
    }

    const existingHistory = Array.isArray(enquiry.updateHistory) ? enquiry.updateHistory : [];
    updates.updateHistory = [...existingHistory, singleLog];

    const result = await db.updateDocument(DB_ID, ENQUIRY_COLL_ID, id, updates);
    res.json(result);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// 🗑️ Soft Delete Enquiry
router.delete('/delete/:id', async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const { deletionNotes } = req.body;

  try {
    const enquiry = await db.getDocument(DB_ID, ENQUIRY_COLL_ID, id);

    // Remove Appwrite system fields
    const { $id, $collectionId, $databaseId, ...cleanData } = enquiry;

    // Add trash metadata
    cleanData.deletedAt = new Date().toISOString();
    cleanData.deletedBy = currentUser.username;
    cleanData.deletionNotes = deletionNotes || '';

    // Save to trash collection
    await db.createDocument(DB_ID, TRASH_COLL_ID, 'unique()', cleanData);

    // Delete from original collection
    await db.deleteDocument(DB_ID, ENQUIRY_COLL_ID, id);

    res.json({ message: 'Enquiry moved to trash.' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔁 Recover from Trash
router.post('/recover/:id', async (req, res) => {
  try {
    const trashed = await db.getDocument(DB_ID, TRASH_COLL_ID, req.params.id);

    // Strip reserved Appwrite system fields
    const {
      $id, $collectionId, $databaseId, $createdAt, $updatedAt,
      deletedAt, deletedBy, deletionNotes,
      ...restoredData
    } = trashed;

    // Restore to main collection
    const result = await db.createDocument(DB_ID, ENQUIRY_COLL_ID, 'unique()', restoredData);

    // Delete from trash
    await db.deleteDocument(DB_ID, TRASH_COLL_ID, req.params.id);

    res.json({ message: 'Restored successfully', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ❌ Permanent Delete from Trash
router.delete('/permanentdelete/:id', async (req, res) => {
  try {
    await db.deleteDocument(DB_ID, TRASH_COLL_ID, req.params.id);
    res.json({ message: 'Permanently deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 🔍 List Trash Items
router.get('/trash', async (req, res) => {
  try {
    const trashItems = await db.listDocuments(DB_ID, TRASH_COLL_ID);
    res.json(trashItems.documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

          