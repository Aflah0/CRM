import { db } from '../config/appwriteClient.js';
import dotenv from 'dotenv';
dotenv.config();

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const USERS_COLLECTION_ID = process.env.USERS_COLLECTION_ID;

export const authMiddleware = async (req, res, next) => {
  const sessionId = req.cookies.session;
  if (!sessionId) return res.status(401).json({ error: 'Unauthorized: No session' });

  try {
    const user = await db.getDocument(DATABASE_ID, USERS_COLLECTION_ID, sessionId);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid session' });
  }
};