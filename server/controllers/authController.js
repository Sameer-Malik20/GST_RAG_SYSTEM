const mongoose = require('mongoose');
const User = require('../models/User');
const { generateToken } = require('../middleware/authMiddleware');

// In-memory fallback if MongoDB is offline
const inMemoryUsers = new Map();

// Seed Default Admin Account
const seedAdminUser = async () => {
  const adminEmail = 'admin@samrag.ai';
  const adminPassword = 'Admin@12345';

  // Seed in memory
  inMemoryUsers.set(adminEmail, {
    user_id: 'usr_admin_001',
    name: 'System Admin',
    email: adminEmail,
    password: adminPassword,
    trial: false,
    billing: 100.0,
    admin: true
  });

  // Seed in MongoDB if ready
  try {
    if (mongoose.connection.readyState === 1) {
      let adminExists = await User.findOne({ email: adminEmail });
      if (!adminExists) {
        await User.create({
          user_id: 'usr_admin_001',
          name: 'System Admin',
          email: adminEmail,
          password: adminPassword,
          trial: false,
          billing: 100.0,
          admin: true
        });
        console.log('🔑 [Auth] Seeded Default Admin User: admin@samrag.ai');
      } else {
        adminExists.admin = true;
        adminExists.password = adminPassword;
        await adminExists.save();
        console.log('🔑 [Auth] Verified & Updated Default Admin User: admin@samrag.ai');
      }
    }
  } catch (error) {
    // MongoDB offline fallback ready in inMemoryUsers
  }
};

// Listen for DB connection to trigger seed in Mongo
mongoose.connection.on('connected', () => {
  seedAdminUser();
});

seedAdminUser();

// @route   POST /api/auth/register
exports.registerUser = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ detail: 'Please fill in all fields.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const userExists = await User.findOne({ email: cleanEmail });
    if (userExists) {
      return res.status(400).json({ detail: 'Email is already registered.' });
    }

    const user = await User.create({ name, email: cleanEmail, password });
    const token = generateToken({ user_id: user.user_id, email: user.email, name: user.name, admin: user.admin });

    res.status(201).json({
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        trial: user.trial,
        billing: user.billing,
        admin: user.admin
      }
    });
  } catch (error) {
    // Fallback to memory
    if (inMemoryUsers.has(cleanEmail)) {
      return res.status(400).json({ detail: 'Email is already registered.' });
    }
    const user_id = `usr_${Date.now()}`;
    const user = { user_id, name, email: cleanEmail, password, trial: true, billing: 0.0, admin: false };
    inMemoryUsers.set(cleanEmail, user);
    const token = generateToken({ user_id, email: cleanEmail, name, admin: false });

    res.status(201).json({
      token,
      user: { user_id, name, email: cleanEmail, trial: true, billing: 0.0, admin: false }
    });
  }
};

// @route   POST /api/auth/login
exports.loginUser = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ detail: 'Please provide email and password.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const user = await User.findOne({ email: cleanEmail });
    if (user) {
      const isMatch = await user.matchPassword(password).catch(() => false);
      if (isMatch || user.password === password) {
        const token = generateToken({ user_id: user.user_id, email: user.email, name: user.name, admin: user.admin });
        return res.json({
          token,
          user: {
            user_id: user.user_id,
            name: user.name,
            email: user.email,
            trial: user.trial,
            billing: user.billing,
            admin: user.admin
          }
        });
      }
    }
    // Fallback check memory
    const memUser = inMemoryUsers.get(cleanEmail) || inMemoryUsers.get(email);
    if (memUser && memUser.password === password) {
      const token = generateToken({ user_id: memUser.user_id, email: memUser.email, name: memUser.name, admin: memUser.admin });
      return res.json({
        token,
        user: {
          user_id: memUser.user_id,
          name: memUser.name,
          email: memUser.email,
          trial: memUser.trial,
          billing: memUser.billing,
          admin: memUser.admin
        }
      });
    }
    return res.status(401).json({ detail: 'Invalid email or password.' });
  } catch (error) {
    // Fallback login
    const memUser = inMemoryUsers.get(cleanEmail) || inMemoryUsers.get(email);
    if (memUser && memUser.password === password) {
      const token = generateToken({ user_id: memUser.user_id, email: memUser.email, name: memUser.name, admin: memUser.admin });
      return res.json({
        token,
        user: {
          user_id: memUser.user_id,
          name: memUser.name,
          email: memUser.email,
          trial: memUser.trial,
          billing: memUser.billing,
          admin: memUser.admin
        }
      });
    }
    return res.status(401).json({ detail: 'Invalid email or password.' });
  }
};

// @route   GET /api/auth/status
exports.getAuthStatus = (req, res) => {
  res.json({ logged_in: Boolean(req.user && req.user.user_id !== 'guest_user') });
};

// @route   GET /api/auth/user
exports.getUserProfile = async (req, res) => {
  res.json({
    user_id: req.user.user_id || 'guest_user',
    name: req.user.name || 'Guest User',
    email: req.user.email || 'guest@gstgpt.com',
    billing: req.user.billing || 0.0,
    trial: req.user.trial !== undefined ? req.user.trial : true,
    admin: Boolean(req.user.admin)
  });
};

// @route   POST /api/auth/logout
exports.logoutUser = (req, res) => {
  res.json({ message: 'Logged out successfully.' });
};

// @route   GET /api/users  — Admin: list all users
exports.getAllUsers = async (req, res) => {
  try {
    const list = await User.find({}, '-password').sort({ created_at: -1 });
    res.json(list);
  } catch (err) {
    // In-memory fallback
    const memList = Array.from(inMemoryUsers.values()).map(({ password, ...rest }) => rest);
    res.json(memList);
  }
};

// @route   PATCH /api/users/:id  — Admin: toggle trial/admin status
exports.updateUserStatus = async (req, res) => {
  const { id } = req.params;
  const { trial, admin } = req.body;

  try {
    const updateFields = {};
    if (typeof trial === 'boolean') updateFields.trial = trial;
    if (typeof admin === 'boolean') updateFields.admin = admin;

    const user = await User.findOneAndUpdate(
      { user_id: id },
      { $set: updateFields },
      { new: true, select: '-password' }
    );

    if (!user) {
      // In-memory fallback
      for (const [, memUser] of inMemoryUsers.entries()) {
        if (memUser.user_id === id) {
          if (typeof trial === 'boolean') memUser.trial = trial;
          if (typeof admin === 'boolean') memUser.admin = admin;
          const { password, ...rest } = memUser;
          return res.json(rest);
        }
      }
      return res.status(404).json({ detail: 'User not found.' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ detail: 'Failed to update user.' });
  }
};
