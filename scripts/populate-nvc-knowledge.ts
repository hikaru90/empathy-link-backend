/**
 * Populate NVC Knowledge Base with initial seed data
 * Run with: npx tsx scripts/populate-nvc-knowledge.ts
 */

import { createNVCKnowledgeEntry } from '../src/lib/nvc-knowledge.js';
import { randomUUID } from 'crypto';

interface SeedEntry {
	knowledgeId?: string; // Will be generated if not provided
	language: 'de' | 'en';
	title: string;
	content: string;
	category: string;
	subcategory?: string;
	source?: string;
	tags?: string[];
	priority?: number;
}

// Seed data - core NVC knowledge
const seedData: SeedEntry[] = [
	// Core Principles - Observation
	{
		language: 'de',
		title: 'Beobachtung vs. Bewertung',
		content: `In der Gewaltfreien Kommunikation (GFK) sind Beobachtungen sachliche Beschreibungen ohne Urteil, Interpretation oder Bewertung. 

Eine Beobachtung ist: "Du hast gestern Abend nicht auf meine Nachricht geantwortet."
Eine Bewertung ist: "Du ignorierst mich."

Beobachtungen schaffen Verbindung und ermöglichen Dialog. Bewertungen lösen oft Verteidigung und Widerstand aus. Der Schlüssel liegt darin, nur das zu beschreiben, was wir tatsächlich sehen oder hören, ohne Interpretationen hinzuzufügen.`,
		category: 'principles',
		subcategory: 'observation',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['grundlagen', 'beobachtung', 'bewertung'],
		priority: 5
	},
	{
		language: 'en',
		title: 'Observation vs Evaluation',
		content: `In Nonviolent Communication (NVC), observations are factual descriptions without judgment, interpretation, or evaluation.

An observation is: "You didn't respond to my message yesterday evening."
An evaluation is: "You're ignoring me."

Observations create connection and enable dialogue. Evaluations often trigger defensiveness and resistance. The key is to describe only what we actually see or hear, without adding interpretations.`,
		category: 'principles',
		subcategory: 'observation',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['basics', 'observation', 'evaluation'],
		priority: 5
	},

	// Core Principles - Feelings
	{
		language: 'de',
		title: 'Gefühle vs. Gedanken',
		content: `In der GFK unterscheiden wir zwischen echten Gefühlen und Gedanken, die als Gefühle getarnt sind.

Echte Gefühle entstehen aus erfüllten oder unerfüllten Bedürfnissen:
- "Ich fühle mich traurig" (Gefühl)
- "Ich fühle mich verletzt" (Gefühl)
- "Ich fühle mich erfreut" (Gefühl)

Gedanken, die als Gefühle getarnt sind, enthalten oft Bewertungen:
- "Ich fühle mich betrogen" (ist eine Bewertung, kein Gefühl)
- "Ich fühle mich ignoriert" (ist eine Bewertung, kein Gefühl)

Echte Gefühle helfen uns, mit unseren Bedürfnissen in Kontakt zu kommen.`,
		category: 'principles',
		subcategory: 'feelings',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['grundlagen', 'gefühle', 'gedanken'],
		priority: 5
	},
	{
		language: 'en',
		title: 'Feelings vs Thoughts',
		content: `In NVC, we distinguish between real feelings and thoughts disguised as feelings.

Real feelings arise from met or unmet needs:
- "I feel sad" (feeling)
- "I feel hurt" (feeling)
- "I feel joyful" (feeling)

Thoughts disguised as feelings often contain evaluations:
- "I feel betrayed" (is an evaluation, not a feeling)
- "I feel ignored" (is an evaluation, not a feeling)

Real feelings help us connect with our needs.`,
		category: 'principles',
		subcategory: 'feelings',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['basics', 'feelings', 'thoughts'],
		priority: 5
	},

	// Core Principles - Needs
	{
		language: 'de',
		title: 'Bedürfnisse vs. Strategien',
		content: `Ein zentraler Punkt der GFK ist die Unterscheidung zwischen universellen menschlichen Bedürfnissen und Strategien.

Bedürfnisse sind universell und abstrakt:
- Verbindung, Verständnis, Autonomie, Sicherheit, Wertschätzung

Strategien sind konkrete Wege, wie wir versuchen, Bedürfnisse zu erfüllen:
- "Ich brauche, dass du mir zuhörst" (ist eine Strategie)
- "Ich brauche Verständnis" (ist ein Bedürfnis)

Wenn wir auf der Bedürfnis-Ebene kommunizieren, öffnen sich mehr Möglichkeiten für Lösungen.`,
		category: 'principles',
		subcategory: 'needs',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['grundlagen', 'bedürfnisse', 'strategien'],
		priority: 5
	},
	{
		language: 'en',
		title: 'Needs vs Strategies',
		content: `A central point of NVC is distinguishing between universal human needs and strategies.

Needs are universal and abstract:
- Connection, understanding, autonomy, safety, appreciation

Strategies are concrete ways we try to meet needs:
- "I need you to listen to me" (is a strategy)
- "I need understanding" (is a need)

When we communicate at the need level, more possibilities for solutions open up.`,
		category: 'principles',
		subcategory: 'needs',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['basics', 'needs', 'strategies'],
		priority: 5
	},

	// Core Principles - Requests
	{
		language: 'de',
		title: 'Bitte vs. Forderung',
		content: `In der GFK formulieren wir Bitten klar und konkret, ohne Forderungen zu stellen.

Eine Bitte ist:
- Konkret und umsetzbar
- Formuliert in positiver Sprache (was wir wollen, nicht was wir nicht wollen)
- Ohne Druck oder Erwartung
- Beispiel: "Könntest du mir heute Abend eine halbe Stunde zuhören?"

Eine Forderung ist:
- Enthält versteckte oder offene Drohungen
- Erwartet Gehorsam
- Beispiel: "Du musst mir jetzt zuhören!"

Bitten schaffen Verbindung; Forderungen schaffen Widerstand.`,
		category: 'principles',
		subcategory: 'requests',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['grundlagen', 'bitte', 'forderung'],
		priority: 5
	},
	{
		language: 'en',
		title: 'Request vs Demand',
		content: `In NVC, we formulate requests clearly and concretely, without making demands.

A request is:
- Concrete and actionable
- Formulated in positive language (what we want, not what we don't want)
- Without pressure or expectation
- Example: "Could you listen to me for half an hour this evening?"

A demand is:
- Contains hidden or open threats
- Expects obedience
- Example: "You must listen to me now!"

Requests create connection; demands create resistance.`,
		category: 'principles',
		subcategory: 'requests',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['basics', 'request', 'demand'],
		priority: 5
	},

	// Techniques - Self-Empathy
	{
		language: 'de',
		title: 'Selbstempathie',
		content: `Selbstempathie ist der erste Schritt in der GFK. Bevor wir mit anderen kommunizieren, verbinden wir uns mit unseren eigenen Gefühlen und Bedürfnissen.

Der Prozess:
1. Beobachte, was in dir vorgeht (ohne Bewertung)
2. Nimm deine Gefühle wahr
3. Erkenne die Bedürfnisse hinter den Gefühlen
4. Nimm dich selbst mit Mitgefühl an

Selbstempathie hilft uns:
- Klarheit über unsere eigenen Bedürfnisse zu gewinnen
- Reaktive Muster zu erkennen
- Mitfühlender mit uns selbst zu sein
- Vorbereitet zu sein für ehrliche Kommunikation`,
		category: 'techniques',
		subcategory: 'self_empathy',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['selbstempathie', 'technik', 'grundlagen'],
		priority: 4
	},
	{
		language: 'en',
		title: 'Self-Empathy',
		content: `Self-empathy is the first step in NVC. Before we communicate with others, we connect with our own feelings and needs.

The process:
1. Observe what's happening inside you (without judgment)
2. Notice your feelings
3. Recognize the needs behind the feelings
4. Accept yourself with compassion

Self-empathy helps us:
- Gain clarity about our own needs
- Recognize reactive patterns
- Be more compassionate with ourselves
- Be prepared for honest communication`,
		category: 'techniques',
		subcategory: 'self_empathy',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['self-empathy', 'technique', 'basics'],
		priority: 4
	},

	// Common Mistakes
	{
		language: 'de',
		title: 'Häufiger Fehler: "Du-Botschaften"',
		content: `Ein häufiger Fehler in der Kommunikation ist die Verwendung von "Du-Botschaften", die Schuldzuweisungen enthalten.

Beispiele für "Du-Botschaften":
- "Du machst mich wütend"
- "Du bist immer so unzuverlässig"
- "Du denkst nie an mich"

Diese Formulierungen:
- Lösen Verteidigung aus
- Schaffen Trennung statt Verbindung
- Fokussieren auf Schuld statt auf Bedürfnisse

GFK-Alternative: "Ich-Botschaften" mit Gefühlen und Bedürfnissen:
- "Wenn ich sehe, dass... (Beobachtung), fühle ich mich... (Gefühl), weil ich... brauche (Bedürfnis)."`,
		category: 'common_mistakes',
		source: 'Marshall Rosenberg - Gewaltfreie Kommunikation',
		tags: ['fehler', 'du-botschaften', 'kommunikation'],
		priority: 4
	},
	{
		language: 'en',
		title: 'Common Mistake: "You-Messages"',
		content: `A common mistake in communication is using "you-messages" that contain blame.

Examples of "you-messages":
- "You make me angry"
- "You're always so unreliable"
- "You never think about me"

These formulations:
- Trigger defensiveness
- Create separation instead of connection
- Focus on blame instead of needs

NVC alternative: "I-messages" with feelings and needs:
- "When I see that... (observation), I feel... (feeling), because I need... (need)."`,
		category: 'common_mistakes',
		source: 'Marshall Rosenberg - Nonviolent Communication',
		tags: ['mistakes', 'you-messages', 'communication'],
		priority: 4
	}
];

