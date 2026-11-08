// Ad-hoc router verification (deno run --allow-net --allow-read vt-val/api/router.probe.ts)
import handler from "../index.http.tsx";

const base = "https://val.test";
let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(base + path, {
    method,
    headers: { "x-forwarded-for": "203.0.113.9", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }));

// 1. OPTIONS feature-detect probe
const opt = await call("OPTIONS", "/api/ask-legal");
t("OPTIONS /api/ask-legal → 204", opt.status === 204);

// 2. wrong method
const get = await call("GET", "/api/triage");
t("GET /api/triage → 405 JSON", get.status === 405 && (await get.json()).error === "POST only");

// 3. unknown api route
const nf = await call("POST", "/api/nope");
t("POST /api/nope → 404 JSON", nf.status === 404 && typeof (await nf.json()).error === "string");

// 4. invalid body
const bad = await call("POST", "/api/ask-legal", { question: "hi" });
t("short question → 400 with safe error", bad.status === 400 && typeof (await bad.json()).error === "string");

const badJson = await handler(new Request(base + "/api/triage", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9", "content-type": "application/json" }, body: "not json" }));
t("non-JSON body → 400", badJson.status === 400);

// 5. zero grounding → deterministic escalate WITHOUT calling the model
const esc = await call("POST", "/api/ask-legal", { question: "Do we need a license to launch a satellite for the marketing team?" });
const escBody = await esc.json();
t(
  "no-grounding question → 200 escalate mirror",
  esc.status === 200 && escBody.answered === false && escBody.escalate === true && escBody.answer === null && escBody.confidence.level === "low" && escBody.mode === "live-ai",
  JSON.stringify(escBody.confidence.reasons[0]).slice(0, 90),
);

// 6. prop-support validation
const ps = await call("POST", "/api/prop-support", { quote: "short", proposition: "valid enough" });
t("prop-support bad quote → 400", ps.status === 400);

// 7. rate limit: same IP, 10/min shared across routes — count where the 429 lands
let last = 0;
for (let i = 0; i < 12; i++) {
  const r = await call("POST", "/api/triage", { text: "a question that is long enough but matches nothing zzz" + i });
  last = r.status;
  if (r.status === 429) { t("11th request same-IP → 429 (shared budget)", true, `landed on request #${i + 1}`); break; }
}
if (last !== 429) t("11th request same-IP → 429", false, `last status ${last}`);
const other = await call("POST", "/api/triage", { text: "another different ip asking about mold and no heat" }, { "x-forwarded-for": "198.51.100.7" });
t("different IP unaffected by the burst", other.status !== 429, `status ${other.status}${other.status === 200 ? " (model called — may 502 locally without val credentials)" : ""}`);

console.log(fail === 0 ? `ALL ${pass} PASS` : `${fail} FAIL / ${pass} pass`);
