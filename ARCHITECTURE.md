# AIVA Architecture Documentation

## System Overview

AIVA (Artificial Intelligent Virtual Assistant) is a Personal AI Operating System that serves as a centralized platform for managing a user's digital life. It combines AI-powered assistance with task management, knowledge storage, file intelligence, email processing, calendar integration, and workflow automation.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│  Web App (Next.js)  │  Desktop (Electron)  │  Mobile (RN)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                              │
│                    (Fastify + CORS + Helmet)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND SERVICES                            │
├─────────────────────────────────────────────────────────────────┤
│  Auth  │  Tasks  │  Notes  │  Files  │  Calendar  │  Email     │
│  Automation  │  Analytics  │  AI Orchestration (AIVA Core)      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AI LAYER (AIVA)                            │
├─────────────────────────────────────────────────────────────────┤
│  Intent Classifier  │  Agent Orchestrator  │  Tool Registry     │
│  Memory Service     │  RAG Pipeline        │  LLM Integration   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL (Primary DB)  │  Redis (Cache)  │  Vector DB (RAG)  │
│  S3 Compatible Storage    │  Pinecone/Weaviate                 │
└─────────────────────────────────────────────────────────────────┘
```

## Core Modules

### 1. AI Assistant (AIVA Core)

The central intelligence layer that orchestrates all system operations.

**Components:**
- `AIVAService` - Main chat interface and conversation management
- `AgentOrchestrator` - Routes requests to specialized agents
- `IntentClassifier` - Pattern + LLM-based intent detection
- `MemoryService` - Conversation context and short-term memory
- `RAGService` - Document chunking, embedding, and retrieval
- `ToolRegistry` - Central registry of executable tools

**Agents:**
- Task Agent - Task creation, prioritization, scheduling
- Calendar Agent - Event management, availability checking
- Email Agent - Email summarization, task extraction
- Research Agent - Knowledge base queries, document research
- Automation Agent - Workflow execution, rule management

### 2. Task Management System

Full-featured task management with AI-powered prioritization.

**Features:**
- Natural language task creation
- Hierarchical tasks (parent/subtasks)
- Priority-based sorting
- Due date tracking
- Status workflow (PENDING → IN_PROGRESS → COMPLETED)
- Tag-based organization

### 3. Knowledge Brain (RAG System)

Personal knowledge base with semantic search capabilities.

**Pipeline:**
1. Document ingestion → File parsing
2. Chunking → 500 token chunks with 50 token overlap
3. Embedding → 1536-dim vectors (OpenAI/Anthropic)
4. Storage → Vector database (Pinecone)
5. Retrieval → Cosine similarity search
6. Generation → LLM synthesis of results

### 4. File Intelligence

AI-powered document understanding.

**Capabilities:**
- Automatic categorization
- Content summarization
- Semantic search
- Related document discovery
- Cross-document comparison

### 5. Email AI

Smart email processing.

**Features:**
- Email summarization
- Task extraction from email content
- Priority detection
- Sentiment analysis
- Smart inbox management

### 6. Calendar System

Intelligent scheduling.

**Features:**
- Natural language event creation
- Smart scheduling suggestions
- Conflict detection
- Availability finder
- Recurring events (RRULE)

### 7. Automation Engine

Trigger-based workflow automation.

**Components:**
- Trigger parser (time-based, event-based, manual)
- Action executor (create task, send notification, create event)
- Condition evaluator
- Workflow templates (morningBrief, meetingPrep, emailProcess)

### 8. Voice Assistant

Speech interface (future implementation).

**Planned:**
- Speech-to-text integration
- Command parsing
- Text-to-speech responses

## Database Schema

### Primary Tables (PostgreSQL)

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| users | User accounts | id, email, passwordHash, timezone |
| sessions | Auth sessions | id, userId, token, expiresAt |
| tasks | Task management | id, userId, title, status, priority, dueDate |
| notes | Knowledge notes | id, userId, title, content, folderId |
| documents | File metadata | id, userId, fileName, storagePath, vectorId |
| calendar_events | Events | id, userId, title, startTime, endTime |
| emails | Email messages | id, accountId, messageId, subject, body |
| conversations | AI chats | id, userId, title |
| messages | Chat messages | id, conversationId, role, content |
| automation_rules | Automation | id, userId, trigger, actions, isActive |
| activity_logs | Audit trail | id, userId, action, resource |

### Vector Database Schema

Stores embeddings for:
- Document chunks
- Note content
- Email summaries

**Retrieval Process:**
1. Query embedding generation
2. Cosine similarity calculation
3. Top-K results (K=10)
4. Re-ranking with metadata filters

## Security Architecture

### Authentication Flow
1. User credentials → bcrypt hash verification
2. JWT token generation (24h expiry)
3. Session storage in PostgreSQL
4. Token refresh mechanism

### Authorization
- Role-Based Access Control (RBAC)
- Resource-level ownership checks
- API key scopes for programmatic access

### Encryption
- TLS 1.3 for data in transit
- AES-256 for sensitive data at rest
- Password hashing with bcrypt (10 rounds)

### API Security
- Rate limiting (100 req/min default)
- Input validation (Zod schemas)
- Request sanitization
- CORS policy enforcement

### AI Safety
- Prompt injection detection
- Data leakage prevention
- Tool access control (allowlist)
- Output filtering

## Infrastructure

### Containerization
- Docker Compose for local development
- Multi-stage builds for production
- Health checks for services

### Deployment
- Kubernetes for orchestration
- Horizontal pod autoscaling
- Load balancer for traffic distribution

### Monitoring
- Winston logging
- Error tracking (Sentry)
- Performance monitoring (Prometheus)
- Uptime monitoring

## Development Roadmap

### Phase 1 - MVP
- Core authentication
- Task management
- Notes system
- Basic chat interface
- Dashboard

### Phase 2 - Knowledge Brain
- Document ingestion
- RAG pipeline
- Vector search
- File intelligence

### Phase 3 - Automation
- Rule builder
- Workflow templates
- Trigger system

### Phase 4 - AI Agents
- All specialized agents
- Agent routing improvements
- Tool expansion

### Phase 5 - Voice & Mobile
- Voice assistant
- Mobile applications
- Desktop packaging

## API Design

### REST Endpoints

```
POST   /auth/register          Register new user
POST   /auth/login             User login
POST   /auth/logout            User logout
GET    /auth/me                Get current user

