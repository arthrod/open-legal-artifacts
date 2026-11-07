import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchIntake, fetchIntakes } from "./firm_session.ts";

Deno.test("firm read requests send the supplied bearer token and surface failures", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  try {
    globalThis.fetch = (input, init) => {
      const url = String(input);
      calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
      if (url === "/api/intakes") return Promise.resolve(Response.json({ intakes: [] }));
      if (url === "/api/intakes/9") return Promise.resolve(Response.json({ intake: { id: 9 } }));
      return Promise.resolve(new Response("Unauthorized", { status: 401 }));
    };
    assertEquals(await fetchIntakes("example-token"), []);
    assertEquals((await fetchIntake(9, "example-token")).id, 9);
    await assertRejects(() => fetchIntake(3, "wrong-token"), Error, "401");
    assertEquals(calls, [
      { url: "/api/intakes", authorization: "Bearer example-token" },
      { url: "/api/intakes/9", authorization: "Bearer example-token" },
      { url: "/api/intakes/3", authorization: "Bearer wrong-token" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
