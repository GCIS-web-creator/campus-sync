import { POST as earthquakes } from "./earthquakes.ts";
import { POST as weatherAlerts } from "./weather-alerts.ts";
import { POST as pushDispatch } from "./push-dispatch.ts";
import { POST as pushReminders } from "./push-reminders.ts";

type Handler = (request: Request) => Promise<Response>;

const handlers: Record<string, Handler> = {
  earthquakes,
  "weather-alerts": weatherAlerts,
  "push-dispatch": pushDispatch,
  "push-reminders": pushReminders,
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return Response.json({ success: false, message: "POST only" }, { status: 405 });
  }

  const task = new URL(request.url).searchParams.get("task") || "";

  // Safe, side-effect-free test for the shared Cron secret.
  if (task === "auth-check") {
    const expected = Deno.env.get("CRON_SECRET") || "";
    const received = request.headers.get("authorization") || "";
    if (!expected || received !== `Bearer ${expected}`) {
      return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    return Response.json({ success: true, authenticated: true });
  }

  const handler = handlers[task];
  if (!handler) {
    return Response.json({ success: false, message: "Unknown CampusSync task" }, { status: 400 });
  }

  return await handler(request);
});
