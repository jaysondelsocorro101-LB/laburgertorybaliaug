# LaBurgertory App

Online ordering, kitchen board, costing & inventory — single Node.js app, zero cloud dependencies.

## Requirements
- **Node.js 22+** (uses built-in `node:sqlite` — no separate DB install needed)
- Any Node-capable host with persistent disk (Render, Railway, VPS)

## Quick Start

```bash
# 1. Install dependencies
npm install --ignore-scripts

# 2. Seed database (creates laburgertory.db + default owner account)
npm run seed

# 3. Start server
npm start
```

App runs at **http://localhost:3000**

## Default Login
| Username | Password | Role |
|---|---|---|
| `owner` | `laburgertory2024` | Owner |

**Change this password immediately after first login.**

## Pages
| URL | Who |
|---|---|
| `/` | Public ordering (customers) |
| `/kitchen.html` | Staff — live order queue |
| `/inventory.html` | Owner/Staff — costing, ingredients, stock |
| `/users.html` | Owner — manage staff accounts |
| `/login.html` | Staff/Owner login |

## Environment Variables (optional)
Copy `.env.example` to `.env`:
```
PORT=3000
SESSION_SECRET=your-long-random-secret-here
NODE_ENV=production
```

## Backup
The entire dataset lives in `laburgertory.db`. Copy that file = full backup.

## Deployment (Render example)
1. Push repo to GitHub
2. Create a Render Web Service → `npm start`
3. Add a **Persistent Disk** mounted at `/app` so `laburgertory.db` survives deploys
4. Set `SESSION_SECRET` env var to a long random string
