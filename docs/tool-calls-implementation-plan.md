# Tool Calls Implementation Plan

## Current State Analysis

### Current Flow (Per Message)
When a user sends a chat message, the following AI functions are called:

1. **Path Switching Analysis** (`analyzePathSwitchingIntent`)
   - Model: `gemini-2.5-flash`
   - Purpose: Determine if user wants to switch conversation paths
   - Always called (except feedback path)
   - **Token cost**: ~500-800 tokens per call

2. **NVC Knowledge Retrieval** (`retrieveNVCKnowledge`)
   - Model: `gemini-2.0-flash-lite` (concept extraction)
   - Purpose: Extract concepts and search NVC knowledge base
   - Always called
   - **Token cost**: ~300-500 tokens per call

3. **NVC Component Extraction** (`extractNVCFromMessage`)
   - Model: `gemini-2.0-flash-lite`
   - Purpose: Extract observation, feelings, needs, request from message
   - Always called
   - **Token cost**: ~400-600 tokens per call

4. **Main AI Response** (`getAiResponseWithRetry`)
   - Model: `gemini-2.5-flash`
   - Purpose: Generate conversational response
   - Always called
   - **Token cost**: ~2000-4000 tokens per call

**Total per message**: ~3200-5900 tokens across 4 separate AI calls

### Problems
- **High token usage**: Multiple AI calls per message
- **Slow response times**: Sequential/parallel calls add latency
- **Unnecessary calls**: Some tools may not be needed for every message
- **No context sharing**: Each call doesn't benefit from others' results

---

## Proposed Architecture: Custom Tool Calling with JSON Structured Output

### Concept
Instead of calling multiple AI functions upfront, use a **custom tool calling solution** using Gemini 2.0 with JSON structured output. The AI model decides which tools to use based on the message context and returns a JSON object specifying tool calls. **The AI can call multiple tools in parallel or sequentially** when a message fits multiple use cases.

### Why Custom Solution?
- Gemini 2.5's built-in tool calling is not good enough for our needs
- Full control over tool calling logic and execution
- More flexible tool parameter handling
- Better error handling and retry logic
- Can use Gemini 2.0 (more cost-effective) with structured output

### Benefits
- ✅ **Reduced token usage**: Single AI call instead of 4
- ✅ **Faster responses**: One round-trip instead of multiple
- ✅ **Smarter decisions**: AI decides what's needed
- ✅ **Context awareness**: Tools can use results from previous tools
- ✅ **Better cost efficiency**: Only pay for what's actually used
- ✅ **Multiple tool execution**: AI can call multiple tools when message fits multiple scenarios
- ✅ **Parallel execution**: Tools that don't depend on each other can run in parallel

---

## Tool Definitions

### 1. `search_memories`
**Purpose**: Search user's personal memories for relevant context

**When to use**: 
- User mentions past experiences, relationships, or personal history
- Context about the user would help the response
- User asks "what do you remember about..."

**Parameters**:
```typescript
{
  query: string;        // Search query (defaults to user message)
  limit?: number;       // Max results (default: 3)
  minSimilarity?: number; // Min similarity threshold (default: 0.7)
}
```

**Returns**: Array of memory objects with similarity scores

**Cost**: Database query only (no AI call)

---

### 2. `retrieve_nvc_knowledge`
**Purpose**: Retrieve relevant NVC knowledge from knowledge base

**When to use**:
- User asks about NVC concepts or principles
- Situation would benefit from NVC guidance
- User seems confused about NVC concepts
- Teaching moment detected

**Parameters**:
```typescript
{
  query: string;        // Search query (AI can optimize this)
  limit?: number;       // Max results (default: 3)
  minSimilarity?: number; // Min similarity (default: 0.7)
  category?: string;    // Filter by category
  tags?: string[];      // Filter by tags
}
```

**Returns**: Array of NVC knowledge entries with similarity scores

**Cost**: 1 AI call (concept extraction) + vector search

**Note**: This tool internally uses AI for concept extraction, but it's only called when needed.

---

### 3. `extract_nvc_components`
**Purpose**: Extract NVC components (observation, feelings, needs, request) from message

**When to use**:
- User explicitly mentions feelings/needs/observations
- Need to track NVC components for analysis
- User is practicing NVC formulation
- Path requires structured NVC data

