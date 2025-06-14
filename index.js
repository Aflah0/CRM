import express from 'express';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';

import userRoutes from './routes/user.js';
import enquiriesRoutes from './routes/enquiries.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/user', userRoutes);
app.use('/enquiries', enquiriesRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to the Multi-Tenant Auth App with Appwrite');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
