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

  /** 32+ byte secret used to sign the session cookie. Required in live mode. */
  SESSION_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),

  /** Runtime kill switch. Any truthy value refuses new execution. */
  EXECUTION_DISABLED: z
    .preprocess(emptyToUndefined, z.enum(["0", "1", "true", "false"]).optional())
    .transform((value) => value === "1" || value === "true"),

  /** Hard per-transaction and per-UTC-day notional caps, in whole USDC. */
  EXECUTION_MAX_MOVE_USDC: z.coerce.number().positive().default(50),
  EXECUTION_MAX_DAILY_USDC: z.coerce.number().positive().default(100),

  /** Optional Stage S7 copytrading indexers (falls back to direct multi-chain RPC when absent). */
  ZERION_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  DEBANK_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  DUNE_SIM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

  /** Optional NEAR Intents Agent API for owner-signed automated copytrading (Mode B). */
  NEAR_INTENTS_AGENT_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  NEAR_INTENTS_AGENT_API_URL: z.string().url().default("https://api.agentsonintents.com"),
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
