# Database Setup Guide

## Option 1: Docker (Recommended)

### Prerequisites
- Docker and Docker Compose installed on your system
- [Download Docker Desktop](https://www.docker.com/products/docker-desktop)

### Steps

1. From the project root (`creative-impression/`), start PostgreSQL container:
```bash
docker-compose up -d
```

2. Verify the database is running:
```bash
docker-compose ps
```
You should see `creative-impression-db` with status `Up`.

3. Seed the database (if you have seed scripts):
```bash
cd backend
npm run prisma:migrate
```

4. To stop the database:
```bash
docker-compose down
```

5. To view database logs:
```bash
docker-compose logs postgres
```

---

## Option 2: Local PostgreSQL Installation

### Prerequisites
- PostgreSQL 13+ installed on your system
- [Download PostgreSQL](https://www.postgresql.org/download/)

### Steps

1. Start PostgreSQL service (varies by OS):
   - **Windows**: Start PostgreSQL from Services or `pg_ctl start`
   - **macOS**: `brew services start postgresql`
   - **Linux**: `sudo systemctl start postgresql`

2. Create the database:
```bash
createdb -U postgres creative_impression
```

3. The connection string in `.env` should work:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/creative_impression"
```

4. Run migrations:
```bash
cd backend
npm run prisma:migrate
```

---

## Database Management Commands

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio (UI to manage data)
npm run prisma:studio

# Reset database (WARNING: deletes all data)
npm run prisma:reset
```

---

## Troubleshooting

### "Can't reach database server at localhost:5432"
- Check if PostgreSQL is running
- Verify DATABASE_URL in `.env` is correct
- Try connecting with `psql`: `psql -U postgres -h localhost`

### "database 'creative_impression' does not exist"
- Run: `createdb -U postgres creative_impression`
- Or run migrations: `npm run prisma:migrate`

### "role 'postgres' does not exist"
- Ensure PostgreSQL server is running
- Check your credentials in DATABASE_URL

---

## Once Database is Running

1. Backend will auto-connect and display:
```
✓ Server running on port 5000
✓ Database connected successfully
```

2. Visit [http://localhost:5000/api/health](http://localhost:5000/api/health) to verify API is running

3. Frontend at [http://localhost:3001](http://localhost:3001) can now make API requests

