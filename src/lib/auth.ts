import * as brevo from '@getbrevo/brevo';
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Context } from 'hono';
import * as schema from '../../drizzle/schema.js';

const db = drizzle(process.env.DATABASE_URL!);

/**
 * Send verification email to user using Brevo
 * 
 * SECURITY: This function uses BREVO_API_KEY from server-side environment variables only.
 * The API key is NEVER exposed to the frontend or client-side code.
 * 
 * Requirements:
 * - BREVO_API_KEY must be set in backend .env file (server-side only)
 * - BREVO_FROM_EMAIL (optional) - verified sender email address
 * 
 * IMPORTANT: Never:
 * - Add BREVO_API_KEY to frontend .env files
 * - Use EXPO_PUBLIC_ prefix (would expose to frontend)
 * - Log or return the API key in API responses
 * - Commit .env files to git
 */
export async function sendVerificationEmail({ user, url, token }: { user: { email: string; name: string | null }, url: string, token: string }) {
  // SECURITY: Only access from server-side process.env (never exposed to frontend)
  console.log('sendVerificationEmail');
  
  // Get frontend URL from environment variable (defaults to localhost:8081 for development)
  const frontendUrl = process.env.FRONTEND_URL || process.env.EXPO_APP_URL || 'http://localhost:8081';
  
  // Transform the verification URL to point to the frontend app instead of the backend
  // Better Auth generates URLs like: http://localhost:4000/api/auth/verify-email?token=...&callbackURL=/
  // We need: http://localhost:8081/verify-email-token?token=...
  let verificationUrl = url;
  
  try {
    const urlObj = new URL(url);
    // Extract the token from the query parameters
    const tokenParam = urlObj.searchParams.get('token');
    
    if (tokenParam) {
      // Build new URL pointing to frontend verification handler
      verificationUrl = `${frontendUrl}/verify-email-token?token=${encodeURIComponent(tokenParam)}`;
      console.log('Transformed verification URL from backend to frontend:', verificationUrl);
    } else {
      console.warn('No token found in verification URL, using original URL:', url);
    }
  } catch (error) {
    console.error('Error transforming verification URL:', error);
    // Fallback to original URL if transformation fails
    verificationUrl = url;
  }
  
  const brevoApiKey = process.env.BREVO_API_KEY;
  
  if (!brevoApiKey) {
    console.error('❌ BREVO_API_KEY is not set. Cannot send verification email.');
    console.log('Email verification required for:', user.email);
    console.log('Original URL:', url);
    console.log('Transformed URL:', verificationUrl);
    // SECURITY: Never log the token or API key
    console.log('Verification token: [REDACTED]');
    return;
  }

  try {
    const apiInstance = new brevo.TransactionalEmailsApi();
    // Set API key
    apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    
    // Set sender
    sendSmtpEmail.sender = {
      name: 'Empathy Link',
      email: process.env.BREVO_FROM_EMAIL || 'noreply@empathy-link.de',
    };

    // Set recipient
    sendSmtpEmail.to = [{
      email: user.email,
      name: user.name || user.email,
    }];

    // Set email content
    sendSmtpEmail.subject = 'Bestätige deine E-Mail-Adresse - Empathy Link';
    
    const userName = user.name || 'Nutzer';
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Empathy Link</h1>
          </div>
          <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0;">Hallo ${userName}!</h2>
            <p style="color: #666; font-size: 16px;">
              Vielen Dank für deine Registrierung bei Empathy Link. Um dein Konto zu aktivieren, 
              bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Button klickst:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" 
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
              ${verificationUrl}
            </p>
            <p style="color: #999; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
              Dieser Link ist 24 Stunden gültig. Falls du diese E-Mail nicht angefordert hast, 
              kannst du sie einfach ignorieren.
            </p>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© ${new Date().getFullYear()} Empathy Link. Alle Rechte vorbehalten.</p>
          </div>
        </body>
      </html>
    `;

    const textContent = `
Hallo ${userName}!

Vielen Dank für deine Registrierung bei Empathy Link. Um dein Konto zu aktivieren, 
bitte bestätige deine E-Mail-Adresse, indem du auf den folgenden Link klickst:

${verificationUrl}

Dieser Link ist 24 Stunden gültig. Falls du diese E-Mail nicht angefordert hast, 
kannst du sie einfach ignorieren.

© ${new Date().getFullYear()} Empathy Link. Alle Rechte vorbehalten.
    `.trim();

    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.textContent = textContent;

    // Send email
    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    // SECURITY: Only log success status, never log API keys or sensitive data
    console.log('✅ Verification email sent successfully via Brevo to:', user.email);
  } catch (error: any) {
    console.error('❌ Error sending verification email via Brevo:', error.message);
    // SECURITY: Never log full error response which might contain API keys
    if (error.response?.body) {
      console.error('Error response status:', error.response.status);
    }
    // Fallback: log the verification link (for development only)
    console.log('Fallback - Email verification required for:', user.email);
    console.log('Original verification URL:', url);
    console.log('Transformed verification URL:', verificationUrl);
    // SECURITY: Never log tokens in production
    if (process.env.NODE_ENV === 'development') {
      console.log('Verification token:', token);
    }
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Password validation is handled by better-auth defaults
    // Default minimum length is 8 characters
    // If you need custom validation, you can add it here
  },
  emailVerification: {
    sendVerificationEmail,
  },
  trustedOrigins: [
    'http://localhost:8081',
    'https://expo.clustercluster.de', // Production frontend
  ],
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "user",
      },
    },
  },
  //   socialProviders: {
  //     github: {
  //       clientId: process.env.GITHUB_CLIENT_ID as string,
  //       clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
  //     },
  //   },
});

export const ensureAdmin = (c: Context) => {
  const user = c.get('user');
  if (!user || user.role !== 'admin') {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return null;
};
