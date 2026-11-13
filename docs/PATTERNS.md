# Code patterns for this stack

Checked against: next 16.4.6, react 19.3, zod 4.6, drizzle-orm 0.45, tailwindcss 4.3, vitest 5.1, @electric-sql/pglite 0.5.

## Where this differs from what you remember

| You may remember | Installed reality |
|---|---|
| Next 15: `params` is a plain object | `params` is a **Promise**: `await ctx.params` (route handlers, pages, layouts) |
| Next 15: `cookies()`, `headers()` sync or lenient | Async only: `await cookies()` |
| `middleware.ts` | Renamed `proxy.ts` (export `proxy`). Avoid; we do not need it |
| `next lint` | Removed. `npm run lint` runs `eslint .` with a flat config (`eslint.config.mjs`) |
| Hand-written `{ params }: { params: { id: string } }` types | Use the generated helpers `RouteContext<"/api/x/[id]">`, `PageProps<"/x/[id]">`, `LayoutProps<"/">`. They exist after `next typegen`, which `npm run typecheck` runs first |
| Turbopack opt-in | Turbopack is the default for `dev` and `build`. Tailwind is wired through `@tailwindcss/turbopack` in `next.config.ts` |
| Zod 3: `z.string().email()`, `z.string().uuid()` | Zod 4: top-level `z.email()`, `z.uuid()`, `z.url()` (the method forms still work but are deprecated) |
| Zod 3: `{ message: "..." }`, `error.flatten()`, `error.format()` | Zod 4: `{ error: "..." }`, `z.flattenError(err)`, `z.treeifyError(err)` |
| Zod 3: `z.record(z.number())` | `z.record(z.string(), z.number())` (two arguments) |
| Zod 3: `z.object({}).strict()` | `z.strictObject({})` |
| Tailwind 3: `tailwind.config.js`, `@tailwind base;` | Tailwind 4: `@import "tailwindcss";`, config lives in CSS (`@theme inline`), no config file |
| Tailwind 3 class names | v4 renames: `shadow-sm` -> `shadow-xs`, `shadow` -> `shadow-sm`, `rounded` -> `rounded-sm`, `outline-none` -> `outline-hidden`, `bg-gradient-to-r` -> `bg-linear-to-r`, `flex-shrink-0` -> `shrink-0`. Use `size-4` for equal width and height |
| `db.execute()` returns the same shape everywhere | postgres.js returns an array of rows, PGlite returns `{ rows }`. Prefer the query builder in feature code |
| shadcn `init` asks for a "style" | It now asks for a base library (radix) and a preset. This repo uses `radix-vega`, neutral base colour |

## Route handler with dynamic params

```ts
// src/app/api/things/[id]/route.ts
import { z } from "zod";

const Params = z.object({ id: z.uuid() });

export async function GET(req: Request, ctx: RouteContext<"/api/things/[id]">) {
  const { id } = Params.parse(await ctx.params); // params is a Promise in Next 16
  const q = new URL(req.url).searchParams.get("q");
  return Response.json({ id, q });
}
```

Keep handlers thin: parse, call a feature function, return. Use `Response.json` (no `NextResponse` needed). Add `export const dynamic = "force-dynamic"` to anything that must never be cached.

## Streaming route (server-sent events)

```ts
// src/app/api/stream/route.ts
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      for (let i = 0; i < 3 && !req.signal.aborted; i++) {
        send("tick", { i });
        await new Promise((r) => setTimeout(r, 200));
      }
      send("done", {});
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no", // stop the reverse proxy buffering
    },
  });
}
```

Client (use `fetch` so POST bodies work; `EventSource` is GET only):

```ts
const res = await fetch("/api/stream", { signal });
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
let buf = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += value;
  let i;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const event = /^event: (.*)$/m.exec(frame)?.[1] ?? "message";
    const data = JSON.parse(/^data: (.*)$/m.exec(frame)?.[1] ?? "null");
    console.log(event, data);
  }
}
```

## Zod 4 schema, safeParse, derived type

```ts
import { z } from "zod";

export const Contact = z.object({
  email: z.email({ error: "Enter a valid email address" }),
  tags: z.array(z.string()).max(5).default([]),
});
export type Contact = z.infer<typeof Contact>; // output type

const result = Contact.safeParse(input);
if (!result.success) {
  const fields = z.flattenError(result.error).fieldErrors; // { email?: string[] }
  return Response.json({ fields }, { status: 400 });
}
const contact: Contact = result.data;
```

