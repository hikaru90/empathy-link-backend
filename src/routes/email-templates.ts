import { Hono } from 'hono';
import type { Context } from 'hono';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, desc } from 'drizzle-orm';
import { emailTemplates, emailTemplateVersions } from '../../drizzle/schema.js';
import { getAiClient, isPostHogEnabled } from '../lib/gemini.js';
import { canUseTokens } from '../lib/token-usage.js';

const db = drizzle(process.env.DATABASE_URL!);
const emailTemplatesRouter = new Hono();

// GET /api/email-templates - List all templates with current version content
emailTemplatesRouter.get('/', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
        const templates = await db
            .select({
                id: emailTemplates.id,
                name: emailTemplates.name,
                updated: emailTemplates.updated,
                created: emailTemplates.created,
                subject: emailTemplateVersions.subject,
                content: emailTemplateVersions.content,
                variables: emailTemplateVersions.variables,
                currentVersionId: emailTemplates.currentVersionId,
                versionNumber: emailTemplateVersions.versionNumber,
            })
            .from(emailTemplates)
            .leftJoin(emailTemplateVersions, eq(emailTemplates.currentVersionId, emailTemplateVersions.id))
            .orderBy(desc(emailTemplates.updated));

        return c.json({ templates });
    } catch (error) {
        console.error('Error fetching email templates:', error);
        return c.json({ error: 'Failed to fetch templates' }, 500);
    }
});

// GET /api/email-templates/:id - Get specific template with current version
emailTemplatesRouter.get('/:id', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    try {
        const result = await db
            .select({
                id: emailTemplates.id,
                name: emailTemplates.name,
                updated: emailTemplates.updated,
                created: emailTemplates.created,
                subject: emailTemplateVersions.subject,
                content: emailTemplateVersions.content,
                variables: emailTemplateVersions.variables,
                currentVersionId: emailTemplates.currentVersionId,
                versionNumber: emailTemplateVersions.versionNumber,
            })
            .from(emailTemplates)
            .leftJoin(emailTemplateVersions, eq(emailTemplates.currentVersionId, emailTemplateVersions.id))
            .where(eq(emailTemplates.id, id))
            .limit(1);

        if (result.length === 0) {
            return c.json({ error: 'Template not found' }, 404);
        }

        return c.json({ template: result[0] });
    } catch (error) {
        console.error('Error fetching template:', error);
        return c.json({ error: 'Failed to fetch template' }, 500);
    }
});

// Helper to process variables
const processVariables = (vars: any) => {
    if (!vars) return null;
    if (typeof vars === 'string') return vars; // Already stringified or raw string
    return JSON.stringify(vars); // Object/Array -> String
}

// GET /api/email-templates/:id/versions - Get all versions for a template
emailTemplatesRouter.get('/:id/versions', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    try {
        const versions = await db
            .select()
            .from(emailTemplateVersions)
            .where(eq(emailTemplateVersions.templateId, id))
            .orderBy(emailTemplateVersions.created); // Sort by date created ascending (oldest first)

        return c.json({ versions });
    } catch (error) {
        console.error('Error fetching template versions:', error);
        return c.json({ error: 'Failed to fetch versions' }, 500);
    }
});

// POST /api/email-templates - Create template
emailTemplatesRouter.post('/', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
        const body = await c.req.json();
        const { name, subject, content, variables } = body;

        // 1. Create Template container
        const [newTemplate] = await db.insert(emailTemplates).values({
            name,
        }).returning();

        // 2. Create initial Version 1
        const [newVersion] = await db.insert(emailTemplateVersions).values({
            templateId: newTemplate.id,
            subject,
            content,
            variables: processVariables(variables),
            versionNumber: 1,
        }).returning();

        // 3. Update Template with Current Version pointer
        await db.update(emailTemplates)
            .set({ currentVersionId: newVersion.id })
            .where(eq(emailTemplates.id, newTemplate.id));

        const template = {
            ...newTemplate,
            subject: newVersion.subject,
            content: newVersion.content,
            variables: newVersion.variables,
            currentVersionId: newVersion.id,
            versionNumber: newVersion.versionNumber,
        };

        return c.json({ template });
    } catch (error) {
        console.error('Error creating template:', error);
        return c.json({ error: 'Failed to create template' }, 500);
    }
});

