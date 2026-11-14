import { z } from "zod";
import type { ApplicationEvent } from "@/contracts";
import { getDb } from "@/db/client";
import { requireOwnApplication, skipApplicationQuestion } from "@/features/application";
import { assertInterviewing } from "@/features/application/engine-store";
import { route } from "@/lib/http";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";

/** "Skip question": the requirement is marked skipped and the next line streams as in a turn. */
const SkipBody = z.object({ requirementId: z.string().min(1).max(100).optional() });

export const POST = route(async (request: Request, ctx: RouteContext<"/api/application/[id]/skip">) => {
  const { id } = await ctx.params;
  const db = getDb();
  await requireOwnApplication(db, id);
  const raw = await request.text();
  let parsed: unknown = {};
  try {
    parsed = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const body = SkipBody.safeParse(parsed);
  await assertInterviewing(db, id);
  return sseResponse<ApplicationEvent>(async (send, signal) => {
    for await (const event of skipApplicationQuestion(db, id, { signal, requirementId: body.success ? body.data.requirementId : undefined })) send(event);
  });
});
