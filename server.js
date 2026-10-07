const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const os = require('os');
const http = require('http');
const https = require('https');
const selfsigned = require('selfsigned');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;
const HOST = '0.0.0.0'; // listen on all network interfaces (LAN access)

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static directories
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Create Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS poses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    instruction TEXT,
    image_url TEXT NOT NULL,
    angles_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS match_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    player1_name TEXT NOT NULL,
    player1_score INTEGER NOT NULL,
    player2_name TEXT,
    player2_score INTEGER,
    winner TEXT,
    duration_sec INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Multer Storage Configuration for Image Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `pose_${Date.now()}_${Math.round(Math.random() * 1E6)}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// ==========================================
// REST API ROUTES
// ==========================================

// 1. Get all custom poses from Database
app.get('/api/poses', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM poses ORDER BY id DESC');
    const rows = stmt.all();
    const formatted = rows.map(r => ({
      id: `db_${r.id}`,
      dbId: r.id,
      title: r.title,
      name: r.title,
      category: r.category,
      instruction: r.instruction,
      desc: r.instruction,
      image: r.image_url,
      angles: JSON.parse(r.angles_json || '{}'),
      createdAt: r.created_at
    }));
    res.json(formatted);
  } catch (err) {
    console.error('Error fetching poses:', err);
    res.status(500).json({ error: 'Failed to fetch poses' });
  }
});

// 2. Add new pose (with uploaded image)
app.post('/api/poses', upload.single('image'), (req, res) => {
  try {
    const { title, category, instruction, angles_json } = req.body;
    let imageUrl = '';

    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.image_url) {
      imageUrl = req.body.image_url;
    } else {
      return res.status(400).json({ error: 'Image file or URL is required' });
    }

    const stmt = db.prepare(`
      INSERT INTO poses (title, category, instruction, image_url, angles_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title || 'Custom Pose',
      category || 'custom',
      instruction || 'Mirror and match the reference pose shown in the preview',
      imageUrl,
      angles_json || '{}'
    );

    res.json({
      success: true,
      id: `db_${result.lastInsertRowid}`,
      title,
      imageUrl,
      message: 'Pose saved successfully!'
    });
  } catch (err) {
    console.error('Error saving pose:', err);
    res.status(500).json({ error: 'Failed to save pose' });
  }
});

// 3. Delete pose
app.delete('/api/poses/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const stmt = db.prepare('DELETE FROM poses WHERE id = ?');
    stmt.run(id);
    res.json({ success: true, message: 'Pose deleted successfully' });
  } catch (err) {
    console.error('Error deleting pose:', err);
    res.status(500).json({ error: 'Failed to delete pose' });
  }
});

// 4. Get Match Leaderboard
app.get('/api/scores', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM match_scores ORDER BY created_at DESC LIMIT 20');
    const rows = stmt.all();
    res.json(rows);
  } catch (err) {
    console.error('Error fetching scores:', err);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// 5. Save Match Result
app.post('/api/scores', (req, res) => {
  try {
    const { mode, player1_name, player1_score, player2_name, player2_score, winner, duration_sec } = req.body;

    const stmt = db.prepare(`
      INSERT INTO match_scores (mode, player1_name, player1_score, player2_name, player2_score, winner, duration_sec)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      mode || 'solo',
      player1_name || 'Player 1',
      parseInt(player1_score, 10) || 0,
      player2_name || null,
      player2_score !== undefined ? parseInt(player2_score, 10) : null,
      winner || 'Solo',
      parseInt(duration_sec, 10) || 60
    );

    res.json({ success: true, message: 'Score saved!' });
  } catch (err) {
    console.error('Error saving score:', err);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// Fallback to index.html for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==========================================
// START SERVERS (HTTP + HTTPS for LAN)
// ==========================================
function getLanIPs() {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

// Self-signed cert (camera/getUserMedia requires HTTPS when not on localhost)
async function getCertificate(lanIPs) {
  const certDir = path.join(__dirname, 'certs');
  const keyFile = path.join(certDir, 'key.pem');
  const certFile = path.join(certDir, 'cert.pem');
  const ipsFile = path.join(certDir, 'ips.json');
  const ipKey = JSON.stringify([...lanIPs].sort());

  if (fs.existsSync(keyFile) && fs.existsSync(certFile) && fs.existsSync(ipsFile)
      && fs.readFileSync(ipsFile, 'utf8') === ipKey) {
    return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
  }

  const notAfterDate = new Date();
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 5);
  const pems = await selfsigned.generate(
    [{ name: 'commonName', value: 'dmi-yoga.local' }],
    {
      keySize: 2048,
      algorithm: 'sha256',
      notAfterDate,
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
            ...lanIPs.map(ip => ({ type: 7, ip }))
          ]
        }
      ]
    }
  );
  fs.mkdirSync(certDir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(ipsFile, ipKey);
  return { key: pems.private, cert: pems.cert };
}

(async () => {
  const lanIPs = getLanIPs();

  const onListenError = (port) => (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ พอร์ต ${port} ถูกใช้งานอยู่แล้ว — มีเซิร์ฟเวอร์เปิดอยู่ก่อนแล้ว`);
      console.error(`   ปิดหน้าต่างเซิร์ฟเวอร์ตัวเก่าก่อน แล้วค่อยเปิดใหม่\n`);
    } else {
      console.error(`\n❌ Server error on port ${port}:`, err.message);
    }
    process.exit(1);
  };

  http.createServer(app).listen(PORT, HOST).on('error', onListenError(PORT));

  try {
    const creds = await getCertificate(lanIPs);
    https.createServer(creds, app).listen(HTTPS_PORT, HOST).on('error', onListenError(HTTPS_PORT));
  } catch (err) {
    console.error('⚠️  HTTPS server failed to start:', err.message);
  }

  console.log(`========================================`);
  console.log(`🎮 DMI YOGA Server running`);
  console.log(`   This PC     : http://localhost:${PORT}`);
  lanIPs.forEach(ip => {
    console.log(`   LAN (HTTP)  : http://${ip}:${PORT}`);
    console.log(`   LAN (HTTPS) : https://${ip}:${HTTPS_PORT}   <-- use this on other devices (camera)`);
  });
  console.log(`📦 SQLite database ready at: ${dbPath}`);
  console.log(`========================================`);
})();
