# Backend Setup Guide

## Overview

This backend uses Prisma ORM for database migrations. When the Docker container starts, it automatically:

1. Installs dependencies
2. Runs database migrations (creates tables if they don't exist)
3. Starts the Node.js server

**No manual SQL setup required!**

## Local Development Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp ../.env.example ../.env
# Edit .env with your database credentials
```

3. Run migrations:
```bash
npm run migrate:dev
```

4. Start the development server:
```bash
npm run dev
```

## Docker Deployment

### What Happens Automatically

When you run `docker compose up --build`:

```
1. PostgreSQL container starts
2. Backend container starts
3. Migration runs automatically: npm run migrate
4. Tables are created in the database
5. Server starts listening on port 3000
```

### No Manual Steps Required

- ❌ No need to manually create tables
- ❌ No need to run SQL scripts
- ❌ No need to install schema separately

### Environment Variables

The `.env` file must contain database credentials:

```env
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=attendance_DB
DB_HOST=postgres  # When using Docker, this is the service name

# Generated automatically in docker-compose.yml
DATABASE_URL=postgresql://postgres:your_password@postgres:5432/attendance_DB
```

## Database Schema

The database includes three main tables:

### employees
- `id` (UUID): Primary key
- `emp_id` (VARCHAR, UNIQUE): Company-provided employee ID
- `name` (VARCHAR): Employee name
- `milvus_id` (BIGINT, UNIQUE): Link to vector database
- `enrolled_at` (TIMESTAMP): Enrollment timestamp

### cameras
- `cam_id` (UUID): Primary key
- `site_id` (VARCHAR): Site identifier
- `site_name` (VARCHAR): Site name
- `camera_label` (VARCHAR): Camera label
- `created_at` (TIMESTAMP): Creation timestamp

### attendance_events
- `id` (UUID): Primary key
- `emp_id` (VARCHAR): Foreign key to employees
- `cam_id` (UUID): Foreign key to cameras
- `site_id` (VARCHAR): Site identifier
- `event_time` (TIMESTAMP): Event timestamp
- `action` (VARCHAR): IN or OUT
- `similarity_score` (FLOAT): Face recognition confidence
- `liveness_passed` (BOOLEAN): Liveness check result
- `created_at` (TIMESTAMP): Creation timestamp

## Troubleshooting

### Database won't migrate

If migrations fail, check:

1. **PostgreSQL is running:**
   ```bash
   docker ps | grep postgres
   ```

2. **DATABASE_URL is correct:**
   ```bash
   echo $DATABASE_URL
   ```

3. **Database exists:**
   ```bash
   psql -h localhost -U postgres -l
   ```

### Resetting the Database

For development, to reset everything:

```bash
# Stop containers and remove volumes
docker compose down -v

# Rebuild and start
docker compose up --build
```

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with hot reload
- `npm run migrate` - Run pending migrations (production)
- `npm run migrate:dev` - Create and run migrations (development)

## Next Steps

1. Make sure `.env` is configured correctly
2. Run `npm install`
3. For local dev: `npm run migrate:dev && npm run dev`
4. For Docker: `docker compose up --build`

Done! Tables will be created automatically.


