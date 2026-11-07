"""/demo control center check (E5 demo). READ ONLY: it never presses an action button and never resets the demo.

Logs in with the PIN (Admisión), opens /demo at 1280x720, 1280x800 and 1920x1080 (the projector sizes) and at 360x800,
and checks:
  - the key controls and live panels exist and, on the wide sizes, are visible above the fold (no scrolling);
  - the demo notice is visible;
  - no horizontal overflow at any size (360 included);
  - no console errors.

Usage (local server with the local test PIN):
  ml/.venv/Scripts/python tests/e2e/demo_panel.py --base http://localhost:3120 --pin <PIN> [--shots capturas/e5/demo]
Exit code 0 when every check passes, 1 otherwise.
"""
import argparse
import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

DISCLAIMER = "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023)."
SIZES = [(1280, 720), (1280, 800), (1920, 1080), (360, 800)]


def controls(page):
    """(label, locator) of everything the operator and the jury need on the first screen"""
    return [
        ("Paso 0 Preparar", page.get_by_role("link", name=re.compile(r"Paso 0: .*Preparar"))),
        ("Paso 1-2 Regulador", page.get_by_role("link", name=re.compile(r"Paso 1–2: .*Regulador"))),
        ("Paso 3 Enviar recordatorios", page.get_by_role("button", name=re.compile(r"Paso 3: Enviar recordatorios"))),
        ("Paso 4 Cerrar el plazo", page.get_by_role("button", name=re.compile(r"Paso 4: Cerrar el plazo de respuesta"))),
        ("Adelantar 30 min", page.get_by_role("button", name="Adelantar 30 min")),
        ("Paso 5-7 Por reasignar", page.get_by_role("link", name=re.compile(r"Paso 5–7: .*Por reasignar"))),
        ("Paso 8 Tablero", page.get_by_role("link", name=re.compile(r"Paso 8: .*Tablero"))),
        ("Reiniciar demo (separado)", page.get_by_role("button", name="Reiniciar demo")),
        ("Recorrido del paciente", page.get_by_role("region", name="Recorrido del paciente")),
        ("QR del jurado", page.get_by_role("img", name="Código QR de /pedir-cita").first),
        ("Llamadas en vivo", page.get_by_role("region", name="Llamadas en vivo")),
        ("Cupos liberados", page.get_by_role("region", name="Cupos liberados y regla de asignación")),
        ("Regla: mayor prioridad", page.get_by_role("button", name=re.compile("Mayor prioridad al cierre"))),
        ("Regla: primero que acepta", page.get_by_role("button", name=re.compile("Primero que acepta"))),
        ("Lista de espera", page.get_by_role("region", name="Lista de espera")),
        ("Aviso de demostración", page.get_by_text(DISCLAIMER, exact=True).first),
    ]


async def check_size(browser, base, pin, w, h, shots):
    fails = []
    ctx = await browser.new_context(base_url=base, viewport={"width": w, "height": h})
    r = await ctx.request.post("/api/access", data={"pin": pin, "role": "admision"})
    if not r.ok:
        await ctx.close()
        return [f"{w}x{h}: login failed ({r.status})"]
    page = await ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto("/demo")
    await page.get_by_role("region", name="Lista de espera").wait_for(timeout=60000)
    # the live views load after the page: wait for their counters
    await page.get_by_text(re.compile(r"\d+ en espera")).first.wait_for(timeout=30000)
    await asyncio.sleep(2)

    wide = w >= 1280
    for label, loc in controls(page):
        if await loc.count() == 0:
            fails.append(f"{w}x{h}: missing «{label}»")
            continue
        if not wide:
            await loc.scroll_into_view_if_needed()
        if not await loc.is_visible():
            fails.append(f"{w}x{h}: «{label}» not visible")
            continue
        if wide:
            box = await loc.bounding_box()
            if not box or box["y"] < 0 or box["y"] + box["height"] > h + 0.5 or box["x"] + box["width"] > w + 0.5:
                fails.append(f"{w}x{h}: «{label}» is not above the fold ({box})")

    dims = await page.evaluate("() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })")
    if dims["sw"] > dims["cw"]:
        culprits = await page.evaluate(
            "() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1)"
            ".slice(0, 5).map(e => e.tagName + ' ' + String(e.className).slice(0, 80))"
        )
        fails.append(f"{w}x{h}: horizontal overflow {dims['sw']} > {dims['cw']}: {culprits}")
    if errors:
        fails.append(f"{w}x{h}: console errors: {errors[:3]}")

    if shots:
        await page.evaluate("() => window.scrollTo(0, 0)")
        await page.screenshot(path=str(Path(shots) / f"demo-{w}x{h}.png"))
    await ctx.close()
    return fails


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3120")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--shots", default=None, help="folder for screenshots (optional)")
    a = ap.parse_args()
    if a.shots:
        Path(a.shots).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        fails = []
        for w, h in SIZES:
            f = await check_size(browser, a.base, a.pin, w, h, a.shots)
            print(f"{w}x{h}: {'OK' if not f else 'FALLA'}")
            fails += f
        await browser.close()
    for f in fails:
        print(" -", f)
    print("Todo en orden." if not fails else f"{len(fails)} problema(s).")
    sys.exit(1 if fails else 0)


asyncio.run(main())
