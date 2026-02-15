import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../drizzle/schema.js';
import { emailTemplates, emailTemplateVersions } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle(pool);

async function main() {
  console.log('Seeding verification email template...');

  // The template content from src/lib/auth.ts, escaped for insertion
  // Note: We use ${userName}, ${verificationUrl}, ${year} as variables for the template system
  const templateName = 'verification_email';
  const templateSubject = 'Bestätige deine E-Mail-Adresse - Empathy-Link';
  
  const templateContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Empathy-Link</h1>
          </div>
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0;">Hallo \${userName}!</h2>
            <p style="color: #666; font-size: 16px;">
              Vielen Dank für deine Registrierung bei Empathy-Link. Um dein Konto zu aktivieren, 
              bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="\${verificationUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; text-decoration: none; padding: 15px 30px; 
                        border-radius: 25px; font-weight: bold; font-size: 16px;">
                E-Mail bestätigen
              </a>
            </div>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
            </p>
            <p style="color: #667eea; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 5px;">
              \${verificationUrl}
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              Dieser Link ist 24 Stunden gültig. Falls du diese E-Mail nicht angefordert hast, 
              kannst du sie einfach ignorieren.
            </p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© \${year} Empathy-Link. Alle Rechte vorbehalten.</p>
          </div>
        </body>
      </html>
  `;

  // Check if template exists
  const existing = await db.select().from(emailTemplates).where(eq(emailTemplates.name, templateName)).limit(1);

  if (existing.length === 0) {
    console.log('Inserting verification_email template...');
    
    // 1. Create Template container
    const [newTemplate] = await db.insert(emailTemplates).values({
      name: templateName,
    }).returning();
    
    console.log('Created template container:', newTemplate.id);

    // 2. Create initial version
    const [newVersion] = await db.insert(emailTemplateVersions).values({
      templateId: newTemplate.id,
      subject: templateSubject,
      content: templateContent,
      variables: JSON.stringify(['userName', 'verificationUrl', 'year']),
      versionNumber: 1,
    }).returning();

    console.log('Created version 1:', newVersion.id);

    // 3. Update template with current version pointer
    await db.update(emailTemplates)
      .set({ currentVersionId: newVersion.id })
      .where(eq(emailTemplates.id, newTemplate.id));

    console.log('Template verification_email inserted successfully with version 1.');
  } else {
    console.log('Template verification_email already exists. Skipping insertion.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error seeding email templates:', err);
  process.exit(1);
});
