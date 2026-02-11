# Calendar Reminder Caller App

This app lets you schedule tasks/events and automatically:

1. Sends a reminder message **15 minutes before** the event deadline.
2. Triggers a phone call workflow **at the deadline**.

It is designed for "don't let me forget anything" workflows where calendar events become proactive reminders.

## Features

- Create schedules from a web form (title, deadline, phone number).
- Automatically logs reminder-message and call activity.
- Runs with zero external dependencies (pure Node.js).
- Uses simulated SMS/call providers by default so you can test locally.

## Setup

```bash
npm start
```

Open: `http://localhost:3000`

## Behavior

- At `deadline - 15 minutes`: app marks reminder as sent and logs a message event.
- At `deadline`: app marks call as completed and logs a call event.

You can connect real providers (Twilio, etc.) by replacing `sendSms` and `callPhone` in `server.js`.

## API

- `GET /api/events` - list scheduled tasks
- `POST /api/events` - create a task
- `DELETE /api/events/:id` - remove a task
- `GET /api/logs` - list reminder/call logs

## Tests

```bash
npm test
```
