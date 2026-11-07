"""Scene playback check (pitch v7 scenes 1 and 2, track C) on /panel/escenas, plus the same scenes inside /demo's
presentation mode. Guarded: each step is logged to voice_events as a scene (a write to the shared DB), so it refuses
and exits 3 without ALLOW_DB_WRITE=1. It never resets the demo and never creates calls.

  - scene 1: plays IN ORDER with the presenter keys (→ / Space); the two AI lines play their audio inside the call
    screen (CallView) and the next key is pressed when the audio ENDS (the real length, nothing sped up); the live
    lines (narrator, Tito) are waited for the time it takes to say them (~2.6 words/s);
  - scene 2: Space starts the chat, then it advances by itself every 2.4 s (1.2 s for the tap); the doctor summary
    fills in sync (Motivo, Ibuprofeno confirmed, negations verified) and the arrival window appears at the end;
  - every step reached the staff route /api/staff/scene-event (204) and none of them shows in the voice view;
  - durations are measured and compared with the script (~35 s each); no console errors.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/escenas.py --base http://localhost:3160 --pin <PIN> [--shots dir]
Exit 0 when every check passes, 1 otherwise, 3 without ALLOW_DB_WRITE=1.
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

WPS = 2.6  # words per second of a calm presenter (same as src/lib/demo/scenes.ts spokenMs)
SCENE1 = [  # (id, who, text) in the script's order
    ("n1", "narrador", "Él es Tito. Tiene 62 años y su médico le pidió una consulta de oncología cuanto antes."),
    ("t1", "persona", "¿Cinco semanas? ¡Me dieron cita para dentro de cinco semanas!"),
    ("n2", "narrador", "Sin AsistIA, Tito espera. Y en cáncer, cada semana cuenta. Pero hoy, una paciente avisó que no podrá ir a su cita."),
    ("s1", "pantalla", "Suena el celular de Tito."),
    ("ia1", "ia", None),
    ("t2", "persona", "¡Sí, sí lo quiero!"),
    ("ia2", "ia", None),
    ("n3", "narrador", "Tito no usa WhatsApp, por eso AsistIA lo llamó. Y el cupo le llegó porque el personal lo priorizó por su condición clínica."),
]
SCENE2_N2 = "El médico recibe este resumen antes de verlo, marcado como ‘referido por el paciente’. No diagnostica: si Tito hubiera tenido fiebre, lo derivaba a emergencia."
SCENE2_N1 = "Tito ya está en tratamiento. Hoy le duele la rodilla y reservó en una clínica."


def say_s(text):
    return len(text.split()) / WPS


VIDEO = None  # folder for a video of the playback (--video)


async def login(browser, base, pin, w=1600, h=900):
    extra = {"record_video_dir": VIDEO, "record_video_size": {"width": w, "height": h}} if VIDEO else {}
    ctx = await browser.new_context(base_url=base, viewport={"width": w, "height": h}, **extra)
    r = await ctx.request.post("/api/access", data={"pin": pin, "role": "admision"})
    return ctx if r.ok else None


async def step_of(page):
    return await page.locator("[data-scene]").get_attribute("data-step")


async def wait_speaking(page, value, timeout):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if await page.locator(f"[data-scene][data-speaking='{value}']").count():
            return True
        await asyncio.sleep(0.05)
    return False


async def scene1(page, fails, shots):
    order, audio = [], {}
    t0 = time.monotonic()
    for n, (lid, who, text) in enumerate(SCENE1):
        if n:
            await page.keyboard.press("ArrowRight" if n % 2 else " ")
            await asyncio.sleep(0.15)
        cur = await step_of(page)
        order.append(cur)
        if cur != lid:
            fails.append(f"escena 1: esperaba «{lid}», hay «{cur}»")
        if who == "ia":
            # the wave follows this audio: speaking goes 1 while it plays, 0 when it ends
            started = await wait_speaking(page, "1", 5)
            ts = time.monotonic()
            if not started:
                fails.append(f"escena 1: el audio de «{lid}» no empezó")
            elif not await wait_speaking(page, "0", 20):
                fails.append(f"escena 1: el audio de «{lid}» no terminó")
            audio[lid] = time.monotonic() - ts
            if lid == "ia1":
                if not await page.locator("[role=dialog][aria-label='Llamada del asistente automatizado']").count():
                    fails.append("escena 1: la línea de la IA no está dentro de la pantalla de llamada")
                if shots:
                    await page.screenshot(path=str(Path(shots) / "escena1-llamada.png"))
        elif who == "pantalla":
            await asyncio.sleep(2.0)
        else:
            await asyncio.sleep(say_s(text))
    total = time.monotonic() - t0
    if shots:
        await page.screenshot(path=str(Path(shots) / "escena1-fin.png"))
    # one more → at the end moves to scene 2 (as /demo's presentation does)
    await page.keyboard.press("ArrowRight")
    return total, audio, order


async def scene2(page, fails, shots):
    await page.locator("[data-scene=escena2]").wait_for(timeout=5000)
    t0 = time.monotonic()
    await asyncio.sleep(say_s(SCENE2_N1))
    await page.keyboard.press(" ")  # the presenter starts the chat
    chat_t0 = time.monotonic()
    seen = []
    while time.monotonic() - chat_t0 < 40:
        cur = await step_of(page)
        if not seen or seen[-1] != cur:
            seen.append(cur)
        if cur == "ia5":
            break
        await asyncio.sleep(0.05)
    chat = time.monotonic() - chat_t0
    expected = ["ia1", "t1", "ia2", "t2", "ia3", "t3", "ia4", "t4", "ia5"]
    if seen != expected:
        fails.append(f"escena 2: orden del chat {seen} != {expected}")
    body = await page.locator("[data-scene=escena2]").inner_text()
    for must in ["Referido por el paciente", "«Me duele la rodilla derecha»", "desde hace una semana", "Ibuprofeno", "Confirmado por el paciente",
                 "Ninguna · negación verificada", "negación verificada (pregunta directa)", "10:20", "10:35", "Otros signos de alarma: no evaluado"]:
        if must not in body:
            fails.append(f"escena 2: falta «{must}» en el resumen")
    for never in ["diagnóstico:", "Diagnóstico:", "radiograf", "resonancia"]:
        if never in body:
            fails.append(f"escena 2: el resumen contiene «{never}»")
    if shots:
        await page.screenshot(path=str(Path(shots) / "escena2-fin.png"))
    await asyncio.sleep(say_s(SCENE2_N2))
    await page.keyboard.press(" ")
    if await step_of(page) != "n2":
        fails.append("escena 2: el narrador final no siguió al chat")
    return time.monotonic() - t0, chat


async def presentation(browser, base, pin, fails, shots):
    """the same scenes inside /demo's presentation mode: Space drives them (no audio wait here)"""
    ctx = await login(browser, base, pin, 1920, 1080)
    page = await ctx.new_page()
    await page.goto("/demo?modo=presentar")
    await page.locator("[data-moment=escena1]").wait_for(timeout=60000)
    await page.keyboard.press("1")
    await page.locator("[data-moment=escena1]").wait_for(timeout=5000)
    for _ in range(4):
        await page.keyboard.press(" ")
        await asyncio.sleep(0.3)
    if not await page.locator("[data-moment=escena1] [role=dialog]").count():
        fails.append("presentación: la escena 1 no muestra la pantalla de llamada")
    if shots:
        await asyncio.sleep(1.5)
        await page.screenshot(path=str(Path(shots) / "presentar-escena1.png"))
    await page.keyboard.press("2")
    await page.locator("[data-moment=escena2]").wait_for(timeout=5000)
    await page.keyboard.press(" ")
    await asyncio.sleep(24)
    txt = await page.locator("[data-moment=escena2]").inner_text()
    for must in ["Ibuprofeno", "negación verificada", "10:20 a 10:35"]:
        if must not in txt:
            fails.append(f"presentación escena 2: falta «{must}»")
    if shots:
        await page.screenshot(path=str(Path(shots) / "presentar-escena2.png"))
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3160")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--shots", default=None)
    ap.add_argument("--skip-presentation", action="store_true")
    ap.add_argument("--video", default=None, help="folder for a .webm of the scenes (Playwright record_video)")
    a = ap.parse_args()
    global VIDEO
    VIDEO = a.video
    if os.environ.get("ALLOW_DB_WRITE") != "1":
        print("escenas.py: registra cada paso en voice_events (base compartida). No se ejecuta sin ALLOW_DB_WRITE=1.")
        sys.exit(3)
    if a.shots:
        Path(a.shots).mkdir(parents=True, exist_ok=True)
    fails = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = await login(browser, a.base, a.pin)
        if not ctx:
            print("login failed")
            sys.exit(1)
        page = await ctx.new_page()
        errors, events = [], []
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("response", lambda r: "/api/staff/scene-event" in r.url and events.append(r.status))
        await page.goto("/panel/escenas")
        await page.locator("[data-scene=escena1]").wait_for(timeout=60000)
        await asyncio.sleep(1)
        t1, audio, _ = await scene1(page, fails, a.shots)
        t2, chat = await scene2(page, fails, a.shots)
        await asyncio.sleep(1)
        if not events or any(s != 204 for s in events):
            fails.append(f"registro de pasos: respuestas {events}")
        v = await ctx.request.get("/api/staff/data?view=voice")
        if v.ok and any(str(e.get("kind", "")).startswith("escena") for e in (await v.json()).get("events", [])):
            fails.append("la vista de voz muestra pasos de escena como llamadas")
        if errors:
            fails.append(f"errores de consola: {errors[:3]}")
        await ctx.close()
        if not a.skip_presentation:
            await presentation(browser, a.base, a.pin, fails, a.shots)
        await browser.close()
    print(f"escena 1: {t1:.1f} s (guion ~35 s) · audio IA {', '.join(f'{k} {v:.1f} s' for k, v in audio.items())}")
    print(f"escena 2: {t2:.1f} s (guion ~35 s) · chat {chat:.1f} s (guion: termina a los 26 s) · {len(events)} pasos registrados")
    for f in fails:
        print(" -", f)
    print("Todo en orden." if not fails else f"{len(fails)} problema(s).")
    sys.exit(1 if fails else 0)


asyncio.run(main())
