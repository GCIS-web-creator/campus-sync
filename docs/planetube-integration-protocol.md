# Planetube × CampusSync integration protocol (v1)

This document describes the CampusSync side while the Planetube website and browser-extension source are still being prepared.

## 1. Account pairing

1. A logged-in CampusSync user opens **Planetube連携**.
2. CampusSync calls \`POST /api/planetube/link\` with the user's Supabase access token.
3. CampusSync returns a one-time 20-character hexadecimal pairing code. It expires after 15 minutes and is stored only as a SHA-256 hash.
4. Planetube's server verifies its own signed-in user with Supabase Auth, obtains that user's immutable \`auth.users.id\`, and calls CampusSync:
   - \`POST /api/planetube/exchange\`
   - Header: \`x-planetube-integration-secret: <shared server secret>\`
   - JSON: \`{"pairingCode":"...","planetubeUserId":"<Planetube auth user UUID>"}\`
5. CampusSync consumes the code exactly once and marks the connection as linked.

The shared integration secret must be at least 32 random characters, stored only as a server-side environment variable named \`PLANETUBE_INTEGRATION_SECRET\` on both server environments. Never put it in a browser bundle, source repository, extension, or message to a user.

## 2. CampusSync user endpoints

All endpoints require \`Authorization: Bearer <CampusSync Supabase access token>\`.

- \`GET /api/planetube/link\`: reads the current user's link state and consented data.
- \`POST /api/planetube/link\`: issues a one-time pairing code.
- \`PATCH /api/planetube/link\`: saves the exact list of approved scopes.
- \`DELETE /api/planetube/link\`: revokes the link and clears the cached Planetube summary.
- \`POST /api/planetube/extension\`: records a small allowlisted extension/timer event.

The server resolves the current CampusSync user using Supabase Auth; it does not accept a user ID supplied by the browser.

## 3. Planetube-to-CampusSync summary sync

Planetube's server may call:

- \`POST /api/planetube/sync\`
- Header: \`x-planetube-integration-secret: <shared server secret>\`
- JSON:
  \`\`\`json
  {
    "planetubeUserId": "<Planetube auth user UUID>",
    "planetLevel": 4,
    "growthPoints": 120
  }
  \`\`\`

The sync is accepted only if the account is linked and the CampusSync user has approved the \`planet:read\` scope. Only the level, growth-point total, and synchronization time are stored. Do not send Planetube profile details or browsing history.

## 4. Browser-extension bridge

The CampusSync page and Planetube extension communicate through a versioned \`window.postMessage\` protocol. The extension's content script must be registered on the CampusSync production origin once that URL is confirmed.

### Page → extension

Ping:

\`\`\`js
{
  source: "CAMPUSSYNC_PLANETUBE",
  protocol: 1,
  type: "PING",
  issuedAt: 0
}
\`\`\`

Commands use \`type: "COMMAND"\`, a \`command\` name, and a payload:

| Command | Payload | Meaning |
|---|---|---|
| \`FOCUS_START\` | \`{ sessionId, durationSeconds, phase, reconnect? }\` | Start or restore the restriction session with the Pomodoro timer |
| \`FOCUS_PAUSE\` | \`{ sessionId, reconnect? }\` | Pause timer-linked control |
| \`FOCUS_RESUME\` | \`{ sessionId, durationSeconds, phase }\` | Resume timer-linked control |
| \`PHASE_CHANGED\` | \`{ sessionId, phase }\` | Notify focus/break transition |
| \`SESSION_END\` | \`{ sessionId, releaseRestrictions: true }\` | End the session and release session restrictions |

### Extension → page

The extension replies with \`source: "PLANETUBE_EXTENSION"\` and \`protocol: 1\`. It must send an \`ACK\` or \`ERROR\` for each accepted command and publish \`RESTRICTION_STATUS\` after the effective restriction state changes. The page may resend a command after reconnecting; repeated \`FOCUS_START\` messages with the same \`sessionId\` must restore the same session rather than creating duplicate sessions. A \`reconnect: true\` flag means the extension should reconcile its local state with the active CampusSync timer.

- \`{ type: "READY", extensionVersion: "1.0.0" }\`
- \`{ type: "DISCONNECTED" }\`
- \`{ type: "ACK", command: "FOCUS_START" }\`
- \`{ type: "ERROR", errorCode: "..." }\`
- \`{ type: "RESTRICTION_STATUS", enabled: true }\`

The page verifies the event source, origin, protocol, and allowlisted message type. The extension should independently verify the sender origin and accept messages only from the production CampusSync domain. Acknowledgements must not include visited URLs or browsing history.

## 5. Consent scopes

- \`planet:read\`: Planetube may send the planet level and growth-point total.
- \`focus:sync\`: CampusSync may send timer-state events and elapsed focus duration.
- \`extension:control\`: CampusSync may ask the already-installed extension to start, pause, resume, and end its restriction session.
- \`contribution:sync\`: reserved for a later school-contribution feature; it is disabled until that feature and its approval process are implemented.

Every scope is opt-in. Turning off \`planet:read\` deletes the cached planet summary. Disconnecting clears scopes, partner ID, pairing data, and cached summary.

## 6. Data minimization

Never transmit or store through this integration:
- school email, student number, name, class, password, or access token in the partner DB;
- task titles, subject names, reflections, homework details, or grades;
- visited URLs, YouTube watch history, search terms, or browsing history.

Timer event metadata is restricted to the session UUID, phase, duration, extension version, and small status/error codes. The CampusSync event API allows at most 60 events per user per minute. The extension itself must remain user-installed and user-authorized; a web page cannot silently install or enable a browser extension.
