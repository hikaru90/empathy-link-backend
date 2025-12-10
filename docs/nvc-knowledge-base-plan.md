# Plan: NVC Knowledge Base with Internationalization & Dashboard

## Overview
Build a pgvector knowledge base for Nonviolent Communication (NVC) with multi-language support and a dashboard for managing and interacting with the knowledge. This will enable semantic search and retrieval of NVC knowledge for AI responses and user education.

## 1. Database Schema Design

### New Table: `nvc_knowledge`

**Option A: Separate entries per language (Recommended)**
```typescript
- id: uuid (primary key)
- knowledge_id: uuid (links DE/EN versions together)
- language: text ('de' | 'en')
- title: text
- content: text
- embedding: vector(768)
- category: text (e.g., "principles", "examples", "techniques")
- subcategory: text (optional, e.g., "observation", "feelings", "needs")
- source: text (e.g., "Marshall Rosenberg", "NVC Foundation")
- tags: text[] (language-agnostic tags)
- priority: integer (1-5, for relevance ranking)
- is_active: boolean (for soft deletion/archiving)
- created: timestamp
- updated: timestamp
- created_by: text (user_id, nullable for system entries)
```

**Why separate entries?**
- Independent embeddings per language (better semantic search)
- Easier querying by language
- Simpler dashboard filtering
- Better performance for language-specific searches

### Indexes
- HNSW index on `embedding` (for similarity search)
- B-tree index on `category` (for filtering)
- B-tree index on `language` (for language filtering)
- B-tree index on `knowledge_id` (for linking translations)
- GIN index on `tags` (for tag-based queries)
- B-tree index on `is_active` (for filtering active entries)

## 2. Knowledge Organization Strategy

### Categories (Language-Agnostic)
1. **principles** - Core NVC principles
2. **techniques** - Practical techniques
3. **examples** - Real-world scenarios
4. **concepts** - Key concepts and definitions
5. **quotes** - Inspirational quotes
6. **common_mistakes** - What to avoid
7. **faq** - Frequently asked questions
8. **exercises** - Practice exercises

### Subcategories
- `observation`, `feelings`, `needs`, `requests`
- `self_empathy`, `empathy_for_others`
- `expressing`, `receiving`

### Tags System
- Flexible tagging: `["basics", "advanced", "conflict", "relationships", "workplace"]`
- Multi-select in dashboard
- Searchable via GIN index

### Content Structure
- **Chunk size**: 200-500 words per entry (optimal for embeddings)
- **Self-contained**: Each entry should be understandable on its own
- **Context-rich**: Include what, why, and how
- **Cross-referenced**: Link to related concepts

## 3. Dashboard Design

### Dashboard Features

#### A. Knowledge Management Interface

**1. Knowledge List View**
- Table/grid display with columns:
  - Title (DE/EN toggle)
  - Category
  - Language
  - Priority
  - Tags
  - Last Updated
  - Actions (Edit, Delete, Duplicate)
- **Filters**:
  - Language (DE/EN/All)
  - Category
  - Tags
  - Search (semantic + text)
- **Sorting**: Date, Priority, Title
- **Pagination**: Handle large datasets

**2. Knowledge Editor**
- Form fields:
  - Title (DE/EN tabs or side-by-side)
  - Content (DE/EN tabs, markdown editor)
  - Category (dropdown)
  - Subcategory (dropdown, depends on category)
  - Source (text input)
  - Tags (multi-select with autocomplete)
  - Priority (1-5 slider)
  - Language selector (for creating new entry)
  - Link to translation (if exists)
- **Features**:
  - Preview mode
  - Embedding status indicator
  - Auto-save drafts
  - Save/Cancel buttons

**3. Bulk Operations**
- Import from JSON/CSV
- Export to JSON/CSV
- Bulk tag assignment
- Bulk category change
- Bulk delete/archive

#### B. Search & Discovery

**1. Semantic Search**
- Query input with language selector
- Category filter
- Results with similarity scores
- "Find similar" button for any entry
- Search history

**2. Knowledge Graph View**
- Visual relationships between entries
- Related entries visualization
- Category clusters

#### C. Analytics & Insights

