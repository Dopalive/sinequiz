import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { fiftyFiftyRemovals } from "./fiftyFifty.ts";

const S = "11111111-1111-1111-1111-111111111111";

Deno.test("fiftyFiftyRemovals() is deterministic per session/question/secret", async () => {
  const a = await fiftyFiftyRemovals(2, S, "q1", "secret");
  const b = await fiftyFiftyRemovals(2, S, "q1", "secret");
  assertEquals(a, b);
  assertEquals(await fiftyFiftyRemovals(2, S.toUpperCase(), "Q1", "secret"), a);
});

Deno.test("fiftyFiftyRemovals() removes two distinct wrong choices", async () => {
  for (let correct = 0; correct < 4; correct++) {
    for (let q = 0; q < 20; q++) {
      const r = await fiftyFiftyRemovals(correct, S, `q${q}`, "secret");
      assertEquals(r.length, 2);
      assertNotEquals(r[0], r[1]);
      assert(!r.includes(correct));
      assert(r.every((i) => i >= 0 && i <= 3));
    }
  }
});

Deno.test("fiftyFiftyRemovals() depends on the secret", async () => {
  // Over 20 questions, two different secrets yield the same sequence with negligible probability.
  const seqA: string[] = [];
  const seqB: string[] = [];
  for (let q = 0; q < 20; q++) {
    seqA.push(JSON.stringify(await fiftyFiftyRemovals(0, S, `q${q}`, "a")));
    seqB.push(JSON.stringify(await fiftyFiftyRemovals(0, S, `q${q}`, "b")));
  }
  assertNotEquals(seqA, seqB);
});
