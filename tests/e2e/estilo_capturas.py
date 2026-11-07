"""Style screenshots (E5 estilo) at 360x800 and 1280x800, read-only: no calls, no chat messages, no demo reset.

Screens: landing, /pedir-cita home, the chat (/dev/pantallas?p=chat, static props), the call screen (/dev/llamada:
entrante, activa-habla, sin_conexion), the simulated phone /t/rosa (no call) and /panel (local test PIN).
Runs against a LOCAL dev server (the /dev pages do not exist in production).

Usage: ml/.venv/Scripts/python tests/e2e/estilo_capturas.py --base http://localhost:3140 --pin <local test PIN> --prefix antes --out capturas/e5/estilo
"""
import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

SIZES = {"360": {"width": 360, "height": 800}, "1280": {"width": 1280, "height": 800}}
PUBLIC = [
    ("landing", "/", 2.5),
    ("pedir-cita", "/pedir-cita", 4),
    ("chat", "/dev/pantallas?p=chat", 2),
    ("llamada-entrante", "/dev/llamada?estado=entrante&panel=0", 2.5),
    ("llamada-activa-habla", "/dev/llamada?estado=activa-habla&panel=0", 2.5),
    ("llamada-sin_conexion", "/dev/llamada?estado=sin_conexion&panel=0", 2),
    ("telefono", "/t/rosa", 4),
]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3140")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for size, vp in SIZES.items():
            scale = 2 if size == "360" else 1
            ctx = await b.new_context(base_url=a.base, viewport=vp, device_scale_factor=scale)
            page = await ctx.new_page()
            for name, url, wait in PUBLIC:
                await page.goto(url, wait_until="domcontentloaded")
                await asyncio.sleep(wait)
                await page.screenshot(path=str(out / f"{a.prefix}-{name}-{size}.png"))
            await ctx.close()
            sctx = await b.new_context(base_url=a.base, viewport=vp, device_scale_factor=scale)
            assert (await sctx.request.post("/api/access", data={"pin": a.pin, "role": "admision"})).ok
            p = await sctx.new_page()
            await p.goto("/panel", wait_until="domcontentloaded")
            await asyncio.sleep(5)
            await p.screenshot(path=str(out / f"{a.prefix}-panel-{size}.png"))
            await sctx.close()
        await b.close()
    print("listo", sorted(p.name for p in out.glob(f"{a.prefix}-*.png")))


if __name__ == "__main__":
    asyncio.run(main())
