/** Static examples mirror the archive mockup; no MCP server is contacted. */
export type Field = {
  type: "string" | "boolean" | "number" | "integer";
  title: string;
  description?: string;
  enum?: string[];
  enumNames?: string[];
  minimum?: number;
  maximum?: number;
  format?: string;
};
export type Plan = {
  id: string;
  title: string;
  message: string;
  requestedSchema: { type: "object"; required: string[]; properties: Record<string, Field> };
};
export const plans: Plan[] = [
  { id: "deploy-confirm", title: "Confirm deployment target", message: "The agent is about to deploy build 4f2a to an environment. Confirm where, and whether to run migrations first.", requestedSchema: { type: "object", required: ["environment", "runMigrations"], properties: {
    environment: { type: "string", title: "Environment", enum: ["staging", "production", "preview"], enumNames: ["Staging", "Production", "Preview"], description: "Production requires a change ticket." },
    runMigrations: { type: "boolean", title: "Run migrations first", description: "Schema changes are applied before the new build receives traffic." },
    ticket: { type: "string", title: "Change ticket", description: "Required for production only.", format: "CHG-0000" },
  } } },
  { id: "matter-intake", title: "Matter intake details", message: "Before drafting the engagement letter, the server needs the counterparty and the fee basis.", requestedSchema: { type: "object", required: ["counterparty", "feeBasis"], properties: {
    counterparty: { type: "string", title: "Counterparty", description: "Legal name as it should appear in the letter." },
    feeBasis: { type: "string", title: "Fee basis", enum: ["hourly", "fixed", "retainer"], enumNames: ["Hourly", "Fixed fee", "Monthly retainer"] },
    cap: { type: "number", title: "Fee cap (USD)", minimum: 0, maximum: 500000, description: "Leave empty for no cap." },
    conflictsCleared: { type: "boolean", title: "Conflicts cleared" },
  } } },
  { id: "redaction-scope", title: "Redaction scope", message: "The PII filter found 38 spans. Choose how aggressive the redaction pass should be.", requestedSchema: { type: "object", required: ["mode"], properties: {
    mode: { type: "string", title: "Mode", enum: ["identifiers", "all-pii", "sensitive-only"], enumNames: ["Identifiers only", "All PII", "Sensitive data only"], description: "Sensitive data follows LGPD art. 5º, II." },
    keepNames: { type: "boolean", title: "Keep party names", description: "Names of the contracting parties stay in clear." },
    threshold: { type: "integer", title: "Confidence threshold (%)", minimum: 5, maximum: 95 },
  } } },
];

type Validation = { valid: false; errors: string[] } | { valid: true; action: "accept" | "decline" | "cancel"; content?: Record<string, unknown> };
export function validateResponse(plan: Plan, input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { valid: false, errors: ["Expected a response object"] };
  const body = input as Record<string, unknown>;
  if (body.action !== "accept" && body.action !== "decline" && body.action !== "cancel") return { valid: false, errors: ["action must be accept, decline or cancel"] };
  if (body.action !== "accept") return { valid: true, action: body.action };
  const content = body.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return { valid: false, errors: ["content must be an object"] };
  const data = content as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of plan.requestedSchema.required) {
    if (!(key in data) || data[key] === "" || data[key] === null) errors.push(`${key}: required`);
  }
  for (const [key, value] of Object.entries(data)) {
    const field = plan.requestedSchema.properties[key];
    if (!field) { errors.push(`${key}: unknown field`); continue; }
    const expected = field.type === "integer" ? "number" : field.type;
    if (typeof value !== expected || (expected === "number" && !Number.isFinite(value))) { errors.push(`${key}: expected ${field.type}`); continue; }
    if (field.type === "integer" && !Number.isInteger(value)) errors.push(`${key}: expected integer`);
    else if (field.enum && !field.enum.includes(value as string)) errors.push(`${key}: invalid choice`);
    else if (typeof value === "number" && ((field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum))) errors.push(`${key}: outside allowed range`);
  }
  if (plan.id === "deploy-confirm" && data.environment === "production" && (typeof data.ticket !== "string" || !data.ticket.trim())) errors.push("ticket: required for production");
  return errors.length ? { valid: false, errors } : { valid: true, action: "accept", content: data };
}
