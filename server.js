const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, 'data', 'events.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function ensureDb() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ events: [], logs: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function serveStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8'
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain; charset=utf-8' });
  fs.createReadStream(filePath).pipe(res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function buildReminderMessage(event) {
  return `Reminder: ${event.title} is scheduled for ${new Date(event.deadline).toLocaleString()}.`;
}

async function sendSms(phoneNumber, body) {
  return {
    status: 'simulated',
    to: phoneNumber,
    detail: `Would send SMS: ${body}`
  };
}

async function callPhone(phoneNumber, eventTitle) {
  return {
    status: 'simulated',
    to: phoneNumber,
    detail: `Would call about deadline for: ${eventTitle}`
  };
}

async function processEvents() {
  const db = readDb();
  const now = new Date();
  let dirty = false;

  for (const event of db.events) {
    const deadline = new Date(event.deadline);
    const reminderTime = new Date(deadline.getTime() - 15 * 60 * 1000);

    if (!event.remindedAt && now >= reminderTime) {
      const message = buildReminderMessage(event);
      const smsResult = await sendSms(event.phoneNumber, message);
      event.remindedAt = now.toISOString();
      db.logs.push({
        id: `log-${Date.now()}-${Math.random()}`,
        type: 'message',
        eventId: event.id,
        text: message,
        to: event.phoneNumber,
        timestamp: now.toISOString(),
        provider: smsResult
      });
      dirty = true;
    }

    if (!event.calledAt && now >= deadline) {
      const callResult = await callPhone(event.phoneNumber, event.title);
      event.calledAt = now.toISOString();
      db.logs.push({
        id: `log-${Date.now()}-${Math.random()}`,
        type: 'call',
        eventId: event.id,
        text: `Deadline reached. Call triggered for ${event.title}.`,
        to: event.phoneNumber,
        timestamp: now.toISOString(),
        provider: callResult
      });
      dirty = true;
    }
  }

  if (dirty) {
    writeDb(db);
  }
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/events') {
    return json(res, 200, readDb().events);
  }

  if (req.method === 'GET' && pathname === '/api/logs') {
    const db = readDb();
    return json(res, 200, db.logs.slice().reverse());
  }

  if (req.method === 'POST' && pathname === '/api/events') {
    const raw = await readRequestBody(req);
    let payload;

    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      return json(res, 400, { error: 'Body must be valid JSON.' });
    }

    const { title, deadline, phoneNumber } = payload;
    if (!title || !deadline || !phoneNumber) {
      return json(res, 400, { error: 'title, deadline and phoneNumber are required.' });
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      return json(res, 400, { error: 'Invalid deadline date.' });
    }

    const db = readDb();
    const event = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      title,
      deadline: parsedDeadline.toISOString(),
      phoneNumber,
      createdAt: new Date().toISOString(),
      remindedAt: null,
      calledAt: null
    };
    db.events.push(event);
    writeDb(db);
    return json(res, 201, event);
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/events/')) {
    const eventId = pathname.split('/').pop();
    const db = readDb();
    const before = db.events.length;
    db.events = db.events.filter((event) => event.id !== eventId);

    if (db.events.length === before) {
      return json(res, 404, { error: 'Event not found.' });
    }

    writeDb(db);
    res.writeHead(204);
    res.end();
    return;
  }

  json(res, 404, { error: 'API route not found.' });
}

function createServer() {
  ensureDb();
  return http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname).catch((error) => {
        json(res, 500, { error: error.message });
      });
      return;
    }

    serveStatic(pathname, res);
  });
}

if (require.main === module) {
  const server = createServer();
  setInterval(() => {
    processEvents().catch((error) => {
      console.error('Background processing error:', error);
    });
  }, 30 * 1000);

  server.listen(PORT, () => {
    console.log(`Reminder app running at http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  processEvents,
  readDb,
  writeDb,
  ensureDb,
  DB_PATH
};
