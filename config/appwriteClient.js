// config/appwriteClient.js
import dotenv from 'dotenv';
dotenv.config();

import { Client, Databases, Account } from 'node-appwrite';

const client = new Client();

client
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const account = new Account(client);

export { client, db, account };
