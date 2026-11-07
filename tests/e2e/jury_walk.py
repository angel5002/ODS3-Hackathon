"""Jury walk: the public flows as a jury member sees them, on phones with a slow CPU and 4G.

    ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/jury_walk.py [--base https://asistia-e5.vercel.app]

Profiles: Pixel 7 and iPhone 13 (mobile emulation, CPU 4x slower, simulated 4G) and a 360 px phone.
Walks / , /pedir-cita (home, 30 s idle, chat with ACEPTO and a full registration with a fictitious
name, the form, the voice start screen without calling), /t/<phone> (look only: no sound, no calls)
and /acceso. Asserts:
  - no console errors and no failed /api requests;
  - /pedir-cita never shows "La conversación se cerró o venció" and does not reload by itself during
    30 s (one document load, at most one POST /api/chat/session per page load);
  - the chat registration completes and returns an S-XXXX code;
  - the demo disclaimer is visible on every page;
  - no horizontal overflow at 360 px.
Interactions slower than 300 ms (click until the screen answers) are reported as warnings.

It writes to the shared database (one chat session per profile and one request named
"Jurado Prueba Ficticio"), so it refuses to run without ALLOW_DB_WRITE=1. It never resets the demo
and never starts a call.
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("jury_walk.py: crea una conversación y una solicitud ficticias en la base compartida. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)

import argparse
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

DISCLAIMER = "Pacientes ficticios"
EXPIRED = "La conversación se cerró o venció"
SLOW_MS = 300
IDLE_S = 30
FICTITIOUS_NAME = "Jurado Prueba Ficticio"

UA_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
PROFILES = {
    "pixel7": dict(viewport={"width": 412, "height": 839}, device_scale_factor=2.625, is_mobile=True, has_touch=True, user_agent=UA_ANDROID),
    "iphone13": dict(viewport={"width": 390, "height": 664}, device_scale_factor=3, is_mobile=True, has_touch=True, user_agent=UA_IPHONE),
    "w360": dict(viewport={"width": 360, "height": 740}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent=UA_ANDROID),
}

failures: list[str] = []
warnings: list[str] = []

# Counts document loads per tab (survives reloads inside the same tab, not new tabs).
INIT_JS = "try { sessionStorage.__jury_loads = String(Number(sessionStorage.__jury_loads || 0) + 1); } catch (e) {}"


def fail(msg: str):
    failures.append(msg)
    print("  FALLA:", msg)


def warn(msg: str):
    warnings.append(msg)
    print("  aviso:", msg)


class Watch:
    """Console errors, failed /api requests and chat sessions created, for one tab."""

    def __init__(self, page: Page, profile: str):
        self.page, self.profile = page, profile
        self.console: list[str] = []
        self.api_failed: list[str] = []
        self.sessions = 0
        page.on("console", lambda m: m.type == "error" and self.console.append(m.text[:200]))
        page.on("pageerror", lambda e: self.console.append(f"pageerror: {str(e)[:200]}"))
        page.on("response", self._response)
        page.on("requestfailed", self._failed)
        page.on("request", self._request)

    def _response(self, r):
        if "/api/" in r.url and r.status >= 400:
            self.api_failed.append(f"{r.status} {r.request.method} {r.url.split('?')[0]}")

    def _failed(self, r):
        # a GET cut by a navigation (poll in flight when leaving the page) is not a failure
        if "/api/" in r.url and not (r.method == "GET" and "ERR_ABORTED" in (r.failure or "")):
            self.api_failed.append(f"{r.method} {r.url.split('?')[0]} {r.failure}")

    def _request(self, r):
        if r.method == "POST" and r.url.split("?")[0].endswith("/api/chat/session"):
            self.sessions += 1

    def check(self, where: str):
        for c in self.console:
            fail(f"[{self.profile}] {where}: error en la consola: {c}")
        for a in self.api_failed:
            fail(f"[{self.profile}] {where}: petición /api fallida: {a}")
        self.console.clear()
        self.api_failed.clear()


def slow_device(page: Page):
    cdp = page.context.new_cdp_session(page)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    cdp.send("Network.enable")
    # "4G" as in Chrome DevTools presets: ~20 ms RTT added, 4 Mbit/s down, 3 Mbit/s up
    cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 20, "downloadThroughput": 4_000_000 / 8, "uploadThroughput": 3_000_000 / 8})


def check_page(page: Page, profile: str, where: str):
    if not page.get_by_text(DISCLAIMER).first.is_visible():
        fail(f"[{profile}] {where}: no se ve el aviso de demostración")
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    if over > 0:
        width = page.viewport_size["width"] if page.viewport_size else "?"
        fail(f"[{profile}] {where}: desborde horizontal de {over} px a {width} px")


def loads(page: Page) -> int:
    return int(page.evaluate("Number(sessionStorage.__jury_loads || 0)"))


def timed_click(page: Page, locator, label: str, answered, profile: str):
    """Click and measure until the screen answers (answered() returns True).
    The trial click first waits until the target is visible and done animating in, so the time
    measures the app's answer and not Playwright waiting for an entrance animation."""
    locator.click(trial=True)
    t = time.monotonic()
    locator.click()
    while not answered():
        if time.monotonic() - t > 15:
            fail(f"[{profile}] {label}: la pantalla no respondió en 15 s")
            return
        page.wait_for_timeout(16)
    ms = int((time.monotonic() - t) * 1000)
    print(f"  {label}: {ms} ms")
    if ms > SLOW_MS:
        warn(f"[{profile}] {label}: {ms} ms (> {SLOW_MS} ms)")