**1. Usage Statistics**
- Most searched entries
- Most used categories
- Language distribution
- Embedding quality metrics

**2. Knowledge Gaps**
- Categories with few entries
- Missing translations
- Low-priority entries needing review

## 4. API Endpoints Design

### Knowledge Management
```
GET    /api/nvc-knowledge                    - List all (with filters)
GET    /api/nvc-knowledge/:id                - Get single entry
POST   /api/nvc-knowledge                    - Create new entry
PUT    /api/nvc-knowledge/:id                 - Update entry
DELETE /api/nvc-knowledge/:id                 - Delete entry
POST   /api/nvc-knowledge/:id/duplicate       - Duplicate entry
POST   /api/nvc-knowledge/bulk                - Bulk operations
```

### Search & Retrieval
```
POST   /api/nvc-knowledge/search              - Semantic search
GET    /api/nvc-knowledge/:id/similar        - Find similar entries
GET    /api/nvc-knowledge/categories          - List all categories
GET    /api/nvc-knowledge/tags                - List all tags
```

### Dashboard-Specific
```
GET    /api/nvc-knowledge/stats               - Analytics data
GET    /api/nvc-knowledge/gaps                - Knowledge gaps
POST   /api/nvc-knowledge/import              - Import from file
GET    /api/nvc-knowledge/export              - Export to file
```

## 5. Implementation Steps

### Phase 1: Database & Core Functions
1. **Create schema with internationalization**
   - Add `nvc_knowledge` table to `drizzle/schema.ts`
   - Create migration file
   - Set up all indexes

2. **Core utility functions** (`src/lib/nvc-knowledge.ts`)
   - `generateNVCEmbedding(text: string, language: string)`
   - `createNVCKnowledgeEntry(data)`
   - `updateNVCKnowledgeEntry(id, data)`
   - `searchNVCKnowledge(query, language, options)`
   - `findSimilarNVCKnowledge(id, language, limit)`
   - `linkTranslations(knowledgeId1, knowledgeId2)`

### Phase 2: API Routes
1. **Create `src/routes/nvc-knowledge.ts`**
   - CRUD endpoints
   - Search endpoints
   - Bulk operations
   - Analytics endpoints

2. **Add authentication/authorization**
   - Admin-only for management endpoints
   - Public read for search (or authenticated users)
   - Rate limiting for search

### Phase 3: Dashboard Frontend
1. **Create dashboard route/page**
   - Knowledge list component
   - Editor component
   - Search component
   - Analytics component

2. **State management**
   - Knowledge state
   - Filters state
   - Editor state

3. **API integration**
   - Fetch knowledge
   - Create/update/delete operations
   - Search functionality

### Phase 4: Population & Seeding
1. **Create seed data script** (`scripts/populate-nvc-knowledge.ts`)
   - Initial 50-100 entries in DE/EN
   - Generate embeddings
   - Import to database

2. **Create import/export utilities**
   - JSON format (structured)
   - CSV format (for non-technical users)

## 6. Data Structure Examples

### Example Entry (Linked Translations)
```json
{
  "knowledge_id": "uuid-123",
  "entries": [
    {
      "id": "uuid-123-de",
      "language": "de",
      "title": "Beobachtung vs. Bewertung",
      "content": "In der GFK sind Beobachtungen sachliche Beschreibungen ohne Urteil. 'Du hast gestern nicht angerufen' ist eine Beobachtung. 'Du ignorierst mich' ist eine Bewertung. Beobachtungen schaffen Verbindung; Bewertungen schaffen Verteidigung.",
      "category": "principles",
      "subcategory": "observation",
      "source": "Marshall Rosenberg - Gewaltfreie Kommunikation",
      "tags": ["grundlagen", "beobachtung", "bewertung"],
      "priority": 5,
      "embedding": [0.123, ...]
    },
    {
      "id": "uuid-123-en",
      "language": "en",
      "title": "Observation vs Evaluation",
      "content": "In NVC, observations are factual descriptions without judgment. 'You didn't call me yesterday' is an observation. 'You ignored me' is an evaluation. Observations create connection; evaluations create defensiveness.",
      "category": "principles",
      "subcategory": "observation",
      "source": "Marshall Rosenberg - Nonviolent Communication",
      "tags": ["basics", "observation", "evaluation"],
      "priority": 5,
      "embedding": [0.456, ...]
    }
  ]
}
```

