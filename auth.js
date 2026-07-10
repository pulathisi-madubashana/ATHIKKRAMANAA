const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ADMINS_FILE = path.join(__dirname, 'data', 'admins.json');
const JWT_SECRET = 'athikkramana-secret-key-2026'; // In a real app, use environment variables
const QR_SECRET = 'ATHIKKRAMANA_SECURE_QR_KEY_2026';

function generateQRSig(regId) {
  return crypto.createHmac('sha256', QR_SECRET).update(regId).digest('hex').substring(0, 10);
}

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readAdmins() {
  if (!fs.existsSync(ADMINS_FILE)) {
    return [];
  }
  const data = fs.readFileSync(ADMINS_FILE, 'utf8');
  return JSON.parse(data);
}

function writeAdmins(admins) {
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2), 'utf8');
}

function initAuth() {
  const admins = readAdmins();
  const superadminExists = admins.some(a => a.username === 'pulathisi');
  
  if (!superadminExists) {
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync('20040723', salt);
    
    admins.push({
      username: 'pulathisi',
      password: hashedPassword,
      role: 'superadmin',
      createdAt: new Date().toISOString()
    });
    
    writeAdmins(admins);
    console.log('[auth] Superadmin initialized.');
  }
}

function login(username, password) {
  const admins = readAdmins();
  const admin = admins.find(a => a.username === username);
  
  if (!admin) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  const isMatch = bcrypt.compareSync(password, admin.password);
  
  if (!isMatch) {
    return { success: false, message: 'Invalid username or password' };
  }
  
  const token = jwt.sign(
    { username: admin.username, role: admin.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  
  return {
    success: true,
    token: token,
    role: admin.role,
    username: admin.username
  };
}

function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { success: true, user: decoded };
  } catch (err) {
    return { success: false, message: 'Invalid or expired token' };
  }
}

function getAdmins() {
  const admins = readAdmins();
  return admins.map(a => ({
    username: a.username,
    role: a.role,
    createdAt: a.createdAt
  }));
}

function addAdmin(newUsername, newPassword, role) {
  if (!newUsername || !newPassword || !role) {
    return { success: false, message: 'Missing required fields' };
  }
  
  const admins = readAdmins();
  if (admins.some(a => a.username === newUsername)) {
    return { success: false, message: 'Username already exists' };
  }
  
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);
  
  admins.push({
    username: newUsername,
    password: hashedPassword,
    role: role,
    createdAt: new Date().toISOString()
  });
  
  writeAdmins(admins);
  return { success: true, message: 'Admin added successfully' };
}

function removeAdmin(usernameToRemove) {
  if (usernameToRemove === 'pulathisi') {
    return { success: false, message: 'Cannot remove the primary superadmin' };
  }
  
  const admins = readAdmins();
  const initialLength = admins.length;
  const filtered = admins.filter(a => a.username !== usernameToRemove);
  
  if (filtered.length === initialLength) {
    return { success: false, message: 'Admin not found' };
  }
  
  writeAdmins(filtered);
  return { success: true, message: 'Admin removed successfully' };
}

module.exports = {
  initAuth,
  login,
  verifyToken,
  getAdmins,
  addAdmin,
  removeAdmin,
  generateQRSig
};
