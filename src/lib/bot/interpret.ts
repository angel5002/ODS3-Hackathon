// RF-14: the language model ONLY turns a free answer into the value of the current step (JSON validated
// against a schema). It never decides the next step, the urgency or the specialty. If the API is slow
// (> 6 s) or fails, the bot continues with numbered options and keyword matching: the demo never depends
// on the model.
import Anthropic from "@anthropic-ai/sdk";

export type Kind = "choice" | "age" | "text" | "yesno";

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic({ timeout: 6000, maxRetries: 0 });
  return client;
}

const SCHEMA = {
  type: "object",
  properties: {
    understood: { type: "boolean", description: "true only if the answer clearly gives a value for the question" },
    value: { type: "string", description: "the chosen option id, the age as digits, yes/no, or the cleaned text; empty if not understood" },
  },
  required: ["understood", "value"],
  additionalProperties: false,
} as const;

export type Interpretation = { value: string | null; by: "model" | "rules"; ms?: number };

/**
 * Interprets the answer to ONE question. `options` are [id, label] pairs for choice steps.
 * Rules first (instant, no cost); the model only when the rules do not understand a free answer.
 */
export async function interpret(question: string, answer: string, kind: Kind, options: [string, string][] = []): Promise<Interpretation> {
  const ruled = rules(answer, kind, options);
  if (ruled != null) return { value: ruled, by: "rules" };
  const c = anthropic();
  if (!c || kind === "text") return { value: kind === "text" ? answer.trim() : null, by: "rules" };
  const t0 = Date.now();
  try {
    const res = await c.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 200,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system:
        "Interpretas UNA respuesta de un paciente a UNA pregunta de un formulario de citas, en una demostración. " +
        "Devuelve solo el valor de esa pregunta. No diagnostiques, no deduzcas la especialidad a partir de síntomas, " +
        "no agregues información. Si la respuesta no contesta la pregunta, understood=false.",
      messages: [
        {
          role: "user",
          content:
            `Pregunta: ${question}\n` +
            (kind === "choice" ? `Opciones (id: texto):\n${options.map(([id, l]) => `${id}: ${l}`).join("\n")}\nDevuelve el id.\n` : "") +
            (kind === "age" ? "Devuelve la edad en años como número entero (bebés de meses: 0).\n" : "") +
            (kind === "yesno" ? "Devuelve si o no.\n" : "") +
            `Respuesta del paciente: ${answer.slice(0, 500)}`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") return { value: null, by: "model", ms: Date.now() - t0 };
    const parsed = JSON.parse(block.text) as { understood: boolean; value: string };
    if (!parsed.understood) return { value: null, by: "model", ms: Date.now() - t0 };
    const v = validate(parsed.value, kind, options);
    return { value: v, by: "model", ms: Date.now() - t0 };
  } catch {
    return { value: null, by: "rules", ms: Date.now() - t0 }; // timeout or error: numbered options
  }
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function validate(v: string, kind: Kind, options: [string, string][]) {
  if (kind === "choice") return options.some(([id]) => id === v) ? v : null;
  if (kind === "age") {
    const n = Number(String(v).replace(/\D/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= 120 ? String(n) : null;
  }
  if (kind === "yesno") return ["si", "no"].includes(norm(v)) ? norm(v) : null;
  return v.trim() || null;
}

/** Keyword and number matching: works without the model. */
export function rules(answer: string, kind: Kind, options: [string, string][]): string | null {
  const a = norm(answer);
  if (!a) return null;
  if (kind === "yesno") {
    if (/^(si|sí|s|1|claro|correcto|acepto|ok|de acuerdo|si,?.*)$/.test(a) || /^si\b/.test(a)) return "si";
    if (/^(no|n|2|ninguno|nada|no tiene)\b/.test(a)) return "no";
    return null;
  }
  if (kind === "age") {
    const m = a.match(/(\d{1,3})/);
    if (m) {
      const n = Number(m[1]);
      if (/mes/.test(a)) return "0";
      return n <= 120 ? String(n) : null;
    }
    return null;
  }
  if (kind === "choice") {
    const num = a.match(/^(\d{1,2})\b/);
    if (num) {
      const i = Number(num[1]) - 1;
      if (options[i]) return options[i][0];
    }
    for (const [id, label] of options) {
      const l = norm(label);
      if (a === l || a === norm(id) || (a.length >= 4 && l.includes(a)) || (l.length >= 4 && a.includes(l))) return id;
    }
    return null;
  }
  return answer.trim() || null;
}

/** Alarm words in the free reason: the alarm questions are asked again even if the person answered NO. */
export const ALARM_WORDS = [
  "pecho",
  "respirar",
  "falta de aire",
  "ahogo",
  "desmay",
  "desvanec",
  "inconscien",
  "paralis",
  "no puede hablar",
  "habla rara",
  "lado del cuerpo",
  "sangrado",
  "sangra",
  "hemorrag",
  "convuls",
  "fiebre",
  "106",
];

export function hasAlarmWords(text: string) {
  const t = norm(text);
  return ALARM_WORDS.some((w) => t.includes(norm(w)));
}