**Parameters**:
```typescript
{
  message: string;      // Message to analyze
  locale?: string;     // Language (default: 'de')
}
```

**Returns**: 
```typescript
{
  observation: string | null;
  feelings: string[];
  needs: string[];
  request: string | null;
}
```

**Cost**: 1 AI call (lightweight model)

---

### 4. `analyze_path_switch`
**Purpose**: Determine if user wants to switch conversation paths

**When to use**:
- User explicitly mentions wanting to switch topics/paths
- User asks about different conversation modes
- Current path seems complete or user wants to move on
- User is in 'idle' path and mentions a specific topic

**Parameters**:
```typescript
{
  message: string;           // Current user message
  currentPath: string;       // Current conversation path
  recentHistory: Array<{role: string; content: string}>; // Last 4-6 messages
}
```

**Returns**:
```typescript
{
  shouldSwitch: boolean;
  confidence: number;        // 0-100
  suggestedPath: string | null;
  reason: string;
  currentPathComplete: boolean;
}
```

**Cost**: 1 AI call (lightweight model)

**Note**: This might be called less frequently if we can detect path switches heuristically first.

---

## Implementation Strategy

### Phase 1: Core Tool Call Infrastructure

**Goal**: Set up basic tool calling framework

1. **Update Gemini Client** (`lib/gemini.ts`)
   - Add support for JSON structured output (responseSchema)
   - Create tool call request/response schema
   - Implement tool execution handler
   - Add tool result injection back into conversation

2. **Tool Registry** (`lib/tools/index.ts`)
   - Create centralized tool registry
   - Define tool schemas (JSON Schema format)
   - Map tool names to execution functions

3. **Tool Execution Handler**
   - Execute tools based on AI's function calls
   - Handle errors gracefully
   - Return results in format AI expects

**Files to create/modify**:
- `lib/gemini.ts` - Add JSON structured output support for tool calls
- `lib/tool-caller.ts` - NEW: Custom tool calling orchestration
- `lib/tools/index.ts` - Tool registry and execution
- `lib/tools/memories.ts` - Memory search tool
- `lib/tools/nvc-knowledge.ts` - NVC knowledge tool
- `lib/tools/nvc-extraction.ts` - NVC extraction tool
- `lib/tools/path-analysis.ts` - Path switching tool

---

### Phase 2: Smart Tool Selection

**Goal**: Let AI decide which tools to use

1. **Update Main Response Function**
   - Replace multiple sequential calls with single tool-enabled call
   - Provide tool definitions to AI
   - Handle tool calls in response

2. **Custom Tool Call Flow**:
   ```
   User Message
     ↓
   AI (Gemini 2.0) with Tool Definitions + JSON Schema
     ↓
   AI returns JSON: {
     toolCalls: [
       { tool: "search_memories", params: {...} },
       { tool: "extract_nvc_components", params: {...} },
       { tool: "retrieve_nvc_knowledge", params: {...} }
     ]
   }
     ↓
   System executes ALL requested tools (in parallel when possible):
     - search_memories()
     - extract_nvc_components()
     - retrieve_nvc_knowledge()
     ↓
   All results formatted and injected back to AI
     ↓
   AI generates final response with combined context
   ```

3. **Multiple Tool Call Scenarios**:
   - **Parallel execution**: Tools that don't depend on each other run simultaneously
     - Example: `search_memories()` + `retrieve_nvc_knowledge()` can run in parallel
   - **Sequential execution**: Tools that depend on previous results run in order
     - Example: `extract_nvc_components()` → `retrieve_nvc_knowledge()` (using extracted needs/feelings)
   - **Conditional chaining**: AI can call additional tools based on initial results
     - Example: If `search_memories()` returns no results, AI might call `retrieve_nvc_knowledge()` as fallback

3. **Fallback Strategy**
   - If AI doesn't call a tool but we need it (e.g., path switching), call it separately
   - Gradually reduce fallbacks as AI learns

**Files to modify**:
- `routes/bullshift.ts` - Refactor `/send` endpoint
- `lib/gemini.ts` - Implement custom tool calling with JSON structured output
- `lib/tool-caller.ts` - New file for tool call orchestration

---

### Phase 3: Optimization & Caching

**Goal**: Reduce redundant calls and improve performance