def bubbles(page: Page) -> int:
    return page.locator("ol > li").count()


def bot_turn(page: Page, profile: str, label: str, button: str | None = None, text: str | None = None):
    """Answer one bot question (quick button or typed text) and wait for the bot's reply."""
    before = bubbles(page)
    if button:
        btn = page.get_by_role("button", name=button, exact=True).first
        btn.wait_for(timeout=20000)
        # the screen answers when the typing bubble or the reply shows up
        timed_click(page, btn, f"chat «{label}»", lambda: bubbles(page) > before, profile)
    else:
        page.locator("#msg").fill(text or "")
        timed_click(page, page.get_by_role("button", name="Enviar"), f"chat «{label}»", lambda: bubbles(page) > before, profile)
    t = time.monotonic()
    while time.monotonic() - t < 30:
        if page.get_by_text("escribiendo…").count() == 0 and bubbles(page) >= before + 2:
            return
        page.wait_for_timeout(100)
    fail(f"[{profile}] chat «{label}»: el asistente no contestó en 30 s")
    raise RuntimeError("bot did not answer")


def register_by_chat(page: Page, profile: str) -> str | None:
    bot_turn(page, profile, "ACEPTO", button="ACEPTO")
    bot_turn(page, profile, "pedir cita", button="1. Pedir una cita nueva")
    bot_turn(page, profile, "para mí", button="1. Para mí")
    bot_turn(page, profile, "nombre", text=FICTITIOUS_NAME)
    bot_turn(page, profile, "documento", button="1. DNI")
    bot_turn(page, profile, "edad", text="45")
    bot_turn(page, profile, "especialidad", button="1. Medicina Interna")
    bot_turn(page, profile, "referencia", button="2. No")
    bot_turn(page, profile, "motivo", text="Control de rutina por una molestia leve en la rodilla desde hace meses")
    bot_turn(page, profile, "alarma", button="NO")
    bot_turn(page, profile, "canal", button="1. Por este chat")
    bot_turn(page, profile, "poco aviso", button="1. Sí")
    bot_turn(page, profile, "preferente", button="3. Ninguna")
    bot_turn(page, profile, "resumen", button="1. Sí")
    m = re.search(r"\bS-\d{3,}\b", page.locator("ol").inner_text())
    return m.group(0) if m else None


