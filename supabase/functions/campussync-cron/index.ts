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
  const handler = handlers[task];
  if (!handler) {
    return Response.json({ success: false, message: "Unknown CampusSync task" }, { status: 400 });
  }

  return await handler(request);
});
