import 'dotenv/config';
import { betterAuth } from "better-auth";
import { drizzle } from 'drizzle-orm/node-postgres';
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from '../../drizzle/schema.ts';

const db = drizzle(process.env.DATABASE_URL!);

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
        schema,
    }),
    emailAndPassword: {
        enabled: true,
    },
    trustedOrigins: ['http://localhost:8081'],
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