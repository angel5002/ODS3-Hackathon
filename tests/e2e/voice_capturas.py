"""Screenshots of the current call screens (E5): incoming call, call in progress, voice registration, and the
screen that stays in "Conectando…" after closing the tab mid-call. Usage:
  ml/.venv/Scripts/python tests/e2e/voice_capturas.py --pin <local test PIN> --audio <wav> --out capturas/e5 --prefix antes
"""
import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

import voice_diag as vd


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", default="antes")
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    shot = lambda page, name: page.screenshot(path=str(out / f"{a.prefix}-{name}.png"))
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-audio-capture={a.audio}"])
        d = vd.Demo(browser, a.base, a.pin, vd.Recorder())
        staff = await d.staff()
        ids = await d.phones(staff)
        await d.end_all(staff)
        ctx = await d.context()
        p = await d.open_phone(ctx, "rosa", "rosa")
        await d.test_call(staff, ids["rosa"])
        await p.get_by_role("button", name="Contestar").wait_for(timeout=20000)
        await asyncio.sleep(1)
        await shot(p, "llamada-entrante")
        await d.answer(p, "rosa")
        await asyncio.sleep(7)
        await shot(p, "llamada-en-curso")
        await p.close()
        p2 = await d.open_phone(ctx, "rosa", "rosa")
        await asyncio.sleep(6)
        await shot(p2, "reabierta-conectando")
        await d.end_all(staff)
        reg_ctx = await d.context()
        reg = await vd.open_pedir(d, reg_ctx, "registro")
        await vd.start_registration(d, reg, "registro")
        await asyncio.sleep(7)
        await shot(reg, "registro-por-voz")
        await vd.hang_registration(d, reg, "registro")
        await asyncio.sleep(2)
        await d.end_all(staff)
        await browser.close()
    print("listo", sorted(x.name for x in out.glob(f"{a.prefix}-*.png")))


if __name__ == "__main__":
    asyncio.run(main())
