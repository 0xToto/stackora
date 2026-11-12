import { useCallback, useEffect, useRef, useState } from "react";
import { storage as SecureStore } from "./storage";
import type { User, Game, Summary } from "./types";
export function useStackora() {
  const [url, setUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL ?? "http://192.168.1.20:3001",
  );
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [list, setList] = useState<Summary[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  useEffect(() => {
    SecureStore.getItemAsync("stackora-session")
      .then((s) => {
        if (s) {
          const v = JSON.parse(s);
          setUrl(v.url);
          setToken(v.token);
          setUser(v.user);
        }
      })
      .catch(() => setError("Impossible de restaurer la session."))
      .finally(() => setHydrated(true));
  }, []);
  const api = useCallback(
    async (path: string, body?: unknown, method?: string) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const r = await fetch(url.replace(/\/$/, "") + path, {
          method: method ?? (body ? "POST" : "GET"),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const v = await r.json();
        if (!r.ok) throw Error(v.error ?? "Erreur serveur");
        return v;
      } finally {
        clearTimeout(timeout);
      }
    },
    [url, token],
  );
  const safe = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }, []);
  const update = useCallback(
    (next: Game) =>
      setGame((current) =>
        current && current.id === next.id && current.version > next.version
          ? current
          : next,
      ),
    [],
  );
  const refresh = useCallback(
    async () => setList(await api("/tournaments")),
    [api],
  );
  useEffect(() => {
    if (token) void refresh().catch((e) => setError(e.message));
  }, [token, refresh]);
  useEffect(() => {
    if (!token || !game?.id) return;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;
    const id = game.id;
    function connect() {
      const ws = new WebSocket(
        url.replace(/^http/, "ws").replace(/\/$/, "") + "/ws",
      );
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "authenticated") {
          setOnline(true);
          ws.send(JSON.stringify({ type: "subscribe", id }));
        }
        if (msg.type === "state") update(msg.state);
        if (msg.type === "error") setError(msg.error);
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        setOnline(false);
        if (!stopped) retry = setTimeout(connect, 2000);
      };
    }
    connect();
    const poll = setInterval(
      () =>
        void api("/tournaments/" + id)
          .then(update)
          .catch(() => setOnline(false)),
      5000,
    );
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(poll);
      socket.current?.close();
    };
  }, [token, game?.id, url, api, update]);
  async function login(email: string, password: string, name?: string) {
    await safe(async () => {
      const v = await api(name ? "/auth/register" : "/auth/login", {
        email,
        password,
        ...(name ? { name } : {}),
      });
      await SecureStore.setItemAsync(
        "stackora-session",
        JSON.stringify({ ...v, url }),
      );
      setToken(v.token);
      setUser(v.user);
    });
  }
  async function logout() {
    await safe(async () => {
      try {
        await api("/auth/logout", {});
      } finally {
        await SecureStore.deleteItemAsync("stackora-session");
        setToken("");
        setUser(null);
        setGame(null);
        setList([]);
      }
    });
  }
  async function mutate(path: string, body: unknown) {
    await safe(async () => update(await api(path, body)));
  }
  async function play(type: string, amount?: number) {
    if (!game) return;
    const actionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await safe(async () => {
      try {
        update(
          await api(`/tournaments/${game.id}/action`, {
            type,
            amount,
            version: game.version,
            actionId,
          }),
        );
      } catch (e) {
        update(await api("/tournaments/" + game.id));
        throw e;
      }
    });
  }
  return {
    url,
    setUrl,
    user,
    game,
    setGame,
    list,
    error,
    setError,
    busy,
    online,
    hydrated,
    api,
    safe,
    refresh,
    login,
    logout,
    mutate,
    play,
    update,
  };
}