## 7. Dashboard UI/UX Considerations

### Layout
- **Sidebar navigation** - Categories, filters, quick actions
- **Main content area** - List/editor/search view
- **Modal dialogs** - For editing, confirmation
- **Toast notifications** - For action feedback

### Components Needed
1. `KnowledgeTable` - List view with filters
2. `KnowledgeEditor` - Create/edit form with markdown
3. `SemanticSearch` - Search interface with results
4. `KnowledgeCard` - Display single entry
5. `CategoryFilter` - Filter sidebar component
6. `TagManager` - Tag input/display component
7. `AnalyticsDashboard` - Stats visualization
8. `LanguageToggle` - Switch between DE/EN
9. `TranslationLinker` - Link translations together

### Technology Stack Options
- **Frontend framework**: React/Vue/Svelte
- **UI library**: Tailwind CSS + shadcn/ui or similar
- **State management**: Zustand/Redux or React Query
- **Forms**: React Hook Form
- **Markdown editor**: MDX Editor or similar
- **Charts**: Recharts or Chart.js for analytics

## 8. Internationalization Strategy

### Content Level
- **Separate entries per language** - Each language has its own entry with its own embedding
- **Linked via `knowledge_id`** - Translations are linked together
- **Independent embeddings** - Better semantic search per language

### UI Level
- **Dashboard UI** - In user's preferred language
- **Language switcher** - In dashboard header
- **Side-by-side editing** - Show both languages when editing linked entries

### Search Strategy
- **Default language** - Search in user's language by default
- **Cross-language search** - Option to search across languages
- **Translation linking** - Easy discovery of translations

## 9. Embedding Generation Strategy

### Text Preparation
- **Format**: `[Category] Title: Content`
- **Include context**: Related concepts, examples
- **Normalize**: Whitespace, formatting consistency

### Embedding Model
- **Model**: `text-embedding-001`
- **Consistency**: Same model as memories for compatibility
- **Batch processing**: For efficiency when populating

### Chunking Strategy
- **Logical chunks**: Split long content into coherent pieces
- **Overlap**: Add overlap between related chunks
- **Size**: 200-500 words per chunk (optimal for embeddings)

## 10. Migration Path

### Existing Data
- If you have existing NVC content, create migration script
- Generate embeddings for existing content
- Link translations if available

### Future Content
- **Dashboard-first approach** - New entries created via dashboard
- **AI-assisted translation** - Suggest translations for new entries
- **Community contributions** - Future feature for user submissions

## 11. Security & Permissions

### Access Control
- **Admin role** - Required for knowledge management
- **Read-only** - For regular users (if exposed)
- **API rate limiting** - For search endpoints

### Data Validation
- **Content validation** - Validate before saving
- **Sanitization** - Sanitize user input
- **Embedding validation** - Ensure embedding generation succeeded

## 12. Future Enhancements

- **Versioning** - Track changes to knowledge entries
- **User feedback** - Allow users to rate knowledge relevance
- **Analytics** - Track most-used knowledge in AI responses
- **Dynamic expansion** - AI suggests new knowledge based on gaps
- **Community contributions** - Allow users to suggest knowledge
- **Knowledge relationships** - Explicit relationship mapping
- **Multi-format export** - PDF, EPUB for offline use

## 13. Questions & Decisions

### Resolved
- ✅ **Separate entries per language** - Better for semantic search
- ✅ **Global knowledge base** - Not user-specific
- ✅ **Read-only for users** - Management via admin dashboard

### To Decide
- Frontend framework choice (React/Vue/Svelte)
- Dashboard deployment (separate app or integrated)
- Community contributions (now or later)
- Versioning system (simple or comprehensive)

## 14. Success Metrics

- **Knowledge coverage**: 100+ entries per language
- **Search accuracy**: High relevance in semantic search
- **Dashboard usage**: Regular updates and management
- **AI integration**: Improved NVC responses using knowledge
- **User value**: Better guidance and education

