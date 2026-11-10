import { z } from "zod";

/**
 * Server-side configuration. Importing this module from a client component is a bug:
 * it reads secrets. Route handlers, server components and lib code only.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),

  /** sample = fixtures, dry_run = live reads + live quotes, live = real signing */
  APP_DATA_MODE: z.preprocess(
    emptyToUndefined,
    z.enum(["sample", "dry_run", "live"]).default("sample"),
  ),

  NEARAI_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEAR_AI_MODEL: z.string().default("z-ai/glm-5.3-flash"),
  NEAR_AI_BASE_URL: z.string().url().default("https://cloud-api.near.ai/v1"),

  ONECLICK_BASE_URL: z.string().url().default("https://1click.chaindefuser.com"),
  ONECLICK_JWT: z.preprocess(emptyToUndefined, z.string().optional()),

  RPC_URL_BASE: z.preprocess(emptyToUndefined, z.string().url().optional()),
  RPC_URL_ARBITRUM: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export type AppEnv = z.infer<typeof envSchema>;
export type DataMode = AppEnv["APP_DATA_MODE"];

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isLiveMode = env.APP_DATA_MODE === "live";
export const hasAiCredentials = Boolean(env.NEARAI_API_KEY);