Use `z.input<typeof S>` for the type before defaults and transforms are applied.

## Drizzle table with a validated jsonb column

```ts
import { eq } from "drizzle-orm";
import { jsonb, pgTable, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db/client";

const CardBody = z.object({ skills: z.array(z.string()) });
type CardBody = z.infer<typeof CardBody>;

export const cards = pgTable("cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  body: jsonb("body").$type<CardBody>().notNull(),
});

export async function saveCard(db: Db, input: unknown) {
  const body = CardBody.parse(input); // validate on write
  const [row] = await db.insert(cards).values({ body }).returning();
  return row.id;
}
export async function loadCard(db: Db, id: string) {
  const [row] = await db.select().from(cards).where(eq(cards.id, id));
  return row ? CardBody.parse(row.body) : null; // validate on read
}
```

Take `db: Db` as a parameter; never import `getDb()` inside feature logic that tests need to run. Schema changes go through the lead, then `npm run db:generate`.

## PGlite-backed test

```ts
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../tests/helpers/db";
import { saveCard, loadCard } from "./cards";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb(); // in-memory Postgres, pg_trgm, migrations from ./drizzle applied
});
afterAll(() => t.close());

it("round-trips a card", async () => {
  const id = await saveCard(t.db, { skills: ["welding"] });
  expect(await loadCard(t.db, id)).toEqual({ skills: ["welding"] });
});
```

Vitest only picks up `src/**/*.test.ts` and `tests/**/*.test.ts`, with `NODE_ENV=test` (so `LLM_MODE` defaults to `replay`). Tables must exist in `./drizzle` migrations to be present in the test database.

## `"use client"` boundaries

```tsx
// src/features/x/Widget.tsx
"use client"; // first line of the file, before imports

import { useState } from "react";
import { Button } from "@/components/ui/button"; // fine: shadcn components
import type { Contact } from "@/contracts/contact"; // fine: types and Zod schemas
```

- Pages, layouts and route handlers are server code by default. Add `"use client"` only to the leaf file that uses state, effects or browser APIs.
- Client components may import: other client components, shadcn UI, `@/contracts` (types and pure Zod schemas), pure helpers.
- Client components must not import: `@/db/*`, `@/lib/env`, `@/lib/llm`, `postgres`, `drizzle-orm`, `openai`, or anything that reads secrets. Put `import "server-only"` at the top of server-only modules to make a mistake a build error.
- Props from server to client must be serialisable (no functions, class instances or Dates you rely on as Dates).

## Reading env

```ts
import { getEnv, requireEnv } from "@/lib/env";

const { APP_URL, LLM_MODE } = getEnv(); // validated once on first call, never at import
const key = requireEnv("NVIDIA_API_KEY"); // throws a clear error if unset, at the point of use
```

Never read `process.env` directly in app code. Importing `@/lib/env` never throws, and `npm run build` works with no variables set, so call `getEnv()` inside functions, not at module top level. Tests can change variables and call `resetEnvCache()`.

## Interface text in three languages

Every visible string goes through `src/lib/i18n`. Each feature keeps its own `messages.ts`; `Messages<...>` makes a missing key in any language a compile error. Use `fmt` for placeholders: `fmt("{count} postings", { count: 3 })`.

```ts
// src/features/card/messages.ts
import type { Messages } from "@/lib/i18n";
export const cardMessages = {
  en: { approve: "Approve my card" },
  fi: { approve: "Hyväksy korttini" },
  sv: { approve: "Godkänn mitt kort" },
} satisfies Messages<{ approve: string }>;
```

```tsx
// Server component (page, layout)
import { pick } from "@/lib/i18n";
import { getUiLang } from "@/lib/i18n/server";
import { cardMessages } from "./messages";

export default async function Page() {
  const m = pick(cardMessages, await getUiLang());
  return <button data-testid="approve-card">{m.approve}</button>;
}
```

```tsx
// Client component
"use client";
import { useMessages } from "@/lib/i18n/client";
import { cardMessages } from "./messages";

export function ApproveButton() {
  const m = useMessages(cardMessages);
  return <button data-testid="approve-card">{m.approve}</button>;
}
```

Rules: `data-testid` values never depend on language. Do not import `@/lib/i18n/server` from a client component (use `useMessages`). Never put interface text in a page or component file.