1. **Heuristic Pre-filtering**
   - Simple keyword checks before calling expensive tools
   - Example: If message is "hi", don't call NVC extraction

2. **Caching Strategy**
   - Cache tool results for short-lived contexts
   - Cache NVC knowledge searches (TTL: 5 minutes)
   - Cache memory searches (TTL: 1 minute)

3. **Parallel Tool Execution**
   - When AI calls multiple tools, execute them in parallel when possible
   - Tools that don't depend on each other run simultaneously
   - Tools that depend on previous results run sequentially
   - Reduce latency for multi-tool scenarios
   - Example: If AI calls `search_memories()` and `retrieve_nvc_knowledge()` together, both execute in parallel

**Files to create/modify**:
- `lib/tools/cache.ts` - Tool result caching
- `lib/tools/executor.ts` - Parallel execution handler

---

### Phase 4: Advanced Features

**Goal**: Enhance tool calling with advanced capabilities

1. **Tool Chaining**
   - Allow tools to call other tools
   - Example: `retrieve_nvc_knowledge` could use `extract_nvc_components` internally

2. **Conditional Tool Execution**
   - Tools can return "should call another tool" hints
   - Example: If no memories found, suggest calling NVC knowledge

3. **Tool Usage Analytics**
   - Track which tools are called most
   - Optimize tool definitions based on usage
   - Identify unnecessary tools

**Files to create**:
- `lib/tools/chain.ts` - Tool chaining logic
- `lib/tools/analytics.ts` - Usage tracking

---

## Tool Call Example Flow

### Scenario: User says "Ich fühle mich frustriert, weil mein Partner nicht zuhört"

**Current Flow** (4 AI calls):
1. Path analysis → No switch needed
2. Memory search → Finds 2 relevant memories
3. NVC knowledge → Finds 3 entries about "Empathisches Zuhören"
4. NVC extraction → Extracts: feelings=["Frustration"], needs=["Verständnis"]
5. Main response → Uses all context

**New Flow** (2 AI calls: tool decision + final response):
```
User: "Ich fühle mich frustriert, weil mein Partner nicht zuhört"
  ↓
AI (Gemini 2.0) with JSON schema returns:
{
  toolCalls: [
    { tool: "search_memories", params: {query: "Partner Zuhören"} },
    { tool: "extract_nvc_components", params: {message: "..."} },
    { tool: "retrieve_nvc_knowledge", params: {query: "Empathisches Zuhören Frustration"} }
  ]
}
  ↓
System executes all 3 tools in parallel
  ↓
Results formatted and injected back:
  - memories: [...]
  - nvc_components: {feelings: ["Frustration"], needs: ["Verständnis"]}
  - nvc_knowledge: [...]
  ↓
AI (Gemini 2.5) generates final response using all context
```

**Token Savings**: ~40-50% reduction (from ~4000 tokens to ~2000-2400 tokens)
- Tool decision: ~300-500 tokens (Gemini 2.0)
- Tool execution: Database queries only (no AI cost)
- Final response: ~1500-2000 tokens (Gemini 2.5)

---

## Risk Mitigation

### Risks:
1. **AI doesn't call needed tools**
   - Mitigation: Monitor tool usage and adjust prompts
   - Add clear tool descriptions to guide AI decisions

2. **Tool execution errors**
   - Mitigation: Graceful error handling
   - Return error context to AI for retry

3. **Increased latency** (if AI calls many tools)
   - Mitigation: Parallel execution
   - Caching frequently used results

4. **Cost increase** (if AI calls tools unnecessarily)
   - Mitigation: Monitor tool usage
   - Add rate limiting per tool
   - Optimize tool definitions

---

## Success Metrics

### Primary Metrics:
- **Token usage reduction**: Target 50-70% reduction
- **Response time**: Target <2s average (currently ~3-5s)
- **Cost per message**: Target 60% reduction

### Secondary Metrics:
- **Tool usage frequency**: Track which tools are called
- **User satisfaction**: No degradation in response quality
- **Error rate**: <1% tool execution errors

---

## Technical Considerations

### Custom Tool Calling Implementation

**Using Gemini 2.0 with JSON Structured Output:**
- Use `responseMimeType: 'application/json'` and `responseSchema` in chat config
- AI returns a JSON object with tool call specifications
- Full control over tool execution logic
- Can handle multiple tools in a single JSON response