// PUT /api/email-templates/:id - Create new version (draft)
emailTemplatesRouter.put('/:id', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    try {
        const body = await c.req.json();
        const { name, subject, content, variables } = body;

        // Get all versions to find max version number
        const versions = await db.select().from(emailTemplateVersions).where(eq(emailTemplateVersions.templateId, id));
        const maxVersion = versions.reduce((max, v) => Math.max(max, v.versionNumber), 0);
        const nextVersionNumber = maxVersion + 1;

        // Create new version
        const [newVersion] = await db.insert(emailTemplateVersions).values({
            templateId: id,
            subject,
            content,
            variables: processVariables(variables),
            versionNumber: nextVersionNumber,
        }).returning();

        // Update template name only (don't update currentVersionId automatically)
        const [updatedTemplate] = await db.update(emailTemplates).set({
            name,
            updated: new Date().toISOString(),
        }).where(eq(emailTemplates.id, id)).returning();

        if (!updatedTemplate) {
            return c.json({ error: 'Template not found' }, 404);
        }

        const template = {
            ...updatedTemplate,
            subject: newVersion.subject,
            content: newVersion.content,
            variables: newVersion.variables,
            currentVersionId: updatedTemplate.currentVersionId, // Keep old live version
            latestVersionId: newVersion.id, // Inform frontend about new version
            versionNumber: newVersion.versionNumber,
        };

        return c.json({ template });
    } catch (error) {
        console.error('Error updating template:', error);
        return c.json({ error: 'Failed to update template' }, 500);
    }
});

// PATCH /api/email-templates/:id/live-version - Set live version
emailTemplatesRouter.patch('/:id/live-version', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const id = c.req.param('id');
    try {
        const body = await c.req.json();
        const { versionId } = body;

        if (!versionId) {
            return c.json({ error: 'Version ID is required' }, 400);
        }

        // Verify version belongs to template
        const version = await db.select()
            .from(emailTemplateVersions)
            .where(eq(emailTemplateVersions.id, versionId))
            .limit(1);

        if (version.length === 0 || version[0].templateId !== id) {
            return c.json({ error: 'Invalid version for this template' }, 400);
        }

        const [updatedTemplate] = await db.update(emailTemplates).set({
            currentVersionId: versionId,
            updated: new Date().toISOString(),
        }).where(eq(emailTemplates.id, id)).returning();

        return c.json({ template: updatedTemplate });
    } catch (error) {
        console.error('Error setting live version:', error);
        return c.json({ error: 'Failed to set live version' }, 500);
    }
});

// POST /api/email-templates/ai-edit - AI assisted edit
emailTemplatesRouter.post('/ai-edit', async (c: Context) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const tokenCheck = await canUseTokens(user.id, user.role ?? 'user');
    if (!tokenCheck.allowed) {
        return c.json({
            error: 'daily_token_limit_exceeded',
            message: 'You have reached your daily token limit. It resets at midnight UTC.',
            usedToday: tokenCheck.usedToday,
            limit: tokenCheck.limit,
        }, 429);
    }

    try {
        const body = await c.req.json();
        const { prompt: userPrompt, currentContent, allTemplates, styleGuide } = body;

        const aiClient = getAiClient();
        
        // Context about other templates if provided
        let context = "";
        if (allTemplates && allTemplates.length > 0) {
            context = "Here are some existing templates for context/style reference:\n" + 
                allTemplates.map((t: any) => `Name: ${t.name}\nSubject: ${t.subject}\nContent: ${t.content?.substring(0, 200)}...`).join("\n\n");
        }

        const systemPrompt = `You are an expert email template designer and editor. 
        Your task is to generate or modify HTML email content based on the user's request.
        Return ONLY the HTML code, no markdown formatting, no explanations.
        Ensure the HTML is responsive and compatible with major email clients.
        
        ${styleGuide ? `\n\nSTRICTLY FOLLOW THIS STYLE GUIDE:\n${styleGuide}` : 'If the user asks to change the style, apply modern, clean, and professional styling.'}
        
        ${context ? `\n\nUse the following context from existing templates to maintain consistency if applicable:\n${context}` : ''}`;

        const userMessage = `Current Content:\n${currentContent || '(New Template)'}\n\nUser Request: ${userPrompt}\n\nReturn ONLY the updated HTML.`;

        const emailGenRequest: any = {
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.7,
                maxOutputTokens: 8192,
            },
            contents: [{ role: 'user', parts: [{ text: userMessage }] }]
        };
        if (isPostHogEnabled()) emailGenRequest.posthogDistinctId = user.id;
        const result = await aiClient.models.generateContent(emailGenRequest);
        let response = result.text;

        if (!response && result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                response = candidate.content.parts[0].text;
            }
        }
        
        if (!response) {
             throw new Error('No response from AI');
        }

        let cleanResponse = response;
        
        // Clean up markdown code blocks if present
        if (cleanResponse.startsWith('```html')) {
            cleanResponse = cleanResponse.replace(/^```html\n/, '').replace(/\n```$/, '');
        } else if (cleanResponse.startsWith('```')) {
            cleanResponse = cleanResponse.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        return c.json({ result: cleanResponse });

    } catch (error) {
        console.error('Error in AI edit:', error);
        return c.json({ error: 'Failed to process AI request' }, 500);
    }
});

export default emailTemplatesRouter;
