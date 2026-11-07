"""Final screenshots (E5) at 360x800 and 1280x800: /pedir-cita, the chat, the simulated phone, an active voice call and
/demo. Runs against a LOCAL server with the local test PIN. Creates test calls and a chat session in the shared
database: requires ALLOW_DB_WRITE=1.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/final_capturas.py --pin <local test PIN> --audio <wav> --out capturas/e5/final
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("final_capturas.py: escribe en la base compartida con la demo desplegada. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

SIZES = {"360": {"width": 360, "height": 800}, "1280": {"width": 1280, "height": 800}}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={a.audio}"])
        staff = await b.new_context(base_url=a.base)
        assert (await staff.request.post("/api/access", data={"pin": a.pin, "role": "admision"})).ok
        phones = {p["token"]: p["id"] for p in (await (await staff.request.get("/api/staff/data?view=live")).json())["phones"]}
        for name, vp in SIZES.items():
            ctx = await b.new_context(base_url=a.base, viewport=vp, permissions=["microphone"], device_scale_factor=2 if name == "360" else 1)
            page = await ctx.new_page()
            # /pedir-cita home and chat
            await page.goto("/pedir-cita")
            await page.get_by_text("Usted aparece como").first.wait_for(timeout=20000)
            await asyncio.sleep(1.2)
            await page.screenshot(path=str(out / f"pedir-cita-{name}.png"))
            await page.get_by_role("button", name="Chatear con el asistente").first.click()
            box = page.get_by_role("textbox").first
            await box.fill("ACEPTO")
            await box.press("Enter")
            await asyncio.sleep(3)
            await page.screenshot(path=str(out / f"chat-{name}.png"))
            # simulated phone, then an active voice call on it
            ph = await ctx.new_page()
            await ph.goto("/t/rosa")
            try:
                await ph.get_by_role("button", name="Activar sonido y llamadas").click(timeout=6000)
            except Exception:
                pass
            await asyncio.sleep(1.5)
            await ph.screenshot(path=str(out / f"telefono-{name}.png"))
            r = await staff.request.post("/api/staff", data={"action": "test_call", "patientId": phones["rosa"]})
            call_id = (await r.json())["callId"]
            await ph.get_by_role("button", name="Contestar").click(timeout=20000)
            await asyncio.sleep(7)
            await ph.screenshot(path=str(out / f"llamada-activa-{name}.png"))
            try:
                await ph.get_by_role("button", name="Colgar").click(timeout=3000)
            except Exception:
                await staff.request.post("/api/staff", data={"action": "end_call", "callId": call_id})
            await asyncio.sleep(3)
            # /demo (staff)
            await ctx.close()
            sctx = await b.new_context(base_url=a.base, viewport=vp, device_scale_factor=2 if name == "360" else 1)
            assert (await sctx.request.post("/api/access", data={"pin": a.pin, "role": "admision"})).ok
            d = await sctx.new_page()
            await d.goto("/demo")
            await asyncio.sleep(4)
            await d.screenshot(path=str(out / f"demo-{name}.png"), full_page=True)
            await sctx.close()
        await b.close()
    print("listo", sorted(p.name for p in out.glob("*.png")))


if __name__ == "__main__":
    asyncio.run(main())
