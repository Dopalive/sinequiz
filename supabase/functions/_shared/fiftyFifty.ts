/**
 * Picks the two wrong choices a fifty_fifty joker removes, deterministically per (session, question) so a
 * replayed request returns the same pair.
 *
 * The seed is an HMAC keyed with a server-only secret. An unkeyed hash of session_id + question_id would be
 * computable by the client, and knowing which of the three wrong indices is kept leaks the correct answer
 * whenever a removed index lies between the two remaining ones. Ids are lower-cased first: Postgres accepts
 * any uuid casing, so a retry with different casing must not yield a second, different pair.
 */
export async function fiftyFiftyRemovals(
  correctIndex: number,
  sessionId: string,
  questionId: string,
  secret: string,
): Promise<[number, number]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`fifty_fifty:${sessionId.toLowerCase()}:${questionId.toLowerCase()}`)));
  const seed = new DataView(mac.buffer).getUint32(0);
  const wrong = [0, 1, 2, 3].filter((i) => i !== correctIndex);
  wrong.splice(seed % wrong.length, 1); // drop the one wrong choice that stays visible
  return [wrong[0]!, wrong[1]!];
}
