/**
 * Custom Tool Caller - Orchestrates tool calling using Gemini 2.0 with JSON structured output
 */

import { getAiClient } from './gemini.js';
import { Type } from '@google/genai';
import { TOOL_REGISTRY, getToolDefinition, isValidTool, isIndependentTool, type ToolCall, type ToolResult } from './tools/index.js';

export interface ToolCallRequest {
	message: string;
	history?: Array<{ role: string; content: string }>;
	context?: {
		userId: string;
		currentPath?: string;
		locale?: string;
		[key: string]: any;
	};
}

export interface ToolCallResponse {
	toolCalls: ToolCall[];
	reasoning?: string;
}

/**
 * Get tool calls from AI using Gemini 2.0 with JSON structured output
 */
export async function getToolCalls(request: ToolCallRequest): Promise<ToolCallResponse> {
	const ai = getAiClient();
	const locale = request.context?.locale || 'de';
	const isGerman = locale.toLowerCase().startsWith('de');

	// Build tool descriptions for the prompt
	const toolDescriptions = Object.values(TOOL_REGISTRY)
		.map(tool => {
			const params = Object.entries(tool.parameters.properties || {})
				.map(([key, schema]: [string, any]) => {
					const required = tool.parameters.required?.includes(key) ? ' (required)' : ' (optional)';
					const type = schema.type === Type.STRING ? 'string' : 
					            schema.type === Type.NUMBER ? 'number' : 
					            schema.type === Type.ARRAY ? 'array' : 
					            schema.type === Type.OBJECT ? 'object' : 'any';
					return `    - ${key} (${type})${required}: ${schema.description || ''}`;
				})
				.join('\n');
			
			return `- **${tool.name}**: ${tool.description}\n  Parameters:\n${params}`;
		})
		.join('\n\n');

	const systemInstruction = isGerman
		? `Du bist ein intelligenter Assistent, der entscheidet, welche Tools für eine Benutzeranfrage benötigt werden.

Verfügbare Tools:
${toolDescriptions}

**WICHTIGE REGELN:**
- Analysiere die Benutzeranfrage sorgfältig
- Rufe NUR die Tools auf, die wirklich benötigt werden
- Du kannst mehrere Tools gleichzeitig aufrufen, wenn die Nachricht mehrere Anwendungsfälle abdeckt
- Wenn keine Tools benötigt werden, gib ein leeres Array zurück
- Gib eine kurze Begründung an, warum diese Tools gewählt wurden

Beispiele:
- "Ich fühle mich traurig" → extract_nvc_components + retrieve_nvc_knowledge (wenn NVC-Wissen hilfreich ist)
- "Was erinnerst du dich über meinen Partner?" → search_memories
- "Können wir zur Selbst-Empathie wechseln?" → analyze_path_switch + extract_nvc_components (wenn Gefühle erwähnt)

Antworte IMMER mit einem JSON-Objekt im folgenden Format:
{
  "toolCalls": [
    { "tool": "tool_name", "params": {...} }
  ],
  "reasoning": "Kurze Begründung"
}`
		: `You are an intelligent assistant that decides which tools are needed for a user request.

Available Tools:
${toolDescriptions}

**IMPORTANT RULES:**
- Carefully analyze the user request
- Call ONLY the tools that are actually needed
- You can call multiple tools simultaneously if the message covers multiple use cases
- If no tools are needed, return an empty array
- Provide a brief reasoning for why these tools were chosen

Examples:
- "I feel sad" → extract_nvc_components + retrieve_nvc_knowledge (if NVC knowledge is helpful)
- "What do you remember about my partner?" → search_memories
- "Can we switch to self-empathy?" → analyze_path_switch + extract_nvc_components (if feelings mentioned)

Always respond with a JSON object in the following format:
{
  "toolCalls": [
    { "tool": "tool_name", "params": {...} }
  ],
  "reasoning": "Brief reasoning"
}`;

	// Create JSON schema for tool call response
	const responseSchema = {
		type: Type.OBJECT,
		properties: {
			toolCalls: {
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						tool: {
							type: Type.STRING,
							description: 'Name of the tool to call'
						},
						params: {
							type: Type.OBJECT,
							description: 'Parameters for the tool'
						}
					},
					required: ['tool', 'params']
				}
			},
			reasoning: {
				type: Type.STRING,
				description: 'Brief explanation of why these tools are needed'
			}
		},
		required: ['toolCalls']
	};

	// Build context message
	const contextParts = [];
	if (request.context?.currentPath) {
		contextParts.push(`Current conversation path: ${request.context.currentPath}`);
	}
	if (request.history && request.history.length > 0) {
		contextParts.push(`Recent conversation:\n${request.history.slice(-4).map(h => `${h.role}: ${h.content}`).join('\n')}`);
	}
	const contextMessage = contextParts.length > 0 ? `\n\n${contextParts.join('\n\n')}` : '';

	const prompt = `User message: "${request.message}"${contextMessage}\n\nAnalyze this message and decide which tools to call. Return a JSON object with the toolCalls array and reasoning.`;

	console.log('🔧 Requesting tool calls from AI...');
	console.log('📝 User message:', request.message.substring(0, 100));

	const chat = ai.chats.create({
		model: 'gemini-2.0-flash-lite',
		config: {
			temperature: 0.3,
			maxOutputTokens: 1024,
			systemInstruction,
			responseMimeType: 'application/json',
			responseSchema
		}
	});

	const result = await chat.sendMessage({ message: prompt });
	const responseText = result.text || '{}';

	console.log('📥 Tool call response:', responseText);

	// Parse JSON response
	let parsed: ToolCallResponse;
	try {
		const cleaned = responseText.trim();
		const jsonText = cleaned.startsWith('```json') 
			? cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '')
			: cleaned.startsWith('```')
			? cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '')
			: cleaned;
		
		parsed = JSON.parse(jsonText);
	} catch (error) {
		console.error('❌ Failed to parse tool call response:', error);
		console.error('Raw response:', responseText);
		return { toolCalls: [], reasoning: 'Failed to parse AI response' };
	}

	// Validate tool calls
	if (!parsed.toolCalls || !Array.isArray(parsed.toolCalls)) {
		console.warn('⚠️ Invalid toolCalls format, returning empty array');
		return { toolCalls: [], reasoning: parsed.reasoning || 'Invalid response format' };
	}

	// Filter out invalid tools
	const validToolCalls = parsed.toolCalls.filter((call: ToolCall) => {
		if (!call.tool || !isValidTool(call.tool)) {
			console.warn(`⚠️ Invalid tool name: ${call.tool}`);
			return false;
		}
		return true;
	});

	console.log(`✅ Validated ${validToolCalls.length} tool call(s) out of ${parsed.toolCalls.length}`);
	if (validToolCalls.length > 0) {
		console.log('🔧 Tools to execute:', validToolCalls.map((t: ToolCall) => t.tool).join(', '));
	}

	return {
		toolCalls: validToolCalls,
		reasoning: parsed.reasoning
	};
}

