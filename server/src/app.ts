import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { Store } from "./store.js";
import {
  createTournament,
  join,
  start,
  action,
  tick,
  view,
  assertTournament,
  type Tournament,
} from "./tournament.js";
const credentials = z.object({
  email: z.email().max(254),
  password: z.string().min(10).max(128),
});
const settings = z
  .object({
    name: z.string().trim().min(3).max(60),
    variant: z
      .enum(["classic", "sevenTwo", "ghost", "redRiver"])
      .default("classic"),
    maxPlayers: z.number().int().min(2).max(32).default(16),
    startingStack: z.number().int().min(100).max(100000).default(2000),
    initialBB: z.number().int().min(2).max(10000).default(50),
    levelSeconds: z.number().int().min(30).max(3600).default(180),
    decisionSeconds: z.number().int().min(5).max(120).default(20),
  })
  .refine((s) => s.startingStack >= s.initialBB * 2, {
    message: "Le stack doit être au moins égal à 2 BB.",
  });
const command = z.object({
  actionId: z.string().min(8).max(100),
  version: z.number().int(),
  type: z.enum(["fold", "check", "call", "raise"]),
  amount: z.number().int().positive().max(100000000).optional(),
});
export async function buildApp(path = "stackora.sqlite", runTimers = true) {
  const app = Fastify({
    logger: process.env.LOG_LEVEL ? { level: process.env.LOG_LEVEL } : false,
    bodyLimit: 16384,
  });
  const store = new Store(path);
  const games = new Map(store.all().map((t) => [t.id, t]));
  const clients = new Set<{
    socket: WebSocket;
    id: string;
    token: string;
    tournament: string | null;
  }>();
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") ?? false,
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  await app.register(websocket, { options: { maxPayload: 4096 } });
  app.setErrorHandler((error, req, reply) => {
    if (reply.statusCode === 429) {
      reply.send(error);
      return;
    }
    reply
      .code(error instanceof z.ZodError ? 400 : 400)
      .send({
        error:
          error instanceof z.ZodError
            ? "Données invalides."
            : error instanceof Error
              ? error.message
              : "Erreur inconnue.",
      });
  });
  function auth(req: any) {
    try {
      return store.auth(
        String(req.headers.authorization ?? "").replace(/^Bearer /, ""),
      );
    } catch {
      throw Error("Connexion requise.");
    }
  }
  function find(id: string) {
    const t = games.get(id);
    if (!t) throw Error("Tournoi introuvable.");
    return t;
  }
  function broadcast(t: Tournament) {
    for (const c of clients)
      if (c.tournament === t.id && c.socket.readyState === 1) {
        try {
          store.auth(c.token);
          c.socket.send(
            JSON.stringify({ type: "state", state: view(t, c.id) }),
          );
        } catch {
          c.socket.close(1008);
        }
      }
  }
  function commit(id: string, fn: (t: Tournament) => void) {
    const t = structuredClone(find(id));
    fn(t);
    assertTournament(t);
    store.save(t);
    games.set(t.id, t);
    broadcast(t);
    return t;
  }
  app.get("/health", async () => ({ ok: true, version: "0.1.0" }));
  app.post(
    "/auth/register",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const b = credentials
        .extend({
          name: z
            .string()
            .trim()
            .regex(/^[\p{L}\p{N}_-]{3,20}$/u),
        })
        .parse(req.body);
      return store.register(b.email, b.name, b.password);
    },
  );
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const b = credentials.parse(req.body);
      return store.login(b.email, b.password);
    },
  );
  app.get("/me", async (req) => store.user(auth(req)));
  app.post("/auth/logout", async (req) => {
    auth(req);
    const token = String(req.headers.authorization).replace(/^Bearer /, "");
    store.logout(token);
    for (const c of clients) if (c.token === token) c.socket.close(1008);
    return { ok: true };
  });
  app.get("/tournaments", async (req) => {
    const id = auth(req);
    return [...games.values()]
      .filter((t) => t.players.some((p) => p.id === id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        code: t.code,
        status: t.status,
        count: t.players.length,
        variant: t.variant,
      }));
  });
  app.post("/tournaments", async (req) => {
    const id = auth(req);
    const b = settings.parse(req.body);
    const t = createTournament(id, b.name, b);
    join(t, id, store.user(id).name);
    store.save(t);
    games.set(t.id, t);
    return view(t, id);
  });
  app.post("/join", async (req) => {
    const id = auth(req);
    const { code } = z
      .object({ code: z.string().min(1).max(20) })
      .parse(req.body);
    const t = [...games.values()].find(
      (t) => t.code === code.trim().toUpperCase(),
    );
    if (!t) throw Error("Code inconnu.");
    return view(
      commit(t.id, (t) => join(t, id, store.user(id).name)),
      id,
    );
  });
  app.get<{ Params: { id: string } }>("/tournaments/:id", async (req) =>
    view(find(req.params.id), auth(req)),
  );
  app.post<{ Params: { id: string } }>("/tournaments/:id/bots", async (req) => {
    const id = auth(req);
    const { count } = z
      .object({ count: z.number().int().min(1).max(31) })
      .parse(req.body);
    return view(
      commit(req.params.id, (t) => {
        if (t.owner !== id) throw Error("Organisateur uniquement.");
        if (t.players.length + count > t.maxPlayers)
          throw Error("Capacité dépassée.");
        for (let i = 0; i < count; i++)
          join(
            t,
            "bot-" + randomUUID(),
            ["Nova", "Atlas", "Jade", "Orion", "Luna", "Oscar", "Iris", "Milo"][
              i % 8
            ] +
              " " +
              (t.players.length + 1),
            true,
          );
      }),
      id,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/tournaments/:id/start",
    async (req) => {
      const id = auth(req);
      return view(
        commit(req.params.id, (t) => start(t, id)),
        id,
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/tournaments/:id/action",
    async (req) => {
      const id = auth(req);
      const b = command.parse(req.body);
      return view(
        commit(req.params.id, (t) => action(t, id, b, b.version, b.actionId)),
        id,
      );
    },
  );
  app.get("/ws", { websocket: true }, (socket) => {
    const client = {
      socket,
      id: "",
      token: "",
      tournament: null as string | null,
    };
    let messages = 0;
    let windowStart = Date.now();
    let alive = true;
    const authTimeout = setTimeout(() => {
      if (!client.id) socket.close(1008, "Authentication required");
    }, 5000);
    socket.on("pong", () => {
      alive = true;
    });
    const pulse = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
    }, 30000);
    socket.on("message", (raw) => {
      try {
        if (Date.now() - windowStart > 10000) {
          messages = 0;
          windowStart = Date.now();
        }
        if (++messages > 40) throw Error("Trop de messages.");
        const b = JSON.parse(raw.toString());
        if (b.type === "auth") {
          client.token = z.string().max(128).parse(b.token);
          client.id = store.auth(client.token);
          clients.add(client);
          clearTimeout(authTimeout);
          socket.send(JSON.stringify({ type: "authenticated" }));
          return;
        }
        if (!client.id) throw Error("Connexion requise.");
        store.auth(client.token);
        if (b.type === "subscribe") {
          const id = z.string().uuid().parse(b.id);
          const state = view(find(id), client.id);
          client.tournament = id;
          socket.send(JSON.stringify({ type: "state", state }));
        } else if (b.type === "action") {
          if (!client.tournament) throw Error("Table absente");
          const c = command.parse(b.command);
          commit(client.tournament, (t) =>
            action(t, client.id, c, c.version, c.actionId),
          );
        } else throw Error("Message inconnu.");
      } catch (e) {
        socket.send(
          JSON.stringify({
            type: "error",
            error: e instanceof Error ? e.message : "Erreur",
          }),
        );
      }
    });
    socket.on("close", () => {
      clients.delete(client);
      clearInterval(pulse);
      clearTimeout(authTimeout);
    });
  });
  const timer = runTimers
    ? setInterval(() => {
        for (const t of games.values())
          if (t.status === "playing") {
            const copy = structuredClone(t);
            try {
              if (tick(copy)) {
                assertTournament(copy);
                store.save(copy);
                games.set(copy.id, copy);
                broadcast(copy);
              }
            } catch (error) {
              app.log.error(error);
            }
          }
      }, 500)
    : null;
  app.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    for (const c of clients) c.socket.terminate();
    store.close();
  });
  return { app, store, games };
}
