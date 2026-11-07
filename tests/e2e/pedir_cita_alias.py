"""/pedir-cita on the real alias (incident 7/11 08:42 UTC: reload/expired loop). Mobile emulation, CPU 4x, 4G.
Checks, per scenario: no "La conversación se cerró o venció", the page loads once (no reload), at most one
POST /api/chat/session per page load, no vercel.live script, and (full flow) the chat registration returns S-XXXX.
Creates chat sessions and one request (fictitious name) in the shared database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/pedir_cita_alias.py [--base https://asistia-e5.vercel.app]
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("pedir_cita_alias.py: escribe en la base compartida con la demo desplegada. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
import re
import time
import urllib.request

from playwright.async_api import async_playwright

FAIL = []


def check(ok, msg):
    print(("ok   " if ok else "FALLA"), msg, flush=True)
    if not ok:
        FAIL.append(msg)


async def throttled(pw, b):
    ctx = await b.new_context(**pw.devices["Pixel 7"])
    page = await ctx.new_page()
    cdp = await ctx.new_cdp_session(page)
    await cdp.send("Network.enable")
    # "Fast 4G"-like: 150 ms RTT, ~9 Mbps down, ~1.5 Mbps up
    await cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 150, "downloadThroughput": 1_125_000, "uploadThroughput": 187_500})
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    return ctx, page


def watch(page, stats):
    # real reloads only: Next.js also fires a same-document "framenavigated" (history update) without reloading
    page.on("load", lambda: stats.__setitem__("nav", stats["nav"] + 1))
    page.on("request", lambda r: stats.__setitem__("session_posts", stats["session_posts"] + 1) if r.method == "POST" and r.url.endswith("/api/chat/session") else None)
    page.on("request", lambda r: stats.__setitem__("toolbar_requests", stats["toolbar_requests"] + 1) if "vercel.live" in r.url else None)
    page.on("pageerror", lambda e: stats["errors"].append(str(e)[:160]))


async def idle(page, seconds):
    seen_expired = False
    t = time.time()
    while time.time() - t < seconds:
        txt = await page.evaluate("document.body ? document.body.innerText : ''")
        seen_expired = seen_expired or ("se cerró o venció" in txt)
        await asyncio.sleep(0.5)
    return seen_expired


async def scenario_fresh(pw, b, base):
    ctx, page = await throttled(pw, b)
    stats = {"nav": 0, "session_posts": 0, "toolbar_requests": 0, "errors": []}
    watch(page, stats)
    await page.goto(f"{base}/pedir-cita")
    expired = await idle(page, 30)
    check(not expired, "nuevo visitante: nunca aparece «La conversación se cerró o venció» en 30 s")
    check(stats["nav"] == 1, f"nuevo visitante: la página no se recarga sola (navegaciones: {stats['nav']})")
    check(stats["session_posts"] == 1, f"nuevo visitante: una sola creación de sesión (POST /api/chat/session: {stats['session_posts']})")
    check(stats["toolbar_requests"] == 0, f"sin la barra de Vercel (peticiones a vercel.live: {stats['toolbar_requests']})")
    check(not stats["errors"], f"sin errores de página {stats['errors'][:2]}")
    header = await page.evaluate("document.body.innerText")
    check("Usted aparece como" in header and "Conectando" not in header[:200], "la cabecera muestra el alias (no queda en «Conectando…»)")
    return ctx, page


def stale_cookie(base):
    """A cookie whose session no longer exists (as after "Reiniciar demo")."""
    req = urllib.request.Request(f"{base}/api/chat/session", data=b"{}", method="POST", headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        cookie = re.search(r"asistia_chat=([^;]+)", r.headers.get("Set-Cookie", "")).group(1)
    req = urllib.request.Request(f"{base}/api/chat/session", method="DELETE", headers={"Cookie": f"asistia_chat={cookie}"})
    urllib.request.urlopen(req).read()
    return cookie


async def scenario_stale(pw, b, base):
    cookie = stale_cookie(base)
    ctx, page = await throttled(pw, b)
    host = base.split("//")[1]
    await ctx.add_cookies([{"name": "asistia_chat", "value": cookie, "domain": host, "path": "/", "secure": True, "httpOnly": True, "sameSite": "Lax"}])
    stats = {"nav": 0, "session_posts": 0, "toolbar_requests": 0, "errors": []}
    watch(page, stats)
    await page.goto(f"{base}/pedir-cita")
    expired = await idle(page, 20)
    check(not expired, "cookie de una sesión borrada: se recupera sola, sin «se cerró o venció»")
    check(stats["nav"] == 1 and stats["session_posts"] <= 2, f"cookie vieja: sin recargas (navegaciones {stats['nav']}, sesiones creadas {stats['session_posts']})")
    await ctx.close()


async def scenario_registration(page):
    await page.get_by_role("button", name=re.compile("Chatear con el asistente")).first.click()
    box = page.get_by_role("textbox").first
    answers = ["ACEPTO", "1", "para mí", "Prueba Jurado Ficticio", "4", "35", "7", "2", "Manchas en la piel desde hace dos meses", "no", "1", "sí", "3", "1"]
    for text in answers:
        await box.fill(text)
        await box.press("Enter")
        await asyncio.sleep(2.2)
    body = await page.evaluate("document.body.innerText")
    code = re.search(r"S-\d{4}", body)
    check(bool(code), f"registro completo por chat: código {code.group(0) if code else 'no recibido'}")


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://asistia-e5.vercel.app")
    a = ap.parse_args()
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        ctx, page = await scenario_fresh(pw, b, a.base)
        await scenario_registration(page)
        await ctx.close()
        await scenario_stale(pw, b, a.base)
        await b.close()
    print("RESULTADO:", "todo ok" if not FAIL else f"{len(FAIL)} fallas")
    _sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
