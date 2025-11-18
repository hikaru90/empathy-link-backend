/**
 * Tool Registry - Central registry for all available tools
 */

import { Type } from '@google/genai';
import type { PathSwitchAnalysis } from '../gemini.js';
import { searchSimilarMemories } from '../memory.js';
import { extractNVCFromMessage } from '../ai-tools.js';
import { retrieveNVCKnowledge } from '../ai-tools.js';
import { analyzePathSwitchingIntent } from '../gemini.js';
import type { HistoryEntry } from '../encryption.js';

export interface ToolCall {
	tool: string;
	params: Record<string, any>;
}

export interface ToolResult {
	tool: string;
	success: boolean;
	result?: any;
	error?: string;
}

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: any; // JSON Schema
	execute: (params: any, context?: any) => Promise<any>;
	isIndependent?: boolean; // Can run in parallel with other tools
}

/**
 * Tool Registry - All available tools
 */
export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
	search_memories: {
		name: 'search_memories',
		description: 'Search user\'s personal memories for relevant context. Use when user mentions past experiences, relationships, or personal history.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				query: {
					type: Type.STRING,
					description: 'Search query to find relevant memories'
				},
				limit: {
					type: Type.NUMBER,
					description: 'Maximum number of results (default: 3)'
				},
				minSimilarity: {
					type: Type.NUMBER,
					description: 'Minimum similarity threshold (default: 0.7)'
				}
			},
			required: ['query']
		},
		execute: async (params: { query: string; limit?: number; minSimilarity?: number }, context: { userId: string }) => {
			const limit = params.limit || 3;
			const minSimilarity = params.minSimilarity || 0.7;
			const memories = await searchSimilarMemories(params.query, context.userId, limit);
			return memories.filter((m: any) => (m.similarity || 0) >= minSimilarity);
		},
		isIndependent: true
	},

	extract_nvc_components: {
		name: 'extract_nvc_components',
		description: 'Extract NVC components (observation, feelings, needs, request) from a message. Use when user explicitly mentions feelings, needs, observations, or requests.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				message: {
					type: Type.STRING,
					description: 'Message to analyze for NVC components'
				},
				locale: {
					type: Type.STRING,
					description: 'Language code (default: "de")'
				}
			},
			required: ['message']
		},
		execute: async (params: { message: string; locale?: string }) => {
			const locale = params.locale || 'de';
			return await extractNVCFromMessage(params.message, locale);
		},
		isIndependent: true
	},

	retrieve_nvc_knowledge: {
		name: 'retrieve_nvc_knowledge',
		description: 'Retrieve relevant NVC knowledge from the knowledge base. Use when user asks about NVC concepts, needs guidance, or when teaching moments are detected.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				query: {
					type: Type.STRING,
					description: 'Search query for NVC knowledge (AI can optimize this based on context)'
				},
				limit: {
					type: Type.NUMBER,
					description: 'Maximum number of results (default: 3)'
				},
				minSimilarity: {
					type: Type.NUMBER,
					description: 'Minimum similarity threshold (default: 0.7)'
				},
				category: {
					type: Type.STRING,
					description: 'Filter by category (optional)'
				},
				tags: {
					type: Type.ARRAY,
					items: { type: Type.STRING },
					description: 'Filter by tags (optional)'
				}
			},
			required: ['query']
		},
		execute: async (params: { query: string; limit?: number; minSimilarity?: number; category?: string; tags?: string[] }, context: { locale?: string }) => {
			const locale = context.locale || 'de';
			const limit = params.limit || 3;
			const minSimilarity = params.minSimilarity || 0.7;
			const result = await retrieveNVCKnowledge(params.query, locale, {
				limit,
				minSimilarity,
				category: params.category,
				tags: params.tags
			});
			return {
				knowledgeEntries: result.knowledgeEntries,
				extractedConcepts: result.extractedConcepts,
				searchQuery: result.searchQuery
			};
		},
		isIndependent: true
	},

	analyze_path_switch: {
		name: 'analyze_path_switch',
		description: 'Determine if user wants to switch conversation paths. Use when user explicitly mentions switching topics, asks about different modes, or when current path seems complete.',
		parameters: {
			type: Type.OBJECT,
			properties: {
				message: {
					type: Type.STRING,
					description: 'Current user message'
				},
				currentPath: {
					type: Type.STRING,
					description: 'Current conversation path'
				},
				recentHistory: {
					type: Type.ARRAY,
					items: {
						type: Type.OBJECT,
						properties: {
							role: { type: Type.STRING },
							content: { type: Type.STRING }
						}
					},
					description: 'Last 4-6 messages for context'
				}
			},
			required: ['message', 'currentPath', 'recentHistory']
		},
		execute: async (params: { message: string; currentPath: string; recentHistory: Array<{ role: string; content: string }> }, context: { locale?: string }) => {
			const locale = context.locale || 'de';
			return await analyzePathSwitchingIntent(params.message, params.currentPath, params.recentHistory, locale);
		},
		isIndependent: true
	}
};

/**
 * Get tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
	return TOOL_REGISTRY[name];
}

/**
 * Check if a tool name is valid
 */
export function isValidTool(name: string): boolean {
	return name in TOOL_REGISTRY;
}

/**
 * Check if a tool can run independently (in parallel)
 */
export function isIndependentTool(name: string): boolean {
	const tool = TOOL_REGISTRY[name];
	return tool?.isIndependent !== false; // Default to true if not specified
}

/**
 * Get all tool names
 */
export function getAllToolNames(): string[] {
	return Object.keys(TOOL_REGISTRY);
}

/**
 * Get tool descriptions for AI prompt
 */
export function getToolDescriptions(): string {
	return Object.values(TOOL_REGISTRY)
		.map(tool => {
			const params = Object.entries(tool.parameters.properties || {})
				.map(([key, schema]: [string, any]) => {
					const required = tool.parameters.required?.includes(key) ? ' (required)' : ' (optional)';
					return `  - ${key}: ${schema.description || schema.type}${required}`;
				})
				.join('\n');
			
			return `**${tool.name}**: ${tool.description}\nParameters:\n${params}`;
		})
		.join('\n\n');
}

