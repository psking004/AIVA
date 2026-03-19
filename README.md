# AIVA - Personal AI Operating System

**AIVA** (Artificial Intelligent Virtual Assistant) is a production-grade Personal AI Operating System that acts as your central digital brain, managing tasks, notes, files, emails, calendar, and workflow automation through an intelligent AI interface.

## Features

- **AI Assistant** - Natural conversation, command interpretation, agent routing
- **Task Management** - AI-powered task creation, prioritization, and scheduling
- **Knowledge Brain** - RAG-based document storage with semantic search
- **File Intelligence** - AI document summarization and categorization
- **Email AI** - Email summarization, task extraction, priority detection
- **Calendar Integration** - Smart scheduling, conflict detection, availability
- **Automation Engine** - Trigger-based workflows and rules
- **Personal Analytics** - Dashboard with productivity metrics

## Tech Stack

### Frontend
- Next.js 14 (React, TypeScript)
- TailwindCSS, Framer Motion
- Zustand (state management)

### Backend
- NestJS (Node.js)
- Fastify HTTP server
- Prisma ORM (PostgreSQL)
- Redis (caching)

### AI Layer
- LangChain
- Anthropic/OpenAI APIs
- RAG pipeline with vector search

### Infrastructure
- Docker, Kubernetes
- PostgreSQL, Redis, Pinecone
- S3-compatible storage

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/aiva.git
cd aiva

# Install dependencies
pnpm install

# Copy environment configuration
cp .env.example .env.local
# Edit .env.local with your API keys

# Start all services with Docker
docker-compose up -d

# Or start services individually
pnpm db:generate    # Generate Prisma client
pnpm db:migrate     # Run database migrations
pnpm dev            # Start development servers
```

### Environment Variables

Required environment variables in `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/aiva

# AI Configuration
ANTHROPIC_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
AI_MODEL=claude-sonnet-4-5-20250929

# Authentication
JWT_SECRET=your-secret-key

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Usage

### Chat with AIVA

```
User: "AIVA, create a task to review the Q1 report tomorrow"
AIVA: "I've created a task: 'Review Q1 report' due tomorrow with HIGH priority."

User: "Summarize my unread emails"
AIVA: "You have 5 unread emails. The main topics are: project updates, meeting invitations, and budget approvals..."

User: "Schedule a team meeting for next Monday at 2pm"
AIVA: "I've scheduled 'Team Meeting' for Monday, March 25 at 2:00 PM."
```

### API Endpoints

```bash
# Authentication
POST /auth/register
POST /auth/login
GET  /auth/me

# Tasks
GET  /tasks
POST /tasks
PUT  /tasks/:id
DELETE /tasks/:id

# AI Chat
POST /ai/chat

# Dashboard
GET  /analytics/dashboard
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed system architecture, database schema, and design decisions.

## Project Structure

```
aiva/
├── apps/
│   ├── web/           # Next.js web application
│   ├── desktop/       # Electron desktop app (planned)
│   └── mobile/        # React Native app (planned)
├── backend/
│   ├── src/
│   │   ├── ai/        # AI orchestration (AIVA core)
│   │   ├── modules/   # Feature modules
│   │   ├── database/  # Prisma ORM
│   │   └── cache/     # Redis caching
│   └── prisma/        # Database schema
├── packages/
│   └── shared/        # Shared types, UI, API client
└── infrastructure/    # Docker, K8s, Terraform
```

## Development

```bash
# Run all services in dev mode
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build all packages
pnpm build
```

## Deployment

### Docker

```bash
# Build and run with Docker Compose
docker-compose build
docker-compose up -d
```

### Kubernetes

```bash
kubectl apply -f infrastructure/k8s/
```

## Roadmap

- [x] Core MVP (Auth, Tasks, Notes, Dashboard)
- [ ] Knowledge Brain (RAG, Vector Search)
- [ ] Automation Engine
- [ ] AI Agents (full implementation)
- [ ] Voice Assistant
- [ ] Desktop Application (Electron)
- [ ] Mobile Application (React Native)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- Built with LangChain for LLM orchestration
- Uses Anthropic's Claude and OpenAI's GPT models
- Database powered by Prisma ORM
- UI components with Radix UI primitives
