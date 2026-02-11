const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const { createServer, processEvents, DB_PATH } = require('../server');

function resetDb() {
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify({ events: [], logs: [] }, null, 2));
}

test('create event and fetch events via API', async () => {
  resetDb();
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const createRes = await fetch(`http://127.0.0.1:${port}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Demo deadline',
      deadline: new Date(Date.now() + 60_000).toISOString(),
      phoneNumber: '+15550001111'
    })
  });

  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.title, 'Demo deadline');

  const eventsRes = await fetch(`http://127.0.0.1:${port}/api/events`);
  assert.equal(eventsRes.status, 200);
  const events = await eventsRes.json();
  assert.equal(events.length, 1);

  server.close();
});

test('processEvents writes message+call logs after deadline', async () => {
  resetDb();
  const db = {
    events: [
      {
        id: 'e1',
        title: 'Past task',
        deadline: new Date(Date.now() - 1000).toISOString(),
        phoneNumber: '+15550002222',
        createdAt: new Date().toISOString(),
        remindedAt: null,
        calledAt: null
      }
    ],
    logs: []
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  await processEvents();

  const updated = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  assert.equal(updated.events[0].remindedAt !== null, true);
  assert.equal(updated.events[0].calledAt !== null, true);
  assert.equal(updated.logs.length, 2);
});