def walk(browser, base: str, profile: str, phone: str, register: bool, shots: Path | None):
    print(f"\n== {profile} ==")
    ctx = browser.new_context(**PROFILES[profile], locale="es-PE")
    ctx.add_init_script(INIT_JS)
    page = ctx.new_page()
    w = Watch(page, profile)
    slow_device(page)

    def shot(name: str):
        if shots:
            page.screenshot(path=str(shots / f"{profile}_{name}.png"))

    # landing
    page.goto(f"{base}/", wait_until="load")
    page.wait_for_timeout(800)
    check_page(page, profile, "/")
    shot("landing")
    w.check("/")

    # /pedir-cita: idle 30 s, no reload, no expired notice, one chat session
    page.goto(f"{base}/pedir-cita", wait_until="load")
    start_loads = loads(page)
    page.get_by_role("button", name=re.compile("Chatear con el asistente")).wait_for(timeout=30000)
    print(f"  /pedir-cita: esperando {IDLE_S} s sin tocar nada…")
    t = time.monotonic()
    while time.monotonic() - t < IDLE_S:
        if page.get_by_text(EXPIRED).count():
            fail(f"[{profile}] /pedir-cita: muestra «{EXPIRED}» sin haber hecho nada")
            break
        page.wait_for_timeout(500)
    reloads = loads(page) - start_loads
    if reloads:
        fail(f"[{profile}] /pedir-cita: la página se recargó sola {reloads} vez/veces en {IDLE_S} s")
    if w.sessions > 1:
        fail(f"[{profile}] /pedir-cita: {w.sessions} POST /api/chat/session en una sola carga (máximo 1)")
    check_page(page, profile, "/pedir-cita inicio")
    shot("pedir_inicio")
    w.check("/pedir-cita inicio")

    # chat
    timed_click(
        page,
        page.get_by_role("button", name=re.compile("Chatear con el asistente")),
        "abrir el chat",
        lambda: page.locator("#msg").count() > 0,
        profile,
    )
    if register:
        try:
            code = register_by_chat(page, profile)
        except RuntimeError:
            code = None
        if code:
            print(f"  solicitud registrada por chat: {code}")
        else:
            fail(f"[{profile}] el registro por chat no devolvió un código S-XXXX")
        shot("chat_registro")
    else:
        bot_turn(page, profile, "ACEPTO", button="ACEPTO")
        shot("chat_menu")
    if page.get_by_text(EXPIRED).count():
        fail(f"[{profile}] chat: muestra «{EXPIRED}»")
    check_page(page, profile, "/pedir-cita chat")
    w.check("/pedir-cita chat")

    # the form (look only) and the voice start screen (no call)
    page.get_by_role("button", name="Volver").click()
    timed_click(page, page.get_by_role("button", name=re.compile("^Formulario")), "abrir el formulario", lambda: page.get_by_text("Registrar solicitud").count() > 0, profile)
    check_page(page, profile, "/pedir-cita formulario")
    shot("pedir_formulario")
    page.get_by_role("button", name="Volver").click()
    timed_click(page, page.get_by_role("button", name=re.compile("Hablar con el asistente")), "abrir la llamada", lambda: page.get_by_role("button", name="Volver").count() > 0, profile)
    check_page(page, profile, "/pedir-cita voz")
    if loads(page) - start_loads:
        fail(f"[{profile}] /pedir-cita: la página se recargó sola durante el recorrido")
    if w.sessions > 1:
        fail(f"[{profile}] /pedir-cita: {w.sessions} POST /api/chat/session en una sola carga (máximo 1)")
    w.check("/pedir-cita voz")

    # simulated phone: look only (no "Activar sonido", no calls)
    page.goto(f"{base}/t/{phone}", wait_until="load")
    page.get_by_text("Teléfono simulado de").wait_for(timeout=30000)
    check_page(page, profile, f"/t/{phone}")
    shot("telefono")
    w.check(f"/t/{phone}")

    # staff access (PIN screen only)
    page.goto(f"{base}/acceso", wait_until="load")
    page.locator("#pin").wait_for(timeout=30000)
    check_page(page, profile, "/acceso")
    shot("acceso")
    w.check("/acceso")
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://asistia-e5.vercel.app")
    ap.add_argument("--phone", default="rosa", help="token of the simulated phone to look at (never called)")
    ap.add_argument("--shots", default="", help="folder for screenshots (optional)")
    ap.add_argument("--headed", action="store_true")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    shots = Path(a.shots) if a.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    print(f"Recorrido del jurado en {base}")
    with sync_playwright() as p:
        b = p.chromium.launch(headless=not a.headed)
        try:
            walk(b, base, "pixel7", a.phone, register=True, shots=shots)
            walk(b, base, "iphone13", a.phone, register=False, shots=shots)
            walk(b, base, "w360", a.phone, register=False, shots=shots)
        finally:
            b.close()
    print()
    for x in warnings:
        print("AVISO:", x)
    if failures:
        print(f"\n{len(failures)} falla(s):")
        for f in failures:
            print(" -", f)
        sys.exit(1)
    print("\nRecorrido del jurado: OK" + (f" ({len(warnings)} aviso(s) de lentitud)" if warnings else ""))


if __name__ == "__main__":
    main()
