# Pluto Server (Node.js)

Node.js backend for Pluto: event storage, embeddings, semantic recall, and graph operations.

## Features

- Express API
- Postgres storage with pgvector-ready schema
- Neo4j graph integration
- Local embeddings via `@xenova/transformers`

## Prerequisites

- Node.js 18+
- pnpm
- Postgres 14+ (with pgvector extension)
- Neo4j 5+

## Setup

```bash
cd apps/server-node
cp .env.example .env
pnpm install
pnpm run migrate
pnpm start
```

For development mode:

```bash
pnpm run dev
```

Server default: `http://localhost:3000`

## Commands

- `pnpm start` - run API server
- `pnpm run dev` - run with nodemon
- `pnpm run migrate` - run migrations
- `pnpm run test:neo4j` - check Neo4j connectivity
- `pnpm run test:mongo` - check Mongo connectivity
