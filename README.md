# Depot Server

Depot Server is an Express-based API that backs the Depot file storage client. It handles user authentication (local and Google OAuth), session management, file metadata storage, and streaming file operations via Azure Blob Storage. The service persists user data in PostgreSQL and relies on Redis for production-ready session storage.

![Architecture diagram is not provided; refer to the client README for UI context.]

## Features
- Local email/password registration with secure hashing (bcrypt)
- Google OAuth 2.0 login using Passport strategies
- Session-backed authentication with Redis store and secure cookies
- REST endpoints for uploading, listing, downloading, and deleting files
- Azure Blob Storage integration for file persistence
- PostgreSQL schema for users and file metadata with initialization helpers
- CORS configuration tuned for the deployed frontend origin

## Technology Stack
- Node.js 20+
- Express 5
- Passport (local and Google strategies)
- express-session with connect-redis
- PostgreSQL (via `pg` pool)
- Azure Blob Storage SDK
- Multer for in-memory upload handling

## Prerequisites
- Node.js 20 or later
- PostgreSQL database and connection string
- Redis instance (Upstash, Railway, Azure, or self-hosted)
- Azure Storage account with a configured blob container
- Google Cloud project with OAuth credentials

## Environment Variables
Create a `.env` file in the `server` directory with the following keys:

```
PORT=3000                        # Optional override for the listening port
NODE_ENV=development             # Set to production when deploying
CONNECTIONSTRING=postgres://user:pass@host:port/database
SESSION_SECRET=replace-with-strong-random-value
REDIS_URL=redis://default:password@host:port
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=...
AZURE_BLOB_CONTAINER=container-name
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
BACKEND_URL=https://your-production-server.example.com   # Used for OAuth callbacks if you update index.js
FRONTEND_ORIGIN=https://your-frontend.example.com         # Optional if you generalize CORS
```

> The current code references the deployed frontend domain directly in `index.js`. Adjust the CORS configuration or introduce `FRONTEND_ORIGIN` if you need greater flexibility across environments.

## Installation

```bash
npm install
```

## Database Initialization
The server runs `initDb()` at startup to create the required tables if they are absent:
- `users` – stores email, hashed password, and optional Google ID
- `metadata` – stores file metadata linked to user IDs with cascading deletes

Ensure the database user in `CONNECTIONSTRING` has privileges to create tables.

## Running Locally

```bash
npm start
```

By default the server listens on `http://localhost:3000`. The `start` script uses `node --watch` for auto-restart in development.

### Local HTTPS and Cookies
When testing Google login or cross-site cookies locally, ensure:
- The client uses `http://localhost:5173` (update CORS if necessary)
- Browsers may block third-party cookies without HTTPS; consider tools like `mkcert` or run both client and server on the same origin for development

## Deployment Notes
- In production set `NODE_ENV=production` so cookies are issued with `secure: true` and `sameSite: "none"`
- Trusting the first proxy (`app.set('trust proxy', 1)`) is required on Vercel, Railway, or similar platforms to handle HTTPS correctly
- Redis connectivity must succeed before sessions are stored; monitor logs for connection failures
- Google OAuth requires authorized redirect URIs that match `https://your-server/auth/google/callback`

## API Surface

| Method | Path                      | Auth | Description |
| ------ | ------------------------ | ---- | ----------- |
| POST   | `/register`              | No   | Create a user with email/password and start session |
| POST   | `/login`                 | No   | Authenticate via local strategy and start session |
| POST   | `/logout`                | Yes  | Destroy active session |
| GET    | `/profile`               | Yes  | Return session-bound user object |
| GET    | `/files`                 | Yes  | List files for authenticated user |
| POST   | `/files`                 | Yes  | Upload file (multipart/form-data, field `file`) |
| GET    | `/files/:id/download`    | Yes  | Stream a file the user owns |
| DELETE | `/files/:id`             | Yes  | Delete file metadata and blob |
| GET    | `/storagespace`          | Yes  | Return used storage in bytes |
| GET    | `/auth/google`           | No   | Begin Google OAuth flow |
| GET    | `/auth/google/callback`  | No   | Google OAuth redirect handler |

Every route except authentication endpoints requires a valid session. Unauthorized requests respond with HTTP 401.

## File Upload Workflow
1. Client sends multipart/form-data POST to `/files`
2. Multer retains the file in memory, resized to `5 MB` max
3. File is pushed to Azure Blob Storage with a namespaced path (`userId/timestamp-originalName`)
4. Metadata written to PostgreSQL includes blob name and size
5. Response includes storage URL (use SAS tokens for direct access if needed)

## Error Handling
- Runtime errors propagate to the custom `errorMiddleware`, which should be expanded to log metadata or redact sensitive output before sending responses
- Redis, database, and storage failures are logged to the console; consider integrating structured logging in production

## Testing
No automated tests are provided. To add coverage:
- Use supertest for endpoint verification
- Mock Azure and Redis dependencies where possible
- Seed temporary PostgreSQL instances for integration testing

## Extending the Server
- Introduce rate limiting (e.g., `express-rate-limit`) for authentication routes
- Replace direct console logging with a logger such as Winston or Pino
- Add email verification or password reset flows
- Generate pre-signed URLs for direct client uploads to Azure Blob Storage

## Support
File issues or ideas within the repository. Ensure secrets are rotated regularly and audit external integrations (Google, Azure, Redis) for compliance with your deployment targets.