async function populate() {
	console.log('🌱 Starting NVC Knowledge Base population...\n');

	// Group entries by knowledgeId (for linking translations)
	const entriesByGroup: Map<string, SeedEntry[]> = new Map();
	
	for (const entry of seedData) {
		// Find matching entry in opposite language
		const match = seedData.find(e => 
			e !== entry && 
			e.category === entry.category &&
			e.subcategory === entry.subcategory &&
			e.language !== entry.language
		);
		
		if (match) {
			// Check if either already has a knowledgeId
			const existingGroup = Array.from(entriesByGroup.entries()).find(([_, entries]) =>
				entries.some(e => e === entry || e === match)
			);
			
			if (existingGroup) {
				entriesByGroup.get(existingGroup[0])!.push(entry);
			} else {
				const knowledgeId = randomUUID();
				entriesByGroup.set(knowledgeId, [entry, match]);
			}
		} else {
			// No translation found, create standalone entry
			entriesByGroup.set(randomUUID(), [entry]);
		}
	}

	let successCount = 0;
	let errorCount = 0;

	for (const [knowledgeId, entries] of entriesByGroup.entries()) {
		for (const entry of entries) {
			try {
				await createNVCKnowledgeEntry({
					knowledgeId,
					language: entry.language,
					title: entry.title,
					content: entry.content,
					category: entry.category,
					subcategory: entry.subcategory,
					source: entry.source,
					tags: entry.tags,
					priority: entry.priority || 3,
					generateEmbedding: true
				});
				console.log(`✅ Created: ${entry.title} (${entry.language})`);
				successCount++;
			} catch (error) {
				console.error(`❌ Failed to create: ${entry.title} (${entry.language})`, error);
				errorCount++;
			}
		}
	}

	console.log(`\n✨ Population complete!`);
	console.log(`   ✅ Success: ${successCount}`);
	console.log(`   ❌ Errors: ${errorCount}`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
	populate().catch(console.error);
}

export { populate };