**Model Choice:**
- Use `gemini-2.0-flash-lite` for tool call decision (lightweight, fast)
- Use `gemini-2.5-flash` for final response generation (better quality)

### Tool Schema Format
```typescript
{
  name: "search_memories",
  description: "Search user's personal memories for relevant context",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      limit: { type: "number", default: 3 }
    },
    required: ["query"]
  }
}
```

### Custom Tool Call JSON Schema

**Tool Call Request Schema:**
```typescript
{
  type: "object",
  properties: {
    toolCalls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tool: {
            type: "string",
            enum: ["search_memories", "extract_nvc_components", "retrieve_nvc_knowledge", "analyze_path_switch"]
          },
          params: {
            type: "object",
            // Tool-specific parameters
          }
        },
        required: ["tool", "params"]
      }
    },
    reasoning: {
      type: "string",
      description: "Brief explanation of why these tools are needed"
    }
  },
  required: ["toolCalls"]
}
```

**Example AI Response (JSON):**
```typescript
{
  toolCalls: [
    {
      tool: "search_memories",
      params: { query: "Partner Zuhören", limit: 3 }
    },
    {
      tool: "extract_nvc_components",
      params: { message: "Ich fühle mich traurig..." }
    },
    {
      tool: "retrieve_nvc_knowledge",
      params: { query: "Traurigkeit Verbindung Bedürfnisse", limit: 3 }
    }
  ],
  reasoning: "User mentions feelings and needs, so I need to extract NVC components, search memories for context, and retrieve relevant NVC knowledge."
}
```

**Tool Execution Strategy:**
1. **Parse JSON response**: Extract `toolCalls` array from AI's structured output
2. **Validate tool calls**: Ensure tool names are valid and parameters match schemas
3. **Identify dependencies**: Determine which tools can run in parallel vs sequentially
4. **Execute parallel tools**: Run independent tools simultaneously using `Promise.all()`
5. **Execute sequential tools**: Run dependent tools after their prerequisites complete
6. **Aggregate results**: Combine all tool results into a formatted string
7. **Inject back to AI**: Send all results back to AI in one message for final response generation

---

## Next Steps

1. **Review & Approval**: Get feedback on this plan
2. **Prototype**: Build minimal tool calling example
3. **Test**: Compare old vs new flow on sample messages
4. **Iterate**: Refine based on results
5. **Implement**: Full implementation following phases

---

## Multiple Tool Call Implementation Details

### Tool Dependency Graph

**Independent Tools** (can run in parallel):
- `search_memories` ↔ `retrieve_nvc_knowledge` (no dependencies)
- `search_memories` ↔ `extract_nvc_components` (no dependencies)
- `retrieve_nvc_knowledge` ↔ `extract_nvc_components` (no dependencies)
- `analyze_path_switch` ↔ any other tool (no dependencies)

**Dependent Tools** (should run sequentially):
- `extract_nvc_components` → `retrieve_nvc_knowledge` (can use extracted needs/feelings for better search)
- `search_memories` → `retrieve_nvc_knowledge` (can use memory context for better search)

### Execution Strategy

```typescript
interface ToolCall {
  tool: string;
  params: Record<string, any>;
}

interface ToolResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: string;
}

async function executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
  // 1. Validate tool calls
  const validCalls = toolCalls.filter(call => isValidTool(call.tool));
  
  // 2. Group tools by dependency level
  const independent = validCalls.filter(t => isIndependent(t.tool));
  const dependent = validCalls.filter(t => !isIndependent(t.tool));
  
  // 3. Execute independent tools in parallel
  const parallelResults = await Promise.allSettled(
    independent.map(toolCall => executeTool(toolCall.tool, toolCall.params))
  );
  
  // 4. Execute dependent tools sequentially (with access to previous results)
  const sequentialResults: ToolResult[] = [];
  const allPreviousResults = [...parallelResults, ...sequentialResults];
  
  for (const toolCall of dependent) {
    try {
      const result = await executeTool(toolCall.tool, toolCall.params, {
        previousResults: allPreviousResults
      });
      sequentialResults.push({ tool: toolCall.tool, success: true, result });
    } catch (error) {
      sequentialResults.push({ 
        tool: toolCall.tool, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // 5. Format and return all results
  const formattedParallel = parallelResults.map((settled, idx) => ({
    tool: independent[idx].tool,
    success: settled.status === 'fulfilled',
    result: settled.status === 'fulfilled' ? settled.value : undefined,
    error: settled.status === 'rejected' ? settled.reason.message : undefined
  }));
  
  return [...formattedParallel, ...sequentialResults];
}
```

