"""Screenshots of every screen of the final (pitch v7) at 360 and 1920 px, after all the tracks were merged.
Read only: opens pages and presses keys; never clicks an action that writes (the jury card is only opened, which
records a visit — so it refuses without ALLOW_DB_WRITE=1, like the other tests that touch the shared database).

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/capturas_final_v7.py --base http://localhost:3000 --pin <local test PIN>
Writes capturas/e5/final-v7/<screen>-<width>.png
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("capturas_final_v7.py: abrir una cartilla registra la visita en la base compartida. Requiere ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parents[2] / "capturas" / "e5" / "final-v7"
PATIENT = [
    ("inicio", "/"),
    ("pedir-cita", "/pedir-cita"),
    ("pedir-cita-chat-publico", "/pedir-cita?canal=chat"),
    ("cartilla-carmen", "/j/j-cmp73z"),
    ("cartilla-oscar", "/j/j-g6ytk3"),
    ("preconsulta", "/preconsulta"),
    ("telefono", "/t/carmen"),
]
STAFF = [
    ("demo-operar", "/demo?modo=operar"),
    ("panel", "/panel"),
    ("panel-preconsulta", "/panel/preconsulta"),
    ("regulador", "/regulador"),
    ("tablero", "/tablero"),
]
MOMENTS = ["escena1", "escena2", "etapas"]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", required=True)
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for width, height, mobile in [(360, 800, True), (1920, 1080, False)]:
            ctx = await b.new_context(base_url=a.base, viewport={"width": width, "height": height}, is_mobile=mobile, has_touch=mobile)
            r = await ctx.request.post("/api/access", data={"pin": a.pin, "role": "admision"})
            assert r.ok, "login"
            page = await ctx.new_page()
            for name, path in PATIENT + STAFF:
                await page.goto(path, wait_until="domcontentloaded", timeout=90000)
                await asyncio.sleep(3)
                await page.screenshot(path=str(OUT / f"{name}-{width}.png"), full_page=width == 360)
                print("ok", name, width, flush=True)
            if width == 1920:
                await page.goto("/demo?modo=presentar", wait_until="domcontentloaded")
                await page.locator("[data-moment=escena1]").wait_for(timeout=60000)
                for i, m in enumerate(MOMENTS, start=1):
                    await page.keyboard.press(str(i))
                    await page.locator(f"[data-moment={m}]").wait_for(timeout=10000)
                    await asyncio.sleep(10 if m in ("escena1", "escena2") else 2.5)
                    await page.screenshot(path=str(OUT / f"presentar-{m}-1920.png"))
                    print("ok presentar", m, flush=True)
            await ctx.close()
        await b.close()
    print("RESULTADO: capturas en", OUT)


if __name__ == "__main__":
    asyncio.run(main())
