import { z } from 'zod';
// Zod schemas for content blocks
const textBlockSchema = z.object({
    type: z.literal("text"),
    content: z.string(),
    ctaText: z.string().optional(), // Optional CTA button text
    sources: z.array(z.object({
        sort: z.number(),
        title: z.string(),
        url: z.string(),
        author: z.string()
    })).optional() // Optional sources list
});
const listBlockSchema = z.object({
    type: z.literal("list"),
    items: z.array(z.object({
        title: z.string(),
        text: z.string()
    }))
});
const headingBlockSchema = z.object({
    type: z.literal("heading"),
    hierarchy: z.number().min(1).max(6),
    content: z.string(),
    subheading: z.string().optional()
});
const taskBlockSchema = z.object({
    type: z.literal("task"),
    duration: z.number().min(0).optional(),
    content: z.string()
});
const timerBlockSchema = z.object({
    type: z.literal("timer"),
    duration: z.number().min(0)
});
const breatheBlockSchema = z.object({
    type: z.literal("breathe"),
    duration: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).optional() // 15s, 30s, 1min, 2min
});
const bodymapBlockSchema = z.object({
    type: z.literal("bodymap")
});
const taskCompletionBlockSchema = z.object({
    type: z.literal("taskCompletion"),
    taskId: z.string().optional(),
    allowNotes: z.boolean().optional(),
    notesPlaceholder: z.string().optional()
});
const sortableBlockSchema = z.object({
    type: z.literal("sortable"),
    bucketA: z.string(),
    bucketB: z.string(),
    items: z.array(z.object({
        text: z.string(),
        correctBucket: z.enum(["A", "B"])
    }))
});
const multipleChoiceBlockSchema = z.object({
    type: z.literal("multipleChoice"),
    questions: z.array(z.object({
        question: z.string(),
        options: z.array(z.object({
            text: z.string(),
            isCorrect: z.boolean()
        })),
        explanation: z.string().optional()
    })),
    allowMultiple: z.boolean().optional()
});
const aiQuestionBlockSchema = z.object({
    type: z.literal("aiQuestion"),
    question: z.string(),
    systemPrompt: z.string(),
    placeholder: z.string().optional(),
    showFeelingsButton: z.boolean().optional(),
    showNeedsButton: z.boolean().optional()
});
const feelingsDetectiveBlockSchema = z.object({
    type: z.literal("feelingsDetective"),
    question: z.string().optional()
});
const needsDetectiveBlockSchema = z.object({
    type: z.literal("needsDetective"),
    question: z.string().optional()
});
const needsRubiksCubeBlockSchema = z.object({
    type: z.literal("needsRubiksCube"),
    title: z.string().optional(),
    placeholder: z.string().optional(),
    instruction: z.string().optional(),
    resultsTitle: z.string().optional()
});
const imageBlockSchema = z.object({
    type: z.literal("image"),
    src: z.string(),
    alt: z.string().optional(),
    caption: z.string().optional(),
    width: z.number().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional()
});
const audioBlockSchema = z.object({
    type: z.literal("audio"),
    src: z.string(),
    content: z.string().optional(),
    title: z.string().optional(),
    transcript: z.string().optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    controls: z.boolean().optional()
});
const nextPageBlockSchema = z.object({
    type: z.literal("nextPage"),
    text: z.string().optional(),
    variant: z.enum(['default', 'minimal', 'floating', 'large']).optional(),
    disabled: z.boolean().optional(),
    customAction: z.string().optional()
});
const pageNavigationBlockSchema = z.object({
    type: z.literal("pageNavigation"),
    showNext: z.boolean().optional(),
    showPrev: z.boolean().optional(),
    nextText: z.string().optional(),
    prevText: z.string().optional(),
    variant: z.enum(['default', 'minimal', 'floating', 'inline']).optional(),
    nextDisabled: z.boolean().optional(),
    prevDisabled: z.boolean().optional()
});
const contentBlockSchema = z.discriminatedUnion("type", [
    textBlockSchema,
    listBlockSchema,
    headingBlockSchema,
    taskBlockSchema,
    timerBlockSchema,
    breatheBlockSchema,
    bodymapBlockSchema,
    taskCompletionBlockSchema,
    sortableBlockSchema,
    multipleChoiceBlockSchema,
    aiQuestionBlockSchema,
    feelingsDetectiveBlockSchema,
    needsDetectiveBlockSchema,
    needsRubiksCubeBlockSchema,
    imageBlockSchema,
    audioBlockSchema,
    nextPageBlockSchema,
    pageNavigationBlockSchema
]);
export const topicVersionFormSchema = z.object({
    titleDE: z.string().optional(),
    titleEN: z.string().optional(),
    descriptionDE: z.string().optional(),
    descriptionEN: z.string().optional(),
    category: z.string().optional(),
    image: z.string().optional(),
    content: z.array(contentBlockSchema).optional()
});
//# sourceMappingURL=schema.js.map