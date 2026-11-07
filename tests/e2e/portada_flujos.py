"""Public front page flows on a deployed URL, on an emulated phone (Pixel 7, CPU 4x) and on a desktop (1440 px):
  1. the front page loads with no POST and no cookie (it writes nothing);
  2. front page → "Vea cómo funciona (1 min)" → the player plays → close;
  3. front page → "Pedir una cita" → chat opens with the assistant's first message;
  4. front page → "Pedir una cita" → voice: the call connects (fake microphone) → hang up.
Steps 3 and 4 create a chat session and a test call in the shared database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/portada_flujos.py [--base https://asistia.vercel.app] [--shots dir]
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("portada_flujos.py: el chat y la llamada escriben en la base compartida. Requiere ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
import re
from pathlib import Path

from playwright.async_api import async_playwright, expect

FAIL = []


def check(ok, msg):
    print(("ok   " if ok else "FALLA"), msg, flush=True)
    if not ok:
        FAIL.append(msg)


async def run(pw, b, base, name, ctx_args, shots):
    ctx = await b.new_context(permissions=["microphone"], **ctx_args)
    page = await ctx.new_page()
    if name == "celular":
        cdp = await ctx.new_cdp_session(page)
        await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    posts, errors = [], []
    page.on("request", lambda r: r.method == "POST" and posts.append(r.url))
    page.on("pageerror", lambda e: errors.append(str(e)[:160]))

    await page.goto(f"{base}/", wait_until="networkidle")
    cookies = await ctx.cookies()
    check(not posts and not cookies, f"{name}: la portada no escribe nada al cargar (POST {len(posts)}, cookies {len(cookies)})")
    await expect(page.get_by_role("link", name="Pedir una cita")).to_be_visible()
    await expect(page.get_by_role("link", name="Acceso del personal")).to_be_visible()
    if shots:
        await page.screenshot(path=str(Path(shots) / f"portada-{name}.png"))

    # video
    await page.get_by_role("button", name="Vea cómo funciona (1 min)").click()
    dlg = page.get_by_role("dialog", name="Cómo funciona AsistIA")
    await expect(dlg).to_be_visible(timeout=60000)
    await asyncio.sleep(4)
    check(await page.get_by_role("button", name="Pausar").count() == 1, f"{name}: el video se reproduce")
    await page.get_by_role("button", name="Cerrar").click()
    check(await dlg.count() == 0, f"{name}: el video se cierra")

    # chat
    await page.get_by_role("link", name="Pedir una cita").click()
    await page.wait_for_url(re.compile(r"/pedir-cita"))
    await page.get_by_role("button", name=re.compile("Chatear con el asistente")).first.click()
    await expect(page.get_by_role("textbox").first).to_be_visible(timeout=60000)
    await expect(page.get_by_text(re.compile("ACEPTO|nombre ficticio", re.I)).first).to_be_visible(timeout=60000)
    check(True, f"{name}: Pedir una cita → chat con el primer mensaje del asistente")

    # voice
    await page.goto(f"{base}/pedir-cita")
    await page.get_by_role("button", name="Hablar con el asistente").first.click()
    start = page.get_by_role("button", name="Empezar la llamada")
    await expect(start).to_be_enabled(timeout=60000)
    await start.click()
    live = page.get_by_text(re.compile(r"^(Escuchando|Hablando|Su turno)$"))
    try:
        await expect(live.first).to_be_visible(timeout=45000)
        check(True, f"{name}: Pedir una cita → la llamada de voz conecta")
    except Exception:
        body = (await page.evaluate("document.body.innerText"))[:300]
        check(False, f"{name}: la llamada no conectó ({body!r})")
    if shots:
        await page.screenshot(path=str(Path(shots) / f"llamada-{name}.png"))
    hang = page.get_by_role("button", name="Colgar")
    if await hang.count():
        await hang.first.click()
        await asyncio.sleep(2)
    check(not errors, f"{name}: sin errores de página {errors[:2]}")
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://asistia.vercel.app")
    ap.add_argument("--shots", default=None)
    a = ap.parse_args()
    if a.shots:
        Path(a.shots).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
        await run(pw, b, a.base, "celular", dict(pw.devices["Pixel 7"]), a.shots)
        await run(pw, b, a.base, "escritorio", {"viewport": {"width": 1440, "height": 900}}, a.shots)
        await b.close()
    print("RESULTADO:", "todo ok" if not FAIL else f"{len(FAIL)} fallas")
    _sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
