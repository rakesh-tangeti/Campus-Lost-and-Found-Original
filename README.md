# Campus Lost & Found — REAL-TIME VERSION

This version uses Node.js + Express + Socket.IO.

## What is real-time?
- A student can submit a Lost or Found report from one device.
- The security dashboard on another device receives the new report immediately.
- Possible matches are pushed to security as live alerts.
- A Found report triggers the "DROP THE ITEM IN THE BOX" step.
- When the found item is deposited, security receives the update.
- When security verifies a match, the student's browser can receive a live notification.

## Demo security login
Email: security@campus.edu
Password: admin123

For deployment, set:
- SECURITY_EMAIL
- SECURITY_PASSWORD

## Run locally
1. Install Node.js 18+.
2. Open this folder in terminal.
3. Run:
   npm install
   npm start
4. Open http://localhost:3000

## Deploy on Render / Railway / similar
Build command:
npm install

Start command:
npm start

Environment variables:
SECURITY_EMAIL=your-security-email
SECURITY_PASSWORD=your-secure-password

PORT is supplied automatically by most hosts.

## Storage note
Reports are currently stored in server memory so the prototype is genuinely real-time across browsers/devices without requiring a database. Restarting/redeploying the server clears reports.

For the final production system, connect the same API to MongoDB Atlas or PostgreSQL so reports persist permanently.

## Physical kiosk flow
FOUND -> report -> "DROP THE ITEM IN THE BOX" -> user deposits item -> Item Deposited -> security gets real-time update.
