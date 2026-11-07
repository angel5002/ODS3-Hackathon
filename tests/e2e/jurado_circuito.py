"""Jury circuit: N jury members in parallel, each doing their full card, while the projector view follows.

    ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/jurado_circuito.py [--base http://localhost:3180] [--n 6]
        [--env PATH_TO/.env.local] [--pin LOCAL_TEST_PIN] [--keep]

It creates TEMPORARY test cards (public.jury_cards with is_test = true, tokens "j-test-…", fictitious
characters that are not printed), plays them, and drops them at the end with jury_drop_test() (only test
cards can be dropped), so the printed cards and the rest of the demo are untouched. It never resets the demo.

Default 6 jurors, run at the same time:
  voz  · confirma       Ítalo   asks for the call (/api/jury), the phone rings, he presses Rechazar (closes the
                                call, no voice session is opened) and confirms by message
  voz  · acepta_oferta  Nadia   (prefers calls) staff approves the offer: her phone rings, she rejects the call,
                                accepts by message; staff closes the offer; the validation call is rejected
                                too and she confirms by message
  voz  · pide_cita      Pilar   registers by CHAT (fallback: a browser voice call needs a real microphone and
                                the ElevenLabs agent, which automation cannot drive); staff categorizes, offers,
                                she accepts, staff closes, she confirms
  chat · cancela        Ciro    "No podré asistir" on his phone: his slot is released
  chat · pide_cita      Inés    same as Pilar, by chat, another specialty
  chat · acepta_oferta  Bruno   staff approves the offer, he accepts and confirms by message

After every action it polls GET /api/staff/data?view=jurado&test=1 until that card shows the expected
activity (time to the projector is reported), and at the end checks there are no cross-ups: every activity
line carries its own card's character, each card reached "completo", the new requests have their code,
category and state, and the projector's default view (without test=1) shows none of the test cards.
Exits 1 on any failure, 3 without ALLOW_DB_WRITE=1.
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("jurado_circuito.py: crea cartillas de prueba, solicitudes y ofertas en la base compartida. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)

import argparse
import asyncio
import json
import re
import secrets
import time
import urllib.request
from pathlib import Path

from playwright.async_api import Page, async_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
ALPH = "abcdefghjkmnpqrstuvwxyz23456789"
failures: list[str] = []
timings: dict[str, dict[str, float]] = {}

# ---------------------------------------------------------------- the test cards
JURORS = [
    dict(character="Ítalo", full_name="Ítalo Prueba Ficticio", channel="voz", kind="confirma", specialty="Medicina Interna", appt_time="12:20", age=70, sex="M"),
    dict(character="Nadia", full_name="Nadia Prueba Ficticia", channel="voz", kind="acepta_oferta", specialty="Odontología", category="P1", wait_days=20, reason="Prueba automática.", age=55, sex="F"),
    dict(character="Pilar", full_name="Pilar Prueba Ficticia", channel="voz", kind="pide_cita", specialty="Oftalmología", age=50, sex="F", menu="6", motivo="Me cuesta leer de cerca desde hace meses."),
    dict(character="Ciro", full_name="Ciro Prueba Ficticio", channel="chat", kind="cancela", specialty="Cirugía Pediátrica", appt_time="10:20", age=40, sex="M"),
    dict(character="Inés", full_name="Inés Prueba Ficticia", channel="chat", kind="pide_cita", specialty="Dermatología", age=38, sex="F", menu="7", motivo="Una mancha en la piel que cambió de color."),
    dict(character="Bruno", full_name="Bruno Prueba Ficticio", channel="chat", kind="acepta_oferta", specialty="Nutrición - Medicina", category="P2", wait_days=50, reason="Prueba automática.", age=45, sex="M"),
]


def env_from(path: Path) -> dict[str, str]:
    out = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
        if m:
            out[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return out


class Db:
    """Service-role REST access, only for creating and dropping the TEST cards. Never prints the key."""

    def __init__(self, url: str, key: str):
        self.url, self.key = url.rstrip("/"), key

    def _req(self, method: str, path: str, body=None, prefer: str | None = None):
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(f"{self.url}{path}", method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None

    def insert_cards(self, rows):
        return self._req("POST", "/rest/v1/jury_cards", rows, prefer="return=minimal")

    def rpc(self, fn: str, args: dict):
        return self._req("POST", f"/rest/v1/rpc/{fn}", args)


def fail(msg: str):
    failures.append(msg)
    print("  FALLA:", msg, flush=True)


class Staff:
    """The operator in /demo: same API the buttons call (PIN + role admisión)."""

    def __init__(self, ctx, base: str):
        self.req, self.base = ctx.request, base

    async def login(self, pin: str):
        r = await self.req.post(f"{self.base}/api/access", data={"pin": pin, "role": "admision"})
        if not r.ok:
            raise SystemExit("No se pudo entrar como Admisión (revise --pin)")

    async def action(self, body: dict):
        r = await self.req.post(f"{self.base}/api/staff", data=body)
        data = await r.json()
        if not r.ok:
            raise AssertionError(f"{body['action']}: {data.get('error')}")
        return data

    async def view(self, test=True):
        r = await self.req.get(f"{self.base}/api/staff/data?view=jurado{'&test=1' if test else ''}")
        if not r.ok:
            raise AssertionError(f"vista jurado: HTTP {r.status}")
        return await r.json()

    async def wait_activity(self, token: str, kind: str, label: str, timeout=25.0, text: str | None = None):
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            v = await self.view()
            if any(a["token"] == token and a["kind"] == kind and (text is None or text in a["text"]) for a in v["activity"]):
                dt = time.monotonic() - t0
                timings.setdefault(token, {})[f"proyector:{label}"] = dt
                return v
            await asyncio.sleep(0.7)
        fail(f"{token}: la vista del jurado no mostró «{kind}» ({label}) en {timeout:.0f} s")
        return None

    async def request_code(self, character: str, timeout=20.0):
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            v = await self.view()
            for r in v["newRequests"]:
                if r["character"] == character:
                    return r
            await asyncio.sleep(0.7)
        raise AssertionError(f"{character}: la solicitud no aparece en newRequests")


# ---------------------------------------------------------------- one juror
async def open_card(page: Page, base: str, token: str, character: str):
    await page.goto(f"{base}/j/{token}", wait_until="domcontentloaded", timeout=90000)
    await expect(page.get_by_role("heading", name=character)).to_be_visible(timeout=60000)
    await expect(page.get_by_text("Qué puede probar")).to_be_visible()


async def chat_say(page: Page, text: str, expect_text: str | None = None, timeout=45000):
    box = page.locator("#msg")
    await expect(box).to_be_enabled(timeout=timeout)
    async with page.expect_response(lambda r: "/api/chat/messages" in r.url and r.request.method == "POST", timeout=timeout) as resp:
        await box.fill(text)
        await box.press("Enter")
    r = await resp.value
    if not r.ok:
        raise AssertionError(f"chat «{text}»: HTTP {r.status}")
    if expect_text:
        await expect(page.get_by_text(expect_text).last).to_be_visible(timeout=timeout)
    else:
        await page.wait_for_timeout(250)


async def register_by_chat(page: Page, j: dict):
    await page.get_by_role("button", name=re.compile("Pedir la cita por chat")).click()
    await expect(page.get_by_text("Responda ACEPTO para continuar")).to_be_visible(timeout=60000)
    await chat_say(page, "ACEPTO", "¿Qué desea hacer?")
    await chat_say(page, "1", "¿La cita es para usted")
    await chat_say(page, "1", "¿Cuál es el nombre del paciente?")
    await chat_say(page, j["full_name"], "¿Qué documento tiene el paciente?")
    await chat_say(page, "1", "¿Qué edad tiene el paciente?")
    await chat_say(page, str(j["age"]), "¿Qué especialidad necesita?")
    await chat_say(page, j["menu"], "hoja de referencia")
    await chat_say(page, "2", "¿por qué necesita la consulta?")
    await chat_say(page, j["motivo"], "AHORA alguno de estos signos")
    await chat_say(page, "NO", "¿Cómo prefiere que le avisemos?")
    await chat_say(page, "1", "con 2 días de anticipación")
    await chat_say(page, "1", "embarazada o tiene alguna discapacidad")
    await chat_say(page, "3", "Resumen:")
    await chat_say(page, "1", "Su número de solicitud es")


async def phone_button(page: Page, name: str, timeout=45000):
    btn = page.get_by_role("button", name=name, exact=True).last
    await expect(btn).to_be_enabled(timeout=timeout)
    await btn.click()


async def reject_ringing(page: Page, timeout=30000) -> bool:
    """The simulated phone rings: press Rechazar (closes the call; no voice session is opened)."""
    btn = page.get_by_role("button", name="Rechazar")
    try:
        await expect(btn).to_be_visible(timeout=timeout)
    except AssertionError:
        return False
    await btn.click()
    await expect(btn).to_be_hidden(timeout=20000)
    return True


async def juror(pw, browser, base: str, staff: Staff, j: dict, token: str):
    ctx = await browser.new_context(viewport={"width": 390, "height": 760}, is_mobile=True, has_touch=True, permissions=["microphone"])
    page = await ctx.new_page()
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    marks = timings.setdefault(token, {})
    t0 = time.monotonic()
    ch = j["character"]
    try:
        await open_card(page, base, token, ch)
        await staff.wait_activity(token, "abrio", "abrió")
        kind = j["kind"]

        if kind == "confirma":
            call_btn = page.get_by_role("button", name=re.compile("Recibir la llamada"))
            if await call_btn.count():
                await call_btn.click()
                if await reject_ringing(page):
                    await staff.wait_activity(token, "llamada_fin", "rechazó la llamada")
                    marks["llamada_rechazada"] = time.monotonic() - t0
                else:
                    fail(f"{ch}: pidió la llamada pero el teléfono no sonó")
            else:
                print(f"  {ch}: sin líneas de voz libres; sigue por mensaje (sin error en la cartilla)", flush=True)
                await page.get_by_role("button", name=re.compile("Responder por mensaje")).click()
            await phone_button(page, "Confirmo")
            await staff.wait_activity(token, "confirmo", "confirmó")

        elif kind == "cancela":
            await page.get_by_role("button", name=re.compile("Responder por mensaje")).click()
            await phone_button(page, "No podré asistir")
            await staff.wait_activity(token, "cancelo", "avisó que no podrá ir")

        elif kind == "acepta_oferta":
            await page.get_by_role("button", name=re.compile("Abrir mi teléfono")).click()
            await expect(page.get_by_text("Teléfono simulado de")).to_be_visible(timeout=30000)
            await staff.action({"action": "jury_offer", "token": token})
            if j["channel"] == "voz":
                await reject_ringing(page)  # the offer agent calls; she answers by message instead
            await phone_button(page, "Acepto")
            await staff.wait_activity(token, "acepto", "aceptó")
            await close_if_open(staff, token)
            if j["channel"] == "voz":
                # the validation agent calls; a rejected call is retried once (update_call): reject both
                rang = 0
                while rang < 3 and await reject_ringing(page, timeout=8000 if rang == 0 else 5000):
                    rang += 1
                if not rang:
                    fail(f"{ch}: no sonó la llamada de validación")
            await phone_button(page, "Sí, soy el paciente")
            await staff.wait_activity(token, "confirmo", "confirmó el cupo")
            await expect(page.get_by_text("Su cita quedó registrada").last).to_be_visible(timeout=30000)

        elif kind == "pide_cita":
            await register_by_chat(page, j)
            await staff.wait_activity(token, "pidio_cita", "pidió una cita")
            marks["registro"] = time.monotonic() - t0
            req = await staff.request_code(ch)
            await staff.action({"action": "jury_categorize", "code": req["code"], "category": "P2"})
            await staff.wait_activity(token, "categorizada", "categorizada")
            await staff.action({"action": "jury_offer", "token": token})
            await expect(page.get_by_text("Se liberó un cupo de").last).to_be_visible(timeout=40000)
            await staff.wait_activity(token, "oferta", "le llegó la oferta")
            await chat_say(page, "Acepto", "Registramos que acepta")
            await staff.wait_activity(token, "acepto", "aceptó")
            await close_if_open(staff, token)
            await expect(page.get_by_text("es suyo. Para confirmarlo").last).to_be_visible(timeout=40000)
            await chat_say(page, "Sí, soy el paciente", "Su cita quedó registrada")
            await staff.wait_activity(token, "confirmo", "confirmó el cupo")

        marks["circuito"] = time.monotonic() - t0
        print(f"  {ch} ({j['channel']}, {j['kind']}): circuito completo en {marks['circuito']:.1f} s", flush=True)
        real = [e for e in errors if "favicon" not in e]
        if real:
            fail(f"{ch}: errores en la consola: {real[:3]}")
    except Exception as e:  # noqa: BLE001
        fail(f"{ch}: {type(e).__name__}: {str(e)[:300]}")
        await page.screenshot(path=str(ROOT / "test-results" / f"jurado_{token}.png"))
    finally:
        await ctx.close()


async def close_if_open(staff: Staff, token: str):
    """Staff closes the offer window (if every candidate answered it closed by itself)."""
    try:
        await staff.action({"action": "jury_close", "token": token})
    except AssertionError as e:
        if "No hay una oferta abierta" not in str(e):
            raise


# ---------------------------------------------------------------- run
async def run(args):
    env = env_from(Path(args.env))
    db = Db(env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])
    jurors = (JURORS * ((args.n + len(JURORS) - 1) // len(JURORS)))[: args.n]
    rows, tokens = [], []
    for i, j in enumerate(jurors):
        token = "j-test-" + "".join(secrets.choice(ALPH) for _ in range(6))
        tokens.append(token)
        rows.append(
            dict(
                token=token, character=j["character"] if i < len(JURORS) else f"{j['character']}{i}", full_name=j["full_name"],
                story=f"Cartilla de prueba automática ({j['kind']}).", try_line="Prueba automática.", channel=j["channel"], kind=j["kind"],
                specialty=j["specialty"], appt_time=j.get("appt_time"), category=j.get("category"), wait_days=j.get("wait_days"),
                reason=j.get("reason"), age=j["age"], sex=j["sex"], is_test=True, sort=900 + i,
            )
        )
        jurors[i] = {**j, "character": rows[-1]["character"]}
    db.insert_cards(rows)
    print(f"{len(rows)} cartillas de prueba creadas", flush=True)
    (ROOT / "test-results").mkdir(exist_ok=True)
    t0 = time.monotonic()
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
            sctx = await browser.new_context()
            staff = Staff(sctx, args.base)
            await staff.login(args.pin)
            await asyncio.gather(*(juror(pw, browser, args.base, staff, j, t) for j, t in zip(jurors, tokens)))
            total = time.monotonic() - t0

            # ---- the projector: no cross-ups
            v = await staff.view()
            by_token = {c["token"]: c for c in v["cards"]}
            for j, t in zip(jurors, tokens):
                c = by_token.get(t)
                if not c:
                    fail(f"{j['character']}: la cartilla no está en la vista")
                    continue
                if c["character"] != j["character"]:
                    fail(f"{t}: personaje {c['character']} en vez de {j['character']}")
                if c["state"] != "completo":
                    fail(f"{j['character']}: estado {c['state']} (se esperaba completo)")
                if c["path"] != f"/j/{t}":
                    fail(f"{j['character']}: path {c['path']}")
            for a in v["activity"]:
                c = by_token.get(a["token"])
                if c and a["character"] != c["character"]:
                    fail(f"actividad cruzada: {a['text']} bajo {a['token']} ({c['character']})")
                if c and c["character"] not in a["text"]:
                    fail(f"actividad sin su personaje: {a['text']} ({c['character']})")
            if [a["at"] for a in v["activity"]] != sorted((a["at"] for a in v["activity"]), reverse=True):
                fail("la actividad no está ordenada de la más nueva a la más antigua")
            names = {j["character"] for j in jurors if j["kind"] == "pide_cita"}
            got = {r["character"]: r for r in v["newRequests"] if r["character"] in names}
            for n in names:
                r = got.get(n)
                if not r:
                    fail(f"{n}: no aparece en newRequests")
                elif not (re.match(r"^S-\d{4}$", r["code"]) and r["category"] == "P2" and r["state"] == "Con cita"):
                    fail(f"{n}: newRequests {r}")
            public = await staff.view(test=False)
            if any(c["token"].startswith("j-test-") for c in public["cards"]) or any(a["token"].startswith("j-test-") for a in public["activity"]):
                fail("la vista del proyector (sin test=1) muestra cartillas de prueba")
            await browser.close()
    finally:
        if args.keep:
            print("--keep: las cartillas de prueba quedan en la base:", ", ".join(tokens))
        else:
            for t in tokens:
                try:
                    db.rpc("jury_drop_test", {"p_token": t})
                except Exception as e:  # noqa: BLE001
                    fail(f"no se pudo borrar {t}: {e}")
            print("cartillas de prueba borradas", flush=True)

    print("\nTiempos (s):")
    for j, t in zip(jurors, tokens):
        m = timings.get(t, {})
        lag = [v for k, v in m.items() if k.startswith("proyector:")]
        print(f"  {j['character']:<6} {j['channel']:<4} {j['kind']:<13} circuito {m.get('circuito', float('nan')):6.1f}"
              f"   llega al proyector: máx {max(lag) if lag else float('nan'):4.1f}")
    print(f"  {len(jurors)} jurados en paralelo: {total:.1f} s en total")
    return 1 if failures else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3180")
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--env", default=str(ROOT / ".env.local"))
    ap.add_argument("--pin", default=_os.environ.get("LOCAL_TEST_PIN", "482913"))
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    code = asyncio.run(run(args))
    print("\nOK: circuito del jurado" if not code else f"\n{len(failures)} fallas")
    _sys.exit(code)


if __name__ == "__main__":
    main()
