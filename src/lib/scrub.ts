// Free text that reaches the regulator is scrubbed on the server (v4 §2, conversaciones §2 step 7):
// e-mails, links, long numbers (documents, phones), self-introductions and the person's own name.
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const NUMBERS = /\+?\d[\d\s.-]{5,}\d/g;
const URLS = /\bhttps?:\/\/\S+/gi;
const NAME = "[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+";
// "me llamo Ana Pérez", "mi nombre es ...", "mi hija se llama Rosa" -> keep the phrase, drop the name
const INTRO = new RegExp(
  `\\b([Mm]e llamo|[Mm]i nombre es|[Ss]e llama|[Ss]oy|[Mm]i (?:hij[oa]|madre|mam[aá]|padre|pap[aá]|espos[oa]|abuel[oa])(?: se llama)?)\\s+(${NAME})(\\s+${NAME}){0,3}`,
  "g",
);

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubReason(text: string, name?: string | null) {
  let out = text
    .replace(URLS, "[enlace]")
    .replace(EMAIL, "[correo]")
    .replace(NUMBERS, "[número]")
    .replace(INTRO, (_m, intro: string) => `${intro} [nombre]`);
  for (const part of (name ?? "").split(/\s+/).filter((p) => p.length >= 3)) {
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escape(part)}(?=$|[^\\p{L}])`, "giu"), "$1[nombre]");
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 400);
}
