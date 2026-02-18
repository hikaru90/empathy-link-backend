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
  <title>Empathy Link</title>
  <style>
    body { margin: 0; padding: 0; background-color: #ECECDE; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #021212; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .button { display: inline-block; background-color: #0B4445; color: #ffffff; padding: 12px 24px; border-radius: 24px; text-decoration: none; font-weight: 600; margin-top: 20px; font-size: 16px; }
    .footer { text-align: center; font-size: 12px; color: #666666; margin-top: 20px; }
    h1 { font-size: 24px; font-weight: 700; line-height: 1.3; color: #0B4445; margin-top: 0; }
    h2 { font-size: 20px; font-weight: 600; line-height: 1.3; color: #0B4445; margin-top: 0; }
    p { font-size: 16px; font-weight: 400; line-height: 1.6; color: #021212; margin-bottom: 1em;}
    a { color: #A366FF; text-decoration: none; font-weight: 500; }
    .small-text { font-size: 14px; font-weight: 400; line-height: 1.5; color: #0B4445; }
    .highlight-box { background-color: #F6F6F0; border-radius: 8px; padding: 16px; word-break: break-all; font-size: 14px; color: #0B4445; }
    .greeting { font-size: 18px; font-weight: 600; line-height: 1.3; color: #0B4445; margin-top: 0; margin-bottom: 1em; }

    /* Responsive styles */
    @media only screen and (max-width: 600px) {
      .container { padding: 10px; }
      .card { padding: 20px; }
      h1 { font-size: 22px; }
      h2 { font-size: 18px; }
      p { font-size: 15px; }
      .button { padding: 10px 20px; font-size: 15px; }
      .greeting { font-size: 15px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="width:100%; text-align: center; margin-bottom: 20px;">
      <img src="https://fsowkw4soogsgw08c0o8w8ws.clustercluster.de/public/logo.png" alt="Empathy Link" width="192" height="192" style="display:inline-block;vertical-align: middle;">
    </div>
    
    <div class="card">
      <p class="greeting">Hallo \${userName}!</p>
      <p>
        Vielen Dank für deine Registrierung bei Empathy Link. Um dein Konto zu aktivieren, 
        bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst:
      </p>
      
      <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
        <a href="\${verificationUrl}" class="button">
          E-Mail bestätigen
        </a>
      </div>
      
      <p class="small-text">
        Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:
      </p>
      <div class="highlight-box">
        \${verificationUrl}
      </div>
      
      <p class="small-text" style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Dieser Link ist 24 Stunden gültig. Falls du diese E-Mail nicht angefordert hast, 
        kannst du sie einfach ignorieren.
      </p>
    </div>
    
    <div class="footer">
      <p>&copy; \${year} Empathy Link. Alle Rechte vorbehalten.</p>
    </div>
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
    console.log('Template verification_email already exists. Updating with new content...');
    const templateId = existing[0].id;
    
    // Create new version
    const [latestVersion] = await db.select().from(emailTemplateVersions)
        .where(eq(emailTemplateVersions.templateId, templateId))
        .orderBy(schema.emailTemplateVersions.versionNumber) // Should rely on desc order really, but let's just get count or something.
                                                             // Actually let's just increment based on current pointer if possible, or just query max.
    
    // Easier: Get current version number
    const currentVersionId = existing[0].currentVersionId;
    let nextVersionNumber = 1;
    if (currentVersionId) {
        const currentVersion = await db.select().from(emailTemplateVersions).where(eq(emailTemplateVersions.id, currentVersionId)).limit(1);
        if (currentVersion.length > 0) {
            nextVersionNumber = currentVersion[0].versionNumber + 1;
        }
    }

    const [newVersion] = await db.insert(emailTemplateVersions).values({
      templateId: templateId,
      subject: templateSubject,
      content: templateContent,
      variables: JSON.stringify(['userName', 'verificationUrl', 'year']),
      versionNumber: nextVersionNumber,
    }).returning();

    await db.update(emailTemplates)
      .set({ currentVersionId: newVersion.id })
      .where(eq(emailTemplates.id, templateId));
      
    console.log(`Template verification_email updated to version ${nextVersionNumber}.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error seeding email templates:', err);
  process.exit(1);
});
