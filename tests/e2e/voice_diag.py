"""Voice diagnostics (E5, hito 1): reproduce parallel-use scenarios A-G against a running local server.

Usage:
  ml/.venv/Scripts/python tests/e2e/voice_diag.py --base http://localhost:3000 --pin <local test PIN> \
      --audio <wav> --out <dir> [--only A,B,...]

Each "person" is an isolated browser context with a fake microphone (Chromium fake media flags).
Records, per page: the app's "[voz …]" diagnostics, console errors, page errors, /api/voice/* responses
and the ElevenLabs WebSocket open/close (host only: the signed URL query is never stored).
No personal data: the phones are the demo's fictitious characters.
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("voice_diag.py: escribe en la base compartida con la demo desplegada (o la reinicia). No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
import json
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

T0 = time.time()


def now():
    return round(time.time() - T0, 2)


class Recorder:
    def __init__(self):
        self.events = []

    def add(self, who, kind, **data):
        self.events.append({"t": now(), "who": who, "kind": kind, **data})

    def watch(self, page, who):
        def on_console(msg):
            text = msg.text
            if text.startswith("[voz") or msg.type in ("error", "warning"):
                self.add(who, f"console.{msg.type}", text=text[:300])

        page.on("console", on_console)
        page.on("pageerror", lambda e: self.add(who, "pageerror", text=str(e)[:300]))

        async def on_response(resp):
            u = urlparse(resp.url)
            if u.path.startswith("/api/voice/") and not u.path.endswith("/diag"):
                body = ""
                try:
                    j = await resp.json()
                    body = json.dumps({k: (v if k != "session" else bool(v)) for k, v in j.items()}, ensure_ascii=False)[:200]
                except Exception:
                    pass
                self.add(who, "http", path=u.path, status=resp.status, body=body)

        page.on("response", lambda r: asyncio.ensure_future(on_response(r)))

        def on_ws(ws):
            host = urlparse(ws.url).netloc
            if "elevenlabs" not in host:
                return
            self.add(who, "ws.open", host=host)
            ws.on("close", lambda _: self.add(who, "ws.close", host=host))
            ws.on("socketerror", lambda e: self.add(who, "ws.error", host=host, text=str(e)[:200]))

        page.on("websocket", on_ws)


async def status_line(page):
    loc = page.locator('[role=dialog] [role=status], [role=dialog] p[aria-live]')
    try:
        if await loc.count():
            return (await loc.first.inner_text(timeout=1000)).strip()
    except Exception:
        pass
    return None


class Demo:
    def __init__(self, browser, base, pin, rec):
        self.browser, self.base, self.pin, self.rec = browser, base, pin, rec

    async def context(self):
        ctx = await self.browser.new_context(base_url=self.base, permissions=["microphone"], viewport={"width": 400, "height": 820})
        return ctx

    async def staff(self):
        ctx = await self.context()
        r = await ctx.request.post("/api/access", data={"pin": self.pin, "role": "admision"})
        assert r.ok, f"PIN local rechazado ({r.status})"
        return ctx

    async def phones(self, staff):
        r = await staff.request.get("/api/staff/data?view=live")
        return {p["token"]: p["id"] for p in (await r.json())["phones"]}

    async def calls(self, staff):
        r = await staff.request.get("/api/staff/data?view=live")
        return [{k: c.get(k) for k in ("id", "status", "purpose", "provider")} for c in (await r.json())["calls"]]

    async def voice(self, staff):
        r = await staff.request.get("/api/staff/data?view=voice")
        if not r.ok:
            return {"error": r.status}
        d = await r.json()
        return {"activas": d.get("active"), "en_fila": d.get("queued"), "sesiones": [{k: x.get(k) for k in ("id", "call_id", "state", "ended_reason")} for x in d.get("sessions", [])[:6]]}

    async def test_call(self, staff, patient_id):
        r = await staff.request.post("/api/staff", data={"action": "test_call", "patientId": patient_id})
        d = await r.json()
        self.rec.add("staff", "test_call", patient=patient_id, status=r.status, callId=d.get("callId"))
        return d.get("callId")

    async def end_all(self, staff):
        for c in await self.calls(staff):
            if c["status"] in ("sonando", "en_curso"):
                await staff.request.post("/api/staff", data={"action": "end_call", "callId": c["id"]})

    async def open_phone(self, ctx, token, who):
        page = await ctx.new_page()
        self.rec.watch(page, who)
        await page.goto(f"/t/{token}")
        btn = page.get_by_role("button", name="Activar sonido y llamadas")
        try:
            await btn.click(timeout=8000)
        except Exception:
            pass
        return page

    async def answer(self, page, who, dbl=False):
        btn = page.get_by_role("button", name="Contestar")
        await btn.wait_for(timeout=20000)
        self.rec.add(who, "ui", action="contestar" + (" (doble)" if dbl else ""))
        if dbl:
            await btn.dblclick()
        else:
            await btn.click()

    async def hang(self, page, who):
        btn = page.get_by_role("button", name="Colgar")
        try:
            await btn.click(timeout=3000)
            self.rec.add(who, "ui", action="colgar")
        except Exception as e:
            self.rec.add(who, "ui", action="colgar (no disponible)", text=str(e)[:80])

    async def sample(self, pages, seconds, every=3):
        end = time.time() + seconds
        while time.time() < end:
            for who, page in pages.items():
                try:
                    self.rec.add(who, "pantalla", line=await status_line(page))
                except Exception:
                    pass
            await asyncio.sleep(every)


# --------------------------------------------------------------------------- scenarios


async def scenario_a(d: Demo, staff, ids):
    """A. Cuatro llamadas de voz simultáneas en contextos distintos (3 teléfonos + 1 registro por /pedir-cita)."""
    tokens = ["rosa", "carmen", "julio"]
    ctxs = [await d.context() for _ in tokens]
    pages = {}
    for ctx, tok in zip(ctxs, tokens):
        pages[tok] = await d.open_phone(ctx, tok, tok)
    reg_ctx = await d.context()
    reg = await open_pedir(d, reg_ctx, "registro")
    await asyncio.gather(*[d.test_call(staff, ids[t]) for t in tokens])
    await asyncio.gather(*[d.answer(pages[t], t) for t in tokens], start_registration(d, reg, "registro"))
    await d.sample(pages, 25)
    for t in tokens:
        await d.hang(pages[t], t)
    await hang_registration(d, reg, "registro")
    await asyncio.sleep(4)
    for c in ctxs + [reg_ctx]:
        await c.close()


async def start_registration(d, page, who, dbl=False):
    await page.get_by_role("button", name="Hablar con el asistente").first.click(timeout=10000)
    btn = page.get_by_role("button", name="Empezar la llamada")
    await btn.wait_for(timeout=10000)
    d.rec.add(who, "ui", action="empezar" + (" (doble)" if dbl else ""))
    if dbl:
        await btn.dblclick()
    else:
        await btn.click()


async def open_pedir(d, ctx, who, wait=True):
    """Opens /pedir-cita and (by default) waits until the anonymous chat session exists, as a person would."""
    page = await ctx.new_page()
    d.rec.watch(page, who)
    t = time.time()
    await page.goto("/pedir-cita")
    if wait:
        await page.get_by_text("Usted aparece como").first.wait_for(timeout=20000)
        d.rec.add(who, "sesión_lista", ms=round((time.time() - t) * 1000))
    return page


async def hang_registration(d, page, who):
    try:
        await page.get_by_role("button", name="Colgar").click(timeout=3000)
        d.rec.add(who, "ui", action="colgar")
    except Exception:
        d.rec.add(who, "ui", action="colgar (no disponible)")


async def scenario_b(d: Demo, staff, ids):
    """B. Dos pestañas del mismo navegador con la misma sesión (/t/rosa dos veces): ambas contestan."""
    ctx = await d.context()
    p1 = await d.open_phone(ctx, "rosa", "rosa-pestaña1")
    p2 = await d.open_phone(ctx, "rosa", "rosa-pestaña2")
    await d.test_call(staff, ids["rosa"])
    await d.answer(p1, "rosa-pestaña1")
    await asyncio.sleep(1.5)
    await d.answer(p2, "rosa-pestaña2")
    await d.sample({"rosa-pestaña1": p1, "rosa-pestaña2": p2}, 15)
    await d.hang(p1, "rosa-pestaña1")
    await d.sample({"rosa-pestaña1": p1, "rosa-pestaña2": p2}, 10)
    await d.hang(p2, "rosa-pestaña2")
    await asyncio.sleep(3)
    await ctx.close()


async def scenario_c(d: Demo, staff, ids):
    """C. Voz y chat al mismo tiempo en una misma sesión de /pedir-cita (dos pestañas, misma cookie)."""
    ctx = await d.context()
    chat = await open_pedir(d, ctx, "chat")
    await chat.get_by_role("button", name="Chatear con el asistente").first.click(timeout=10000)
    voz = await open_pedir(d, ctx, "voz")
    await start_registration(d, voz, "voz")
    await asyncio.sleep(6)
    box = chat.get_by_role("textbox").first
    for text in ["ACEPTO", "1"]:
        try:
            await box.fill(text, timeout=5000)
            await box.press("Enter")
            d.rec.add("chat", "ui", action=f"escribe {text}")
        except Exception as e:
            d.rec.add("chat", "ui", action="no pudo escribir", text=str(e)[:80])
        await asyncio.sleep(3)
    await asyncio.sleep(10)
    await hang_registration(d, voz, "voz")
    await asyncio.sleep(3)
    await ctx.close()


async def scenario_d(d: Demo, staff, ids):
    """D. Iniciar, colgar y volver a iniciar rápidamente (teléfono y registro)."""
    ctx = await d.context()
    p = await d.open_phone(ctx, "valeria", "valeria")
    for i in range(2):
        await d.test_call(staff, ids["valeria"])
        await d.answer(p, "valeria")
        await asyncio.sleep(4)
        await d.hang(p, "valeria")
        await asyncio.sleep(1)
    await d.sample({"valeria": p}, 6)
    reg_ctx = await d.context()
    reg = await open_pedir(d, reg_ctx, "registro")
    await start_registration(d, reg, "registro")
    await asyncio.sleep(4)
    await hang_registration(d, reg, "registro")
    await asyncio.sleep(1)
    try:
        await reg.get_by_role("button", name="Ver mi conversación").click(timeout=4000)
        await reg.get_by_role("button", name="Volver").click(timeout=4000)
        await start_registration(d, reg, "registro")
        await asyncio.sleep(8)
        await hang_registration(d, reg, "registro")
    except Exception as e:
        d.rec.add("registro", "ui", action="reinicio no disponible", text=str(e)[:80])
    await asyncio.sleep(3)
    await ctx.close()
    await reg_ctx.close()


async def scenario_e(d: Demo, staff, ids):
    """E. Doble toque en Contestar y en Empezar la llamada."""
    ctx = await d.context()
    p = await d.open_phone(ctx, "carmen", "carmen")
    await d.test_call(staff, ids["carmen"])
    await d.answer(p, "carmen", dbl=True)
    await d.sample({"carmen": p}, 12)
    await d.hang(p, "carmen")
    reg_ctx = await d.context()
    reg = await open_pedir(d, reg_ctx, "registro")
    await start_registration(d, reg, "registro", dbl=True)
    await asyncio.sleep(12)
    await hang_registration(d, reg, "registro")
    await asyncio.sleep(3)
    await ctx.close()
    await reg_ctx.close()


async def scenario_f(d: Demo, staff, ids):
    """F. El panel /demo dispara llamadas a dos personajes a la vez (botones Probar llamada)."""
    tokens = ["rosa", "julio"]
    ctxs = {t: await d.context() for t in tokens}
    pages = {t: await d.open_phone(ctxs[t], t, t) for t in tokens}
    await asyncio.sleep(3)
    demo = await staff.new_page()
    d.rec.watch(demo, "demo")
    await demo.goto("/demo")
    names = {"rosa": "Rosa", "julio": "Julio"}
    first = demo.get_by_role("button", name="Probar llamada en el teléfono de Rosa")
    await first.wait_for(timeout=15000)
    # both characters' buttons, as fast as possible
    for t in tokens:
        try:
            await demo.get_by_role("button", name=f"Probar llamada en el teléfono de {names[t]}").first.click(timeout=4000)
            d.rec.add("demo", "ui", action=f"probar llamada {t}")
        except Exception as e:
            d.rec.add("demo", "ui", action=f"no encontró el botón de {t}", text=str(e)[:80])
    await asyncio.gather(*[d.answer(pages[t], t) for t in tokens])
    await d.sample(pages, 18)
    for t in tokens:
        await d.hang(pages[t], t)
    await asyncio.sleep(3)
    await demo.close()
    for c in ctxs.values():
        await c.close()


async def scenario_g(d: Demo, staff, ids):
    """G. Cerrar la pestaña en medio de una llamada y volver a abrirla."""
    ctx = await d.context()
    p = await d.open_phone(ctx, "rosa", "rosa")
    call_id = await d.test_call(staff, ids["rosa"])
    await d.answer(p, "rosa")
    await asyncio.sleep(10)
    await p.close(run_before_unload=True)
    d.rec.add("rosa", "ui", action="cerró la pestaña")
    await asyncio.sleep(6)
    d.rec.add("staff", "llamadas", calls=[c for c in await d.calls(staff) if c["id"] == call_id])
    p2 = await d.open_phone(ctx, "rosa", "rosa-reabierta")
    await d.sample({"rosa-reabierta": p2}, 12)
    d.rec.add("staff", "llamadas", calls=[c for c in await d.calls(staff) if c["id"] == call_id])
    await ctx.close()


async def scenario_c0(d: Demo, staff, ids):
    """C0. Tocar "Empezar la llamada" apenas carga /pedir-cita, antes de que exista la sesión de chat."""
    ctx = await d.context()
    page = await open_pedir(d, ctx, "registro", wait=False)
    await start_registration(d, page, "registro")
    await asyncio.sleep(4)
    await page.get_by_text("Usted aparece como").first.wait_for(timeout=20000)
    d.rec.add("registro", "sesión_lista_después")
    await ctx.close()


async def scenario_s(d: Demo, staff, ids):
    """S. Una sola llamada (para comparar desarrollo, con el modo estricto de React, y producción)."""
    ctx = await d.context()
    p = await d.open_phone(ctx, "rosa", "rosa")
    await d.test_call(staff, ids["rosa"])
    await d.answer(p, "rosa")
    await d.sample({"rosa": p}, 12)
    await d.hang(p, "rosa")
    await asyncio.sleep(3)
    await ctx.close()


async def scenario_h(d: Demo, staff, ids):
    """H. En plena llamada de voz la persona toca "Chat": la voz se cierra, la llamada sigue con las opciones escritas."""
    ctx = await d.context()
    p = await d.open_phone(ctx, "carmen", "carmen")
    call_id = await d.test_call(staff, ids["carmen"])
    await d.answer(p, "carmen")
    await d.sample({"carmen": p}, 8)
    await p.get_by_role("button", name="Chat").click(timeout=5000)
    d.rec.add("carmen", "ui", action="chat")
    await d.sample({"carmen": p}, 8)
    opts = await p.get_by_role("group", name="Opciones de respuesta").get_by_role("button").all_inner_texts()
    d.rec.add("carmen", "opciones", opciones=opts)
    d.rec.add("staff", "llamadas", calls=[c for c in await d.calls(staff) if c["id"] == call_id])
    d.rec.add("staff", "voz", **(await d.voice(staff)))
    await d.hang(p, "carmen")
    await asyncio.sleep(3)
    await ctx.close()


SCENARIOS = {"H": scenario_h, "S": scenario_s, "C0": scenario_c0, "A": scenario_a, "B": scenario_b, "C": scenario_c, "D": scenario_d, "E": scenario_e, "F": scenario_f, "G": scenario_g}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", default="A,B,C,D,E,F,G")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                f"--use-file-for-fake-audio-capture={a.audio}",
                "--autoplay-policy=no-user-gesture-required",
            ]
        )
        for key in a.only.split(","):
            rec = Recorder()
            d = Demo(browser, a.base, a.pin, rec)
            staff = await d.staff()
            ids = await d.phones(staff)
            await d.end_all(staff)
            rec.add("staff", "inicio", scenario=key)
            try:
                await SCENARIOS[key](d, staff, ids)
                rec.add("staff", "fin", scenario=key)
            except Exception as e:
                rec.add("harness", "excepción", text=str(e)[:300])
            rec.add("staff", "llamadas_al_final", calls=(await d.calls(staff))[:12])
            rec.add("staff", "voz_al_final", **(await d.voice(staff)))
            await d.end_all(staff)
            await staff.close()
            (out / f"{key}.json").write_text(json.dumps(rec.events, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f"escenario {key}: {len(rec.events)} eventos -> {out / (key + '.json')}", flush=True)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
