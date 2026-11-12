import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { buildApp } from "../src/app.js";
function next(ws: WebSocket) {
  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error("WebSocket timeout")), 5000);
    ws.once("message", (raw) => {
      clearTimeout(timeout);
      resolve(JSON.parse(raw.toString()));
    });
  });
}
test("HTTP multiplayer: registration, private join, legal actions, persistence and logout", async () => {
  const dir = mkdtempSync(join(tmpdir(), "stackora-"));
  const path = join(dir, "test.sqlite");
  let server = await buildApp(path, false);
  const post = (path: string, payload: any, token = "") =>
    server.app.inject({
      method: "POST",
      url: path,
      payload,
      headers: { authorization: "Bearer " + token },
    });
  try {
    const u1 = (
      await post("/auth/register", {
        email: "one@example.test",
        password: "correct-password-1",
        name: "Alice",
      })
    ).json();
    const u2 = (
      await post("/auth/register", {
        email: "two@example.test",
        password: "correct-password-2",
        name: "Boris",
      })
    ).json();
    assert.ok(u1.token);
    assert.ok(u2.token);
    assert.equal(
      (
        await post("/auth/login", {
          email: "one@example.test",
          password: "wrong-password",
        })
      ).statusCode,
      400,
    );
    const t = (
      await post(
        "/tournaments",
        { name: "Une vraie table", maxPlayers: 9 },
        u1.token,
      )
    ).json();
    assert.ok(t.id);
    assert.equal(
      (
        await server.app.inject({
          url: "/tournaments/" + t.id,
          headers: { authorization: "Bearer " + u2.token },
        })
      ).statusCode,
      400,
    );
    await post("/join", { code: t.code }, u2.token);
    assert.equal(
      (await post(`/tournaments/${t.id}/start`, {}, u2.token)).statusCode,
      400,
    );
    const started = (
      await post(`/tournaments/${t.id}/start`, {}, u1.token)
    ).json();
    assert.equal(started.status, "playing");
    assert.ok(!JSON.stringify(started).includes('"deck"'));
    assert.equal(
      started.tables[0].hand.players.find((p: any) => p.id === u2.user.id).cards
        .length,
      0,
    );
    const actor = started.tables[0].hand.turn;
    const token = actor === u1.user.id ? u1.token : u2.token;
    const cmd = {
      type: "call",
      version: started.version,
      actionId: "first-action-001",
    };
    const result = (
      await post(`/tournaments/${t.id}/action`, cmd, token)
    ).json();
    assert.ok(result.version > started.version);
    const again = (
      await post(`/tournaments/${t.id}/action`, cmd, token)
    ).json();
    assert.equal(again.version, result.version);
    await server.app.close();
    server = await buildApp(path, false);
    const restored = (
      await server.app.inject({
        url: "/tournaments/" + t.id,
        headers: { authorization: "Bearer " + token },
      })
    ).json();
    assert.equal(restored.version, result.version);
    assert.equal(restored.tables[0].hand.turn, result.tables[0].hand.turn);
    await post("/auth/logout", {}, token);
    assert.equal(
      (
        await server.app.inject({
          url: "/me",
          headers: { authorization: "Bearer " + token },
        })
      ).statusCode,
      400,
    );
  } finally {
    await server.app.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("WebSocket authentication, hidden cards and reconnect resynchronization", async () => {
  const { app } = await buildApp(":memory:", false);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const port = (app.server.address() as any).port;
  const post = (url: string, payload: any, token = "") =>
    app.inject({
      method: "POST",
      url,
      payload,
      headers: { authorization: "Bearer " + token },
    });
  const u = (
    await post("/auth/register", {
      email: "ws@example.test",
      name: "SocketUser",
      password: "long-password-01",
    })
  ).json();
  const t = (
    await post("/tournaments", { name: "Socket table" }, u.token)
  ).json();
  await post(`/tournaments/${t.id}/bots`, { count: 2 }, u.token);
  await post(`/tournaments/${t.id}/start`, {}, u.token);
  let ws: WebSocket | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      await new Promise((resolve) => ws!.once("open", resolve));
      let msg = next(ws);
      ws.send(JSON.stringify({ type: "auth", token: u.token }));
      assert.equal((await msg).type, "authenticated");
      msg = next(ws);
      ws.send(JSON.stringify({ type: "subscribe", id: t.id }));
      const state = (await msg).state;
      assert.ok(state.tables[0].hand);
      assert.equal(
        state.tables[0].hand.players
          .filter((p: any) => p.id !== u.user.id)
          .flatMap((p: any) => p.cards).length,
        0,
      );
      ws.close();
      await new Promise((resolve) => ws!.once("close", resolve));
    }
  } finally {
    ws?.terminate();
    await app.close();
  }
});
