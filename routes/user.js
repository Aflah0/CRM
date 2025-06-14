import express from 'express';
import { Query } from 'node-appwrite';
import { db } from '../config/appwriteClient.js';

const router = express.Router();

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const USERS_COLLECTION_ID = process.env.USERS_COLLECTION_ID;
const ENQUIRY_COLLECTION_ID = process.env.ENQUIRY_COLLECTION_ID;

// Signup route
router.post('/signup', async (req, res) => {
  const { name, email, username, password, role, organizationId } = req.body;

  try {
    // Check for existing email or username
    const existingUsers = await db.listDocuments(
      DATABASE_ID,
      USERS_COLLECTION_ID,
      [Query.or([Query.equal('email', email), Query.equal('username', username)])]
    );

    if (existingUsers.total > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    const result = await db.createDocument(
      DATABASE_ID,
      USERS_COLLECTION_ID,
      'unique()',
      {
        name,
        email,
        username,
        password,
        role,
        organizationId,
        isFrozen: false
      }
    );
    res.status(201).json({ message: 'User registered', user: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login route (email or username)
router.post('/login', async (req, res) => {
  const { identifier, password } = req.body; // identifier: email or username

  try {
    const users = await db.listDocuments(
      DATABASE_ID,
      USERS_COLLECTION_ID,
      [Query.or([Query.equal('email', identifier), Query.equal('username', identifier)])]
    );

    const user = users.documents[0];

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isFrozen) {
      return res.status(403).json({ error: 'User account is frozen' });
    }

    res.cookie('session', user.$id, {
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    });

    res.json({
      message: 'Login successful',
      redirect: `/${user.role}/dashboard`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const sessionId = req.cookies.session;
  if (!sessionId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  try {
    const user = await db.getDocument(DATABASE_ID, USERS_COLLECTION_ID, sessionId);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'User not found' });
  }
});

// List all users
router.get('/users', async (req, res) => {
  try {
    const users = await db.listDocuments(DATABASE_ID, USERS_COLLECTION_ID);
    res.json(users.documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user
router.put('/update/:id', async (req, res) => {
  try {
    const updated = await db.updateDocument(
      DATABASE_ID,
      USERS_COLLECTION_ID,
      req.params.id,
      req.body
    );
    res.json({ message: 'User updated', user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Freeze/Unfreeze user
router.put('/freeze/:id', async (req, res) => {
  try {
    const { freeze } = req.body; // true or false
    const updated = await db.updateDocument(
      DATABASE_ID,
      USERS_COLLECTION_ID,
      req.params.id,
      { isFrozen: freeze }
    );
    res.json({ message: `User ${freeze ? 'frozen' : 'unfrozen'}`, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user only if no enquiries exist
router.delete('/delete/:id', async (req, res) => {
  try {
    // Fetch the user to get their username
    const user = await db.getDocument(DATABASE_ID, USERS_COLLECTION_ID, req.params.id);

    // Query the enquiry collection by username (not employeeName)
    const enquiries = await db.listDocuments(
      DATABASE_ID,
      ENQUIRY_COLLECTION_ID,
      [Query.equal('username', user.username)] // Fixed this line
    );

    if (enquiries.total > 0) {
      return res.status(400).json({ error: 'User has active enquiries. Cannot delete.' });
    }

    await db.deleteDocument(DATABASE_ID, USERS_COLLECTION_ID, req.params.id);
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;