GET    /tasks                  List tasks
POST   /tasks                  Create task
GET    /tasks/:id              Get task
PUT    /tasks/:id              Update task
DELETE /tasks/:id              Delete task

GET    /notes                  List notes
POST   /notes                  Create note
PUT    /notes/:id              Update note
DELETE /notes/:id              Delete note

GET    /files                  List documents
POST   /files/upload           Upload document
DELETE /files/:id              Delete document

GET    /calendar/events        List events
POST   /calendar/events        Create event
PUT    /calendar/events/:id    Update event
DELETE /calendar/events/:id    Delete event
GET    /calendar/availability  Check availability

GET    /email/messages         List emails
POST   /email/connect          Connect email account
POST   /email/messages/:id/read Mark as read

POST   /ai/chat                Chat with AIVA
GET    /analytics/dashboard    Get dashboard data

GET    /automation             List rules
POST   /automation             Create rule
POST   /automation/:id/trigger Trigger rule
DELETE /automation/:id         Delete rule
```

## Monorepo Structure

```
aiva/
├── apps/
│   ├── web/           # Next.js web application
│   ├── desktop/       # Electron desktop app
│   └── mobile/        # React Native mobile app
├── backend/
│   ├── src/
│   │   ├── ai/        # AI orchestration
│   │   ├── modules/   # Feature modules
│   │   ├── database/  # Prisma ORM
│   │   └── cache/     # Redis caching
│   └── prisma/        # Database schema
├── packages/
│   └── shared/
│       ├── types/     # TypeScript types
│       ├── ui/        # React components
│       └── api-client # API client
└── infrastructure/
    ├── docker/        # Docker configs
    ├── k8s/           # Kubernetes manifests
    └── terraform/     # IaC configs
```

## Technology Choices

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety
- **TailwindCSS** - Utility-first CSS
- **Framer Motion** - Animations
- **Zustand** - State management

### Backend
- **NestJS** - Modular Node.js framework
- **Fastify** - High-performance HTTP server
- **Prisma** - Type-safe ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching layer

### AI
- **LangChain** - LLM orchestration
- **Anthropic/OpenAI** - LLM providers
- **Pinecone** - Vector database

### DevOps
- **Docker** - Containerization
- **Kubernetes** - Orchestration
- **Terraform** - Infrastructure as Code
