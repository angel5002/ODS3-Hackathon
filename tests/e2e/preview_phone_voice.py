"""Preview check (E5) of the simulated phone's live voice on a fixed preview alias, from a clean browser.
Variant of prod_phone_voice.py: first checks that the alias opens without a Vercel login (no redirect to
vercel.com) and renders /pedir-cita, then opens the DEPLOYED /t/<token> with a fake microphone, rings it with a
test call created in the shared database (server key read inside this process, never printed), answers, and
records whether the ElevenLabs WebSocket opens or the call falls back to the fixed script. Screenshots go to
--out (a folder outside the repo). Writes to the shared database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/preview_phone_voice.py --base https://<alias>
         --audio <wav> --out <dir> [--env <path>/.env.local] [--token rosa]
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
    print("preview_phone_voice: escribe en la base compartida con la demo desplegada. No se ejecuta sin ALLOW_DB_WRITE=1.")
    sys.exit(3)

ap = argparse.ArgumentParser()
ap.add_argument("--base", required=True)
ap.add_argument("--audio", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--env", default=".env.local")
ap.add_argument("--token", default="rosa")
ap.add_argument("--seconds", type=int, default=15)
A = ap.parse_args()


def env():
    out = {}
    for line in Path(A.env).read_text(encoding="utf-8").splitlines():
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
    a = A
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    log = lambda *x: print(f"[{time.time() - t0:5.1f}s]", *x, flush=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={a.audio}"])
        # Fresh context: no cookies, so no Vercel session either.
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

        # 1. The alias opens without a Vercel login and /pedir-cita renders.
        for path in ("/", "/pedir-cita"):
            r = await page.goto(path)
            final = urlparse(page.url)
            log("abre", path, r.status if r else None, "url final", final.netloc + final.path, "redirigido" if r and r.request.redirected_from else "sin redirección")
            if "vercel.com" in final.netloc or not r or r.status != 200:
                log("FALLO: la vista previa no abre sin login")
                await b.close()
                sys.exit(1)
        await page.wait_for_load_state("networkidle")
        heads = page.locator("h1")
        log("pedir-cita h1:", (await heads.first.inner_text()).strip() if await heads.count() else None)
        await page.screenshot(path=str(out / "vista-previa-pedir-cita.png"), full_page=True)

        # 2. Live voice on the simulated phone.
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
            await page.screenshot(path=str(out / "vista-previa-telefono-llamada.png"))
            await page.get_by_role("button", name="Colgar").click(timeout=3000)
            log("colgó")
            await asyncio.sleep(3)
        finally:
            rpc("update_call", {"p_call": call_id, "p_status": "finalizada", "p_result": "Prueba de vista previa (E5)"})
            log("llamada", call_id, "finalizada")
        await b.close()


if __name__ == "__main__":
    asyncio.run(main())
