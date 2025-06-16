import express from "express";
import { Query } from "node-appwrite";
import { db } from "../config/appwriteClient.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

const DB_ID = process.env.APPWRITE_DATABASE_ID;
const PRODUCT_COLL_ID = process.env.PRODUCT_COLLECTION_ID;
const TRASH_COLL_ID = process.env.PRODUCT_TRASH_COLLECTION_ID;
const USERS_COLL_ID = process.env.USERS_COLLECTION_ID;

router.use(authMiddleware); //

router.post("/new", async (req, res) => {
  const data = req.body;
  const currentUser = req.user;

  data.createdAt = new Date().toISOString();
  data.createdBy = currentUser.username;
  data.username = currentUser.username;
  data.updatedAt = null;
  data.updateHistory = [];

  try {
    // 🔍 Generate customerId if not provided
    if (!data.prodId) {
      const existing = await db.listDocuments(DB_ID, PRODUCT_COLL_ID);
      const count = existing.total + 1;
      const paddedId = String(count).padStart(3, "0");
      data.prodId = `prod-${paddedId}`;
    }

    // 🔍 Get name of the employee creating the customer
    const userDetails = await db.getDocument(
      DB_ID,
      USERS_COLL_ID,
      currentUser.$id
    );
    data.employeeName = userDetails.name;

    const result = await db.createDocument(
      DB_ID,
      PRODUCT_COLL_ID,
      "unique()",
      data
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/list", async (req, res) => {
  try {
    // 🔍 Step 1: Fetch all customer documents
    const products = await db.listDocuments(DB_ID, PRODUCT_COLL_ID);

    // 🔍 Step 2: Fetch user data to map usernames → names
    const users = await db.listDocuments(DB_ID, USERS_COLL_ID);
    const usernameToName = Object.fromEntries(
      users.documents.map((user) => [user.username, user.name])
    );

    // 🔍 Step 3: Enrich each customer with employeeName
    const enrichedProduct = products.documents.map((product) => ({
      ...product, // All original fields including createdAt, createdBy, etc.
      employeeName: usernameToName[product.username] || "Unknown",
    }));

    // ✅ Send full enriched list
    res.json(enrichedProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user;
    const updates = req.body;

    const existingProduct = await db.getDocument(DB_ID, PRODUCT_COLL_ID, id);

    const updatedAt = new Date().toISOString();
    updates.updatedAt = updatedAt;

    // Prepare change log
    const changeLogEntries = [];

    for (const key in updates) {
      if (["updateHistory", "updatedAt"].includes(key)) continue;

      const oldVal = existingProduct[key];
      const newVal = updates[key];

      if (oldVal !== newVal) {
        changeLogEntries.push(`${key}: ${oldVal} ➝ ${newVal}`);
      }
    }

    let singleLog = `${currentUser.username} @ ${updatedAt}`;
    if (changeLogEntries.length > 0) {
      singleLog += ` | ${changeLogEntries.join(", ")}`;
    }

    const existingHistory = Array.isArray(existingProduct.updateHistory)
      ? existingProduct.updateHistory
      : [];

    updates.updateHistory = [...existingHistory, singleLog];

    const updatedProduct = await db.updateDocument(
      DB_ID,
      PRODUCT_COLL_ID,
      id,
      updates
    );

    res.json(updatedProduct);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🗑️ Soft Delete Enquiry
router.delete("/delete/:id", async (req, res) => {
  const { id } = req.params;
  const currentUser = req.user;
  const { deletionNotes } = req.body;

  try {
    const product = await db.getDocument(DB_ID, PRODUCT_COLL_ID, id);

    // Remove Appwrite system fields
    const { $id, $collectionId, $databaseId, ...cleanData } = product;

    // Add trash metadata
    cleanData.deletedAt = new Date().toISOString();
    cleanData.deletedBy = currentUser.username;
    cleanData.deletionNotes = deletionNotes || "";

    // Save to trash collection
    await db.createDocument(DB_ID, TRASH_COLL_ID, "unique()", cleanData);

    // Delete from original collection
    await db.deleteDocument(DB_ID, PRODUCT_COLL_ID, id);

    res.json({ message: "Customer moved to trash." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔁 Recover from Trash
router.post("/recover/:id", async (req, res) => {
  try {
    const trashed = await db.getDocument(DB_ID, TRASH_COLL_ID, req.params.id);

    // Strip reserved Appwrite system fields
    const {
      $id,
      $collectionId,
      $databaseId,
      $createdAt,
      $updatedAt,
      deletedAt,
      deletedBy,
      deletionNotes,
      ...restoredData
    } = trashed;

    // Restore to main collection
    const result = await db.createDocument(
      DB_ID,
      PRODUCT_COLL_ID,
      "unique()",
      restoredData
    );

    // Delete from trash
    await db.deleteDocument(DB_ID, TRASH_COLL_ID, req.params.id);

    res.json({ message: "Restored successfully", result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ❌ Permanent Delete from Trash
router.delete("/permanentdelete/:id", async (req, res) => {
  try {
    await db.deleteDocument(DB_ID, TRASH_COLL_ID, req.params.id);
    res.json({ message: "Permanently deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔍 List Trash Items
router.get("/trash", async (req, res) => {
  try {
    const trashItems = await db.listDocuments(DB_ID, TRASH_COLL_ID);
    res.json(trashItems.documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
