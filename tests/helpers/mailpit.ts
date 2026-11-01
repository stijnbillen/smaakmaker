// Test-only: reads mails from the local Mailpit that `supabase start` runs (port 54324).
// Never talks to anything but localhost.
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

export interface TestMail {
  subject: string;
  text: string;
  html: string;
  /** The first link to /auth/v1/verify (HTML entities decoded), or null. */
  link: string | null;
  /** All standalone 6-digit numbers in the text, links excluded. */
  codes: string[];
  created: number;
}

interface Summary {
  ID: string;
  Created: string;
  Subject: string;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${MAILPIT}${path}`);
  if (!res.ok) throw new Error(`Mailpit ${path}: status ${res.status}. Draait lokale Supabase (supabase start)?`);
  return (await res.json()) as T;
}

async function search(email: string): Promise<Summary[]> {
  const q = encodeURIComponent(`to:${email}`);
  const body = await getJson<{ messages?: Summary[] }>(`/api/v1/search?query=${q}`);
  return body.messages ?? [];
}

/** Number of mails sent to this address so far. */
export async function countMails(email: string): Promise<number> {
  return (await search(email)).length;
}

/** Newest mail to this address that arrived at or after `sinceMs`; polls until `timeoutMs`. */
export async function waitForMail(
  email: string,
  opts: { sinceMs?: number; timeoutMs?: number } = {},
): Promise<TestMail> {
  const since = opts.sinceMs ?? 0;
  const deadline = Date.now() + (opts.timeoutMs ?? 15000);
  for (;;) {
    const found = (await search(email))
      .map((m) => ({ ...m, created: new Date(m.Created).getTime() }))
      .filter((m) => m.created >= since)
      .sort((a, b) => b.created - a.created)[0];
    if (found) {
      const full = await getJson<{ Text?: string; HTML?: string }>(`/api/v1/message/${found.ID}`);
      const text = full.Text ?? '';
      const html = full.HTML ?? '';
      const source = decodeEntities(`${text}\n${html}`);
      const link = /https?:\/\/[^\s"'<>]*\/auth\/v1\/verify[^\s"'<>]*/.exec(source)?.[0] ?? null;
      const textNoLinks = text.replace(/https?:\/\/\S+/g, ' ');
      const codes = textNoLinks.match(/\b\d{6}\b/g) ?? [];
      return { subject: found.Subject, text, html, link, codes, created: found.created };
    }
    if (Date.now() > deadline) throw new Error(`Geen mail voor ${email} binnen de tijd (Mailpit ${MAILPIT})`);
    await new Promise((r) => setTimeout(r, 300));
  }
}
