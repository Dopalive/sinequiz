import { assertEquals } from "jsr:@std/assert@1";
import { AppError, handle, json } from "./http.ts";

Deno.test("json() sets status and content-type", async () => {
  const res = json({ ok: true }, 201);
  assertEquals(res.status, 201);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(await res.json(), { ok: true });
});

Deno.test("handle() maps AppError to its status and body", async () => {
  const h = handle(async () => { throw new AppError("insufficient_coins", "need more"); });
  const res = await h(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 402);
  assertEquals(await res.json(), { error: "insufficient_coins", message: "need more" });
});

Deno.test("handle() maps unknown errors to 500 internal", async () => {
  const h = handle(async () => { throw new Error("boom"); });
  const res = await h(new Request("http://x", { method: "POST" }));
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "internal");
});

Deno.test("handle() answers OPTIONS preflight", async () => {
  const h = handle(async () => json({}));
  const res = await h(new Request("http://x", { method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});
