import { assertEquals } from "jsr:@std/assert@1";
import { AppError, handle, json, readJson } from "./http.ts";

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
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logged.push(args[0]); };
  let res: Response;
  try {
    res = await h(new Request("http://x", { method: "POST" }));
  } finally {
    console.error = original;
  }
  assertEquals((logged[0] as Error).message, "boom");
  assertEquals(res.status, 500);
  assertEquals((await res.json()).error, "internal");
});

Deno.test("handle() answers OPTIONS preflight", async () => {
  const h = handle(async () => json({}));
  const res = await h(new Request("http://x", { method: "OPTIONS" }));
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
});

Deno.test("readJson() rejects a JSON null body as bad_request", async () => {
  const req = new Request("http://x", { method: "POST", body: "null" });
  const err = await readJson(req).then(() => null, (e) => e);
  assertEquals(err instanceof AppError, true);
  assertEquals((err as AppError).code, "bad_request");
});

Deno.test("readJson() rejects non-object JSON (array, string, number) as bad_request", async () => {
  for (const body of ["[1,2]", "\"hi\"", "42", "true"]) {
    const req = new Request("http://x", { method: "POST", body });
    const err = await readJson(req).then(() => null, (e) => e);
    assertEquals(err instanceof AppError, true, `body ${body}`);
    assertEquals((err as AppError).code, "bad_request", `body ${body}`);
  }
  const ok = await readJson<{ a: number }>(new Request("http://x", { method: "POST", body: "{\"a\":1}" }));
  assertEquals(ok, { a: 1 });
});
