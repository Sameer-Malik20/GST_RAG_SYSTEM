const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');

dotenv.config();

// Connect to Local MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mounting MVC Routes
app.use('/api/auth', authRoutes);
app.use('/api', authRoutes);
app.use('/api', chatRoutes);
app.use('/', chatRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'GSTGPT Express MVC Backend', mongodb: 'connected' });
});

app.listen(PORT, () => {
  console.log(`🚀 [Express MVC Server] Running on http://localhost:${PORT}`);
});
