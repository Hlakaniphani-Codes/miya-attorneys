# Miya Attorneys Backend (API for blog + admin)

## What this provides
- Admin login (JWT)
- Blog CRUD (posts list + single post)
- Optional image upload per post

## Run locally
### 1) Install dependencies
From `backend/`:
```bash
npm i
```

### 2) Start server
```bash
npm start
```
Server runs on `http://localhost:3001`.

## Default admin credentials
- username: `admin`
- password: `miya2026`

You can override via env:
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

## Tenant
- `TENANT_ID` default: `miya-attorneys`

## Endpoints
- POST `/api/auth/login`
- GET `/api/tenants/:tenantId/posts`
- GET `/api/tenants/:tenantId/posts/:postId`
- POST `/api/tenants/:tenantId/posts` (admin)
- PUT `/api/tenants/:tenantId/posts/:postId` (admin)
- DELETE `/api/tenants/:tenantId/posts/:postId` (admin)

Images:
- Served from `/uploads/<filename>`