### Tool Call Examples

**Example 1: User mentions feelings and asks about NVC**
```
User: "Ich fühle mich traurig und allein. Was kann ich tun?"

AI Tool Calls:
1. extract_nvc_components(message) → { feelings: ["traurig"], needs: ["Verbindung"] }
2. retrieve_nvc_knowledge(query: "Traurigkeit Verbindung Bedürfnisse") → [knowledge entries]
3. search_memories(query: "traurig allein") → [relevant memories]

All 3 tools execute in parallel, then AI generates response with all context.
```

**Example 2: User mentions past experience and wants empathy**
```
User: "Mein Partner hat mich gestern ignoriert. Ich brauche Empathie."

AI Tool Calls:
1. search_memories(query: "Partner ignoriert") → [memories]
2. extract_nvc_components(message) → { observation: "...", feelings: [...], needs: [...] }
3. retrieve_nvc_knowledge(query: "Empathie Bedürfnisse") → [knowledge]

All 3 tools execute in parallel.
```

**Example 3: User wants to switch paths and needs context**
```
User: "Können wir zur Selbst-Empathie wechseln? Ich fühle mich gestresst."

AI Tool Calls:
1. analyze_path_switch(message, currentPath) → { shouldSwitch: true, suggestedPath: "self_empathy" }
2. extract_nvc_components(message) → { feelings: ["gestresst"], needs: [...] }
3. retrieve_nvc_knowledge(query: "Selbst-Empathie Stress") → [knowledge]

All 3 tools execute in parallel.
```

### Implementation Checklist

- [ ] Create JSON schema for tool call requests (using Gemini 2.0 structured output)
- [ ] Update `getAiResponse()` to support JSON structured output for tool calls
- [ ] Create tool registry with all tool definitions and schemas
- [ ] Implement `getToolCalls()` function using Gemini 2.0 with JSON schema
- [ ] Implement tool execution handler that supports multiple calls
- [ ] Add parallel execution for independent tools using `Promise.allSettled()`
- [ ] Add sequential execution for dependent tools
- [ ] Create tool result formatter to inject results back into conversation
- [ ] Update final response generation to use Gemini 2.5 with tool results
- [ ] Update `/send` endpoint to use custom tool calling flow
- [ ] Add error handling for tool execution failures (continue with other tools)
- [ ] Add logging for tool call decisions and execution
- [ ] Add validation for tool call JSON responses

## Questions to Resolve

1. **Path switching**: Should this be a tool or always checked? (Recommendation: Tool, but with heuristic pre-check)
2. **NVC extraction**: Always needed or only when relevant? (Recommendation: Tool, called when needed)
3. **Memory search**: Always needed or contextual? (Recommendation: Tool, AI decides)
4. **NVC knowledge**: Always needed or only for teaching moments? (Recommendation: Tool, AI decides)
5. **Multiple tool calls**: Should we limit the number of tools AI can call at once? (Recommendation: Max 5 tools per message)
6. **Tool timeout**: Should individual tools have timeouts? (Recommendation: Yes, 5s per tool, 15s total)
7. **Fallback behavior**: If a tool fails, should we continue with other tools? (Recommendation: Yes, log error and continue)

---

## Estimated Timeline

- **Phase 1**: 1-2 weeks (Core infrastructure)
- **Phase 2**: 1 week (Smart tool selection)
- **Phase 3**: 1 week (Optimization)
- **Phase 4**: 2 weeks (Advanced features)

**Total**: 5-6 weeks for full implementation

---

## References

- [Gemini JSON Structured Output](https://ai.google.dev/docs/structured_output)
- Current implementation: `routes/bullshift.ts` lines 156-582
- Tool functions: `lib/ai-tools.ts`
- Memory functions: `lib/memory.ts`
- NVC knowledge functions: `lib/nvc-knowledge.ts`

