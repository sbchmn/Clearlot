import { randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { seedIfEmpty } from "./seed";

export type Profile = {
  user_id: string;
  display_name: string;
  is_admin: boolean;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  ship_name: string | null;
  ship_line1: string | null;
  ship_line2: string | null;
  ship_city: string | null;
  ship_region: string | null;
  ship_postal: string | null;
  ship_country: string;
};

export async function loadProfile(userId: string, displayName?: string | null): Promise<Profile> {
  const sql = await getSql();
  const existing = await sql<Profile>`
    select user_id, display_name, is_admin, telegram_user_id, telegram_chat_id, ship_name, ship_line1, ship_line2,
           ship_city, ship_region, ship_postal, ship_country
    from profiles where user_id = ${userId}
  `;
  if (existing[0]) return existing[0];

  const countRows = await sql<{ n: number }>`select count(*)::int as n from profiles`;
  const isFirst = (countRows[0]?.n ?? 0) === 0;
  const name = (displayName || "Member").slice(0, 80);
  await sql`
    insert into profiles (user_id, display_name, is_admin)
    values (${userId}, ${name}, ${isFirst})
  `;
  if (isFirst) {
    await seedIfEmpty(userId);
  }
  const created = await sql<Profile>`
    select user_id, display_name, is_admin, telegram_user_id, telegram_chat_id, ship_name, ship_line1, ship_line2,
           ship_city, ship_region, ship_postal, ship_country
    from profiles where user_id = ${userId}
  `;
  return created[0]!;
}

export async function requireAdmin(userId: string) {
  const profile = await loadProfile(userId);
  if (!profile.is_admin) {
    throw new Error("Admin only");
  }
  return profile;
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return loadProfile(context.userId);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: unknown) => d as Partial<Profile> & { display_name?: string })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await loadProfile(context.userId);
    const p = data;
    await sql`
      update profiles set
        display_name = coalesce(${p.display_name ?? null}, display_name),
        ship_name = ${p.ship_name ?? null},
        ship_line1 = ${p.ship_line1 ?? null},
        ship_line2 = ${p.ship_line2 ?? null},
        ship_city = ${p.ship_city ?? null},
        ship_region = ${p.ship_region ?? null},
        ship_postal = ${p.ship_postal ?? null},
        ship_country = coalesce(${p.ship_country ?? null}, ship_country),
        updated_at = now()
      where user_id = ${context.userId}
    `;
    return loadProfile(context.userId);
  });

export const createTelegramLink = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await loadProfile(context.userId);
    const sql = await getSql();
    const token = randomBytes(16).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await sql`
      insert into telegram_link_tokens (user_id, token, expires_at)
      values (${context.userId}, ${token}, ${expires})
    `;
    const tok = await sql<{ value: string | null }>`select value from bot_config where key = 'telegram_token'`;
    let url: string | null = null;
    const botToken = tok[0]?.value;
    if (botToken) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(5000) });
        const body = (await res.json()) as { result?: { username?: string } };
        if (body.result?.username) url = `https://t.me/${body.result.username}?start=${token}`;
      } catch {
        /* telegram unreachable — still return the raw token */
      }
    }
    return { token, url };
  });
