async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed.' }));
    throw new Error(error.error || 'Request failed.');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleString();
}

async function loadEvents() {
  const events = await fetchJson('/api/events');
  const eventsList = document.getElementById('events');
  eventsList.innerHTML = '';

  if (events.length === 0) {
    eventsList.innerHTML = '<li><small>No tasks scheduled yet.</small></li>';
    return;
  }

  for (const event of events.sort((a, b) => new Date(a.deadline) - new Date(b.deadline))) {
    const item = document.createElement('li');
    const info = document.createElement('div');
    const status = [
      event.remindedAt ? 'message sent' : 'message pending',
      event.calledAt ? 'call done' : 'call pending'
    ].join(' • ');

    info.innerHTML = `<strong>${event.title}</strong><br><small>${formatDate(event.deadline)} to ${event.phoneNumber} (${status})</small>`;

    const removeButton = document.createElement('button');
    removeButton.textContent = 'Delete';
    removeButton.className = 'danger';
    removeButton.addEventListener('click', async () => {
      await fetchJson(`/api/events/${event.id}`, { method: 'DELETE' });
      await Promise.all([loadEvents(), loadLogs()]);
    });

    item.append(info, removeButton);
    eventsList.appendChild(item);
  }
}

async function loadLogs() {
  const logs = await fetchJson('/api/logs');
  const logsList = document.getElementById('logs');
  logsList.innerHTML = '';

  if (logs.length === 0) {
    logsList.innerHTML = '<li><small>No logs yet.</small></li>';
    return;
  }

  for (const log of logs) {
    const item = document.createElement('li');
    item.innerHTML = `<div><strong>${log.type.toUpperCase()}</strong>: ${log.text}<br><small>${formatDate(log.timestamp)}</small></div>`;
    logsList.appendChild(item);
  }
}

function setupForm() {
  const form = document.getElementById('event-form');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = document.getElementById('title').value.trim();
    const deadline = document.getElementById('deadline').value;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();

    await fetchJson('/api/events', {
      method: 'POST',
      body: JSON.stringify({ title, deadline, phoneNumber })
    });

    form.reset();
    await Promise.all([loadEvents(), loadLogs()]);
  });
}

setupForm();
loadEvents();
loadLogs();
setInterval(() => {
  loadEvents().catch(console.error);
  loadLogs().catch(console.error);
}, 10000);
