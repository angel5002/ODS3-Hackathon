"""Production check of the simulated phone's live voice (E5). Opens the DEPLOYED /t/<token> in Chromium with a
fake microphone, rings it with a test call created in the shared database (server key read inside this
process, never printed), answers, and records whether the ElevenLabs WebSocket opens or the call falls back
to the fixed script. Writes to the shared database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/prod_phone_voice.py --audio <wav> [--base URL] [--token rosa]
"""
import argparse
import asyncio
import json
import os
import sys
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

if os.environ.get("ALLOW_DB_WRITE") != "1":
    print("prod_phone_voice: escribe en la base compartida con la demo desplegada. No se ejecuta sin ALLOW_DB_WRITE=1.")
    sys.exit(3)


def env():
    out = {}
    for line in Path(".env.local").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


E = env()


def rpc(fn, args):
    req = urllib.request.Request(
        f'{E["NEXT_PUBLIC_SUPABASE_URL"]}/rest/v1/rpc/{fn}',
        data=json.dumps(args).encode(),
        headers={"apikey": E["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f'Bearer {E["SUPABASE_SERVICE_ROLE_KEY"]}', "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        body = r.read().decode()
        return json.loads(body) if body else None


def patient_id(token):
    req = urllib.request.Request(
        f'{E["NEXT_PUBLIC_SUPABASE_URL"]}/rest/v1/patients?select=id&token=eq.{token}',
        headers={"apikey": E["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f'Bearer {E["SUPABASE_SERVICE_ROLE_KEY"]}'},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())[0]["id"]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://ods3-hackathon.vercel.app")
    ap.add_argument("--token", default="rosa")
    ap.add_argument("--audio", required=True)
    ap.add_argument("--seconds", type=int, default=15)
    a = ap.parse_args()
    t0 = time.time()
    log = lambda *x: print(f"[{time.time() - t0:5.1f}s]", *x, flush=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={a.audio}"])
        ctx = await b.new_context(base_url=a.base, permissions=["microphone"], viewport={"width": 400, "height": 820})
        page = await ctx.new_page()
        page.on("console", lambda m: log("consola", m.type, m.text[:200]) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: log("error de página", str(e)[:200]))

        async def on_resp(r):
            p = urlparse(r.url).path
            if p.startswith("/api/voice/"):
                try:
                    j = await r.json()
                    j = {k: (bool(v) if k == "session" else v) for k, v in j.items()}
                except Exception:
                    j = {}
                log("http", p, r.status, json.dumps(j, ensure_ascii=False)[:160])

        page.on("response", lambda r: asyncio.ensure_future(on_resp(r)))

        def on_ws(ws):
            host = urlparse(ws.url).netloc
            if "elevenlabs" in host:
                log("websocket abierto", host)
                ws.on("close", lambda _: log("websocket cerrado", host))

        page.on("websocket", on_ws)
        await page.goto(f"/t/{a.token}")
        try:
            await page.get_by_role("button", name="Activar sonido y llamadas").click(timeout=8000)
            log("sonido activado")
        except Exception:
            log("sin botón de sonido")
        call_id = rpc("start_test_call", {"p_session": None, "p_patient": patient_id(a.token)})
        log("llamada de prueba", call_id)
        try:
            await page.get_by_role("button", name="Contestar").click(timeout=20000)
            log("contestó")
            end = time.time() + a.seconds
            last = None
            while time.time() < end:
                loc = page.locator('[role=dialog] p[aria-live]')
                line = (await loc.first.inner_text()).strip() if await loc.count() else None
                toast = page.locator("[data-sonner-toast]")
                tt = (await toast.first.inner_text()).replace("\n", " ") if await toast.count() else None
                if (line, tt) != last:
                    log("pantalla:", line, "| aviso:", tt)
                    last = (line, tt)
                await asyncio.sleep(1)
            await page.screenshot(path="capturas/e5/produccion-telefono-llamada.png")
            await page.get_by_role("button", name="Colgar").click(timeout=3000)
            log("colgó")
            await asyncio.sleep(3)
        finally:
            rpc("update_call", {"p_call": call_id, "p_status": "finalizada", "p_result": "Prueba de producción (E5)"})
            log("llamada", call_id, "finalizada")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
