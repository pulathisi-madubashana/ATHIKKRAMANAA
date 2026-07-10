const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const sync = require('./sheets-sync');
const { generateTicketBuffer } = require('./ticketGenerator');
const auth = require('./auth');

const whatsappRoutes = require('./whatsapp/routes');
const { initSocket } = require('./whatsapp/socket');
const { connectToWhatsApp } = require('./whatsapp/connection');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Initialize Socket.io and WhatsApp Connection
initSocket(server);
connectToWhatsApp();

// Enable CORS and JSON body parser
app.use(cors());
app.use(express.json());

// Initialize Database on Startup
db.initDatabase();
auth.initAuth();

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Auth Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  const result = auth.verifyToken(token);
  
  if (!result.success) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
  
  req.user = result.user;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ message: 'Forbidden: Super Admin access required' });
  }
  next();
}

// Authentication Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const result = auth.login(username, password);
  if (result.success) {
    res.json(result);
  } else {
    res.status(401).json(result);
  }
});

app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  const result = auth.verifyToken(token);
  res.json(result);
});

// Admin Management Routes (Protected)
app.get('/api/admins', requireAuth, requireSuperAdmin, (req, res) => {
  res.json({ success: true, admins: auth.getAdmins() });
});

app.post('/api/admins', requireAuth, requireSuperAdmin, (req, res) => {
  const { username, password, role } = req.body;
  const result = auth.addAdmin(username, password, role || 'admin');
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

app.delete('/api/admins/:username', requireAuth, requireSuperAdmin, (req, res) => {
  const result = auth.removeAdmin(req.params.username);
  if (result.success) {
    res.json(result);
  } else {
    res.status(400).json(result);
  }
});

// RPC endpoint mapping frontend calls (google.script.run emulation) - Protected
app.post('/api/rpc/:methodName', requireAuth, (req, res) => {
  const methodName = req.params.methodName;
  const args = req.body.args || [];

  if (typeof db[methodName] !== 'function') {
    return res.status(400).json({ message: `Function '${methodName}' is not defined on the server.` });
  }

  try {
    const result = db[methodName](...args);
    return res.json(result);
  } catch (error) {
    console.error(`Error executing RPC method '${methodName}':`, error);
    return res.status(500).json({ message: error.toString() });
  }
});

// Manual full-sync endpoint – push all local data to Google Sheets
app.post('/api/sync', async (req, res) => {
  try {
    const DATA_FILE = path.join(__dirname, 'data', 'registrations.json');
    const regs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    await sync.fullSync(regs);
    res.json({ success: true, message: `Full sync triggered – ${regs.length} records.` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// WhatsApp API Routes
app.use('/api/whatsapp', whatsappRoutes);

// Ticket Image Endpoint
app.get('/api/ticket/:regId', async (req, res) => {
  const regId = req.params.regId;
  const buffer = await generateTicketBuffer(regId);
  if (buffer) {
    res.set('Content-Type', 'image/png');
    res.send(buffer);
  } else {
    res.status(500).send('Failed to generate ticket image');
  }
});

// Serve public registration page explicitly
app.get(['/Athikkramana/Registation', '/Registration', '/registration'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'registration.html'));
});

// Fallback to index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` Athikkramana Server running on port ${PORT}`);
  console.log(` Web Portal: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
