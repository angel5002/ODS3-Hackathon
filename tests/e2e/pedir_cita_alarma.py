"""/pedir-cita alarm signs and closings on the deployed alias (user's phone test 7/11 10:35 UTC, S-0431).
Mobile emulation (Pixel 7), CPU 4x, 4G. Three people register by chat:
  1. no alarm: gets ONE general question (no long list), answers "No", and the closing says the code, who reviews it,
     how we will reach them and what to do if they get worse;
  2. alarm: answers "Sí" → "¿Qué siente?" → is referred; the emergency instruction appears EXACTLY ONCE (the S-0431
     duplicate) and there is a "Hablar ahora con una persona" button;
  3. pregnancy mentioned in the reason: the pregnancy question appears; without that context it never does.
Creates chat sessions and requests (fictitious names) in the shared database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/pedir_cita_alarma.py [--base https://asistia-e5.vercel.app]
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("pedir_cita_alarma.py: escribe en la base compartida. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
import re

from playwright.async_api import async_playwright

FAIL = []
LONG_LIST = ["debilidad repentina", "fiebre en un bebé", "sangrado abundante"]
GENERAL = "no puede esperar"
PREGNANCY_Q = "dolor fuerte en el embarazo"
REFERRAL = "no espere una cita"


def check(ok, msg):
    print(("ok   " if ok else "FALLA"), msg, flush=True)
    if not ok:
        FAIL.append(msg)


async def throttled(pw, b):
    ctx = await b.new_context(**pw.devices["Pixel 7"])
    page = await ctx.new_page()
    cdp = await ctx.new_cdp_session(page)
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1_125_000, "uploadThroughput": 187_500})
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    return ctx, page


async def body(page):
    return await page.evaluate("document.body.innerText")


async def send(page, text):
    box = page.get_by_role("textbox").first
    await box.fill(text)
    await box.press("Enter")
    await asyncio.sleep(2.4)


async def converse(page, name, reason, on_alarm):
    """Registration by chat; `on_alarm(page)` answers the general alarm question. Returns the transcript."""
    start = page.get_by_role("button", name=re.compile("Chatear con el asistente"))
    if await start.count():  # ?canal=chat opens the chat directly
        await start.first.click()
    await page.get_by_role("textbox").first.wait_for(timeout=30000)
    await asyncio.sleep(1.5)
    queue = ["ACEPTO", "1", "para mí", name, "4", "35", "7", "2", reason]
    after = ["1", "sí", "3", "1"]
    seen_general = seen_preg = False
    for _ in range(26):
        txt = await body(page)
        tail = txt[-500:]
        if GENERAL in tail and not seen_general:
            seen_general = True
            await on_alarm(page)
            continue
        if PREGNANCY_Q in tail and not seen_preg:
            seen_preg = True
            await send(page, "No")
            continue
        if re.search(r"S-\d{4}", tail) or REFERRAL in tail:
            break
        if queue:
            await send(page, queue.pop(0))
        elif after:
            await send(page, after.pop(0))
        else:
            break
    await asyncio.sleep(3)
    return await body(page), seen_general, seen_preg


async def no_alarm(pw, b, base):
    ctx, page = await throttled(pw, b)
    await page.goto(f"{base}/pedir-cita?canal=chat")
    await asyncio.sleep(3)

    async def answer(p):
        await send(p, "No")

    txt, general, preg = await converse(page, "Prueba Alarma Ninguna", "Manchas en la piel desde hace dos meses", answer)
    check(general, "sin alarma: recibe la pregunta general («algo que no puede esperar»)")
    check(not any(s in txt for s in LONG_LIST), "sin alarma: nunca recibe la lista larga de signos")
    check(not preg, "sin contexto de embarazo: no aparece la pregunta de embarazo")
    code = re.search(r"S-\d{4}", txt)
    closing = txt[txt.rfind(code.group(0)) - 300:] if code else ""
    check(bool(code), f"cierre con código ({code.group(0) if code else 'sin código'})")
    check("106" in closing or "emergencia" in closing, "el cierre dice qué hacer si empeora")
    check(re.search(r"chat|llam|mensaje", closing) is not None, "el cierre dice por dónde le avisaremos")
    alias = page.get_by_text("Usted aparece como")
    box = await alias.first.bounding_box() if await alias.count() else None
    check(box is None or box["width"] <= 2, "no se ve «Usted aparece como…» (solo para lectores de pantalla)")
    await ctx.close()


async def alarm(pw, b, base):
    ctx, page = await throttled(pw, b)
    await page.goto(f"{base}/pedir-cita?canal=chat")
    await asyncio.sleep(3)

    async def answer(p):
        await send(p, "Sí")
        t = await body(p)
        check("Qué siente" in t[-400:], "con alarma: pregunta brevemente qué siente")
        await send(p, "Me falta el aire")

    txt, general, _ = await converse(page, "Prueba Alarma Positiva", "Dolor de cabeza y no puedo dormir", answer)
    check(general, "con alarma: recibe la pregunta general")
    n = txt.count(REFERRAL)
    check(n == 1, f"la indicación de emergencia aparece una sola vez (aparece {n})")
    check("106" in txt, "indica llamar al 106")
    btn = page.get_by_role("button", name=re.compile("Hablar ahora con una persona"))
    check(await btn.count() > 0, "botón «Hablar ahora con una persona»")
    check(not any(s in txt for s in LONG_LIST), "con alarma: tampoco recibe la lista larga")
    await ctx.close()


async def pregnancy(pw, b, base):
    ctx, page = await throttled(pw, b)
    await page.goto(f"{base}/pedir-cita?canal=chat")
    await asyncio.sleep(3)

    async def answer(p):
        await send(p, "No")

    txt, general, preg = await converse(page, "Prueba Lucero Ficticia", "Control de embarazo, tengo 20 semanas y me duele la espalda", answer)
    check(general and preg, "con embarazo en el motivo: aparece su pregunta específica")
    if not preg:
        i = txt.find("Control de embarazo"); print(txt[i - 200:i + 900])
    await ctx.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://asistia-e5.vercel.app")
    ap.add_argument("--only", choices=["no_alarm", "alarm", "pregnancy"], help="run one scenario")
    a = ap.parse_args()
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        runs = {"no_alarm": no_alarm, "alarm": alarm, "pregnancy": pregnancy}
        await asyncio.gather(*(f(pw, b, a.base) for k, f in runs.items() if not a.only or a.only == k))
        await b.close()
    print("RESULTADO:", "todo ok" if not FAIL else f"{len(FAIL)} fallas")
    _sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