/**
 * Execute a single tool
 */
async function executeTool(toolCall: ToolCall, context: any): Promise<ToolResult> {
	const tool = getToolDefinition(toolCall.tool);
	if (!tool) {
		return {
			tool: toolCall.tool,
			success: false,
			error: `Tool "${toolCall.tool}" not found`
		};
	}

	try {
		console.log(`⚙️ Executing tool: ${toolCall.tool}`, toolCall.params);
		const result = await tool.execute(toolCall.params, context);
		console.log(`✅ Tool ${toolCall.tool} executed successfully`);
		return {
			tool: toolCall.tool,
			success: true,
			result
		};
	} catch (error) {
		console.error(`❌ Tool ${toolCall.tool} failed:`, error);
		return {
			tool: toolCall.tool,
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

/**
 * Execute multiple tools with parallel/sequential execution
 */
export async function executeTools(toolCalls: ToolCall[], context: any): Promise<ToolResult[]> {
	if (toolCalls.length === 0) {
		return [];
	}

	console.log(`🚀 Executing ${toolCalls.length} tool(s)...`);

	// Group tools by dependency
	const independent = toolCalls.filter(t => isIndependentTool(t.tool));
	const dependent = toolCalls.filter(t => !isIndependentTool(t.tool));

	console.log(`📊 Independent tools: ${independent.length}, Dependent tools: ${dependent.length}`);

	// Execute independent tools in parallel
	const parallelResults = await Promise.allSettled(
		independent.map(toolCall => executeTool(toolCall, context))
	);

	// Format parallel results
	const formattedParallel: ToolResult[] = parallelResults.map((settled, idx) => {
		if (settled.status === 'fulfilled') {
			return settled.value;
		} else {
			return {
				tool: independent[idx].tool,
				success: false,
				error: settled.reason?.message || 'Unknown error'
			};
		}
	});

	// Execute dependent tools sequentially (with access to previous results)
	const sequentialResults: ToolResult[] = [];
	const allPreviousResults = [...formattedParallel, ...sequentialResults];

	for (const toolCall of dependent) {
		const result = await executeTool(toolCall, {
			...context,
			previousResults: allPreviousResults
		});
		sequentialResults.push(result);
		allPreviousResults.push(result);
	}

	const allResults = [...formattedParallel, ...sequentialResults];
	
	console.log(`✅ Completed ${allResults.filter(r => r.success).length}/${allResults.length} tool(s) successfully`);
	
	return allResults;
}

/**
 * Format tool results for injection into AI conversation
 */
export function formatToolResults(results: ToolResult[]): string {
	const successful = results.filter(r => r.success);
	const failed = results.filter(r => !r.success);

	if (successful.length === 0) {
		return 'No tool results available.';
	}

	const sections = successful.map(result => {
		const tool = getToolDefinition(result.tool);
		const toolName = tool?.name || result.tool;
		
		let formatted = `**${toolName}** results:\n`;
		
		// Format based on tool type
		if (result.tool === 'search_memories' && Array.isArray(result.result)) {
			formatted += result.result.length > 0
				? result.result.map((m: any, idx: number) => 
					`${idx + 1}. ${m.content} (similarity: ${((m.similarity || 0) * 100).toFixed(0)}%)`
				).join('\n')
				: 'No relevant memories found.';
		} else if (result.tool === 'extract_nvc_components' && result.result) {
			const nvc = result.result;
			formatted += `Observation: ${nvc.observation || 'None'}\n`;
			formatted += `Feelings: ${nvc.feelings?.length > 0 ? nvc.feelings.join(', ') : 'None'}\n`;
			formatted += `Needs: ${nvc.needs?.length > 0 ? nvc.needs.join(', ') : 'None'}\n`;
			formatted += `Request: ${nvc.request || 'None'}`;
		} else if (result.tool === 'retrieve_nvc_knowledge' && result.result) {
			const knowledge = result.result;
			if (knowledge.knowledgeEntries && Array.isArray(knowledge.knowledgeEntries)) {
				formatted += knowledge.knowledgeEntries.length > 0
					? knowledge.knowledgeEntries.map((entry: any, idx: number) => 
						`${idx + 1}. **${entry.title}** (${(entry.similarity * 100).toFixed(0)}% match)\n   ${entry.content.substring(0, 200)}...`
					).join('\n\n')
					: 'No relevant NVC knowledge found.';
			} else {
				formatted += JSON.stringify(knowledge, null, 2);
			}
		} else if (result.tool === 'analyze_path_switch' && result.result) {
			const analysis = result.result;
			formatted += `Should switch: ${analysis.shouldSwitch}\n`;
			formatted += `Confidence: ${analysis.confidence}%\n`;
			formatted += `Suggested path: ${analysis.suggestedPath || 'None'}\n`;
			formatted += `Reason: ${analysis.reason}`;
		} else {
			formatted += JSON.stringify(result.result, null, 2);
		}
		
		return formatted;
	});

	if (failed.length > 0) {
		sections.push(`**Failed tools**: ${failed.map(f => `${f.tool} (${f.error})`).join(', ')}`);
	}

	return sections.join('\n\n');
}

