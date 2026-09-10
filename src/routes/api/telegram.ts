import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { runDeskTurn } from "@/lib/server/bot";

async function botToken() {
  const sql = await getSql();
  const rows = await sql<{ value: string | null }>`select value from bot_config where key = 'telegram_token'`;
  return rows[0]?.value || "";
}

async function tokenOk(request: Request) {
  const sql = await getSql();
  const secretRows = await sql<{ value: string | null }>`select value from bot_config where key = 'telegram_secret'`;
  const secret = secretRows[0]?.value;
  const token = await botToken();
  if (!token || !secret) return false;
  return request.headers.get("x-telegram-bot-api-secret-token") === secret;
}

async function sendTelegram(chatId: number, text: string) {
  const token = await botToken();
  if (!token) return;
  const chunks = text.length <= 4000 ? [text] : text.match(/[\s\S]{1,3900}/g) || [text.slice(0, 3900)];
  for (const chunk of chunks) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk }),
    }).catch(() => null);
  }
}

async function downloadProof(fileId: string): Promise<string | null> {
  const token = await botToken();
  if (!token) return null;
  const metaRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const meta = (await metaRes.json().catch(() => null)) as { result?: { file_path?: string } } | null;
  const path = meta?.result?.file_path;
  if (!path) return null;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!fileRes.ok) return null;
  const buf = Buffer.from(await fileRes.arrayBuffer());
  if (buf.length > 320_000) return null;
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await tokenOk(request))) {
          return new Response("forbidden", { status: 403 });
        }
        const body = (await request.json().catch(() => null)) as {
          message?: {
            chat?: { id?: number };
            from?: { id?: number };
            text?: string;
            caption?: string;
            photo?: Array<{ file_id: string }>;
          };
        } | null;
        const msg = body?.message;
        const chatId = msg?.chat?.id;
        const tgUser = msg?.from?.id;
        const text = (msg?.text || msg?.caption || "").trim();
        const photo = msg?.photo?.[msg.photo.length - 1];
        if (!chatId || !tgUser) return Response.json({ ok: true });
        if (!text && !photo) return Response.json({ ok: true });

        const sql = await getSql();
        if (text.startsWith("/start")) {
          const token = text.split(/\s+/)[1];
          if (token) {
            const tok = await sql<{ user_id: string }>`
              select user_id from telegram_link_tokens
              where token = ${token} and used_at is null and expires_at > now()
            `;
            if (tok[0]) {
              await sql`update profiles set telegram_user_id = ${String(tgUser)}, telegram_chat_id = ${String(chatId)} where user_id = ${tok[0].user_id}`;
              await sql`update telegram_link_tokens set used_at = now() where token = ${token}`;
              const turn = await runDeskTurn(tok[0].user_id, { text: "help" }, "telegram");
              await sendTelegram(chatId, `Linked to Clearlot.\n\n${turn.replies.join("\n\n") || "Send help to begin."}`);
              return Response.json({ ok: true });
            }
            await sendTelegram(chatId, "That link token is invalid or expired. Generate a new one from Profile.");
            return Response.json({ ok: true });
          }
          await sendTelegram(chatId, "Open Profile in Clearlot and tap Link Telegram, then open the link it gives you.");
          return Response.json({ ok: true });
        }

        const linked = await sql<{ user_id: string }>`
          select user_id from profiles where telegram_user_id = ${String(tgUser)}
        `;
        if (!linked[0]) {
          await sendTelegram(chatId, "This Telegram account is not linked. Open Profile in Clearlot and tap Link Telegram.");
          return Response.json({ ok: true });
        }

        let proofData: string | undefined;
        if (photo) {
          const downloaded = await downloadProof(photo.file_id);
          if (!downloaded) {
            await sendTelegram(chatId, "Could not read that screenshot. Send a JPEG under 300 KB.");
            return Response.json({ ok: true });
          }
          proofData = downloaded;
        }

        try {
          const turn = await runDeskTurn(linked[0].user_id, { text: text || undefined, proofData }, "telegram");
          for (const reply of turn.replies) await sendTelegram(chatId, reply);
        } catch {
          await sendTelegram(chatId, "Desk is unavailable right now. Try again in a moment.");
        }
        return Response.json({ ok: true });
      },
    },
  },
});
