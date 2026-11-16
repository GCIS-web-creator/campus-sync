import { POST as lineDailyDigest } from "./line-daily-digest.ts";
import { POST as lineWeeklySchoolSchedule } from "./line-weekly-school-schedule.ts";

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ success: false, message: "POST only" }, { status: 405 });
  }
  const payload = await request.clone().json().catch(() => ({})) as { mode?: unknown };
  if (payload.mode === "weekly_school_schedule") {
    return await lineWeeklySchoolSchedule(request);
  }
  return await lineDailyDigest(request);
});
