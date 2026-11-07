"""/demo check (E5 final: presentation + operation). READ ONLY: it never presses an action button, never toggles the
noisy room and never resets the demo. The only clicks are the client-side mode switch and the moment navigation.

PRESENTATION mode (the projected one) at 1920x1080 and 1280x720:
  - every moment of the script is reachable by keyboard: → walks 1..5 in order, ← walks back, number keys jump;
  - no overflow: no horizontal scroll, every moment fits the screen (no vertical overflow), nothing outside the viewport;
  - no truncated text: no block element with scrollWidth > clientWidth, and no "…" anywhere on screen;
  - big type: the smallest visible text inside a moment is at least 16 px at 720 p and 23 px at 1080 p;
  - the demo notice is visible in the footer.
OPERATION mode at 1920x1080 and 360x800:
  - the key controls exist (steps, reset, rule selector, noisy room, Presentar), the clock shows the whole date;
  - test calls are hidden by default; no horizontal overflow; no "…" and no truncated text;
  - the demo notice is visible in the footer; the switch goes to the presentation and back.
No console errors anywhere (the one 4xx of ?view=jurado is expected while track E's view is not merged: the screen then
uses its fixture and says "Datos de ejemplo").

Usage (local server with the local test PIN):
  ml/.venv/Scripts/python tests/e2e/demo_panel.py --base http://localhost:3170 --pin <PIN> [--shots capturas/e5/presentacion]
Exit code 0 when every check passes, 1 otherwise.
"""
import argparse
import asyncio
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

DISCLAIMER = "Demostración. Pacientes ficticios. Citas y modelo basados en datos abiertos reales del Hospital María Auxiliadora (2023)."
MOMENTS = ["escena1", "escena2", "etapas"]  # 7/11: only the scenes and the stages are projected
PRESENT_SIZES = [(1920, 1080), (1280, 720)]
OPERATE_SIZES = [(1920, 1080), (360, 800)]
MIN_FONT = {720: 16, 1080: 23}

# block elements whose own text is cut (scrollWidth > clientWidth), and any "…" on screen, under `root`
TRUNCATION_JS = """(root) => {
  const r = document.querySelector(root);
  if (!r) return ['root not found: ' + root];
  const out = [];
  for (const el of r.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline' || cs.display === 'contents' || cs.visibility === 'hidden') continue;
    if (el.closest('.sr-only, [aria-hidden=true], svg')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) out.push('cut: ' + el.tagName + ' «' + el.textContent.trim().slice(0, 60) + '»');
    if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') out.push('ellipsis style: «' + el.textContent.trim().slice(0, 60) + '»');
  }
  const text = r.innerText || '';
  if (text.includes('…')) out.push('"…" on screen: «' + text.slice(Math.max(0, text.indexOf('…') - 40), text.indexOf('…') + 5) + '»');
  return out;
}"""

# smallest visible text inside the moment (sr-only and decorative parts left out)
MIN_FONT_JS = """() => {
  const m = document.querySelector('[data-moment]');
  let min = 999, who = '';
  for (const el of m.querySelectorAll('*')) {
    if (el.closest('.sr-only, [aria-hidden=true], svg, .invisible')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < min) { min = fs; who = el.textContent.trim().slice(0, 50); }
  }
  return { min, who };
}"""

FIT_JS = """() => {
  const m = document.querySelector('[data-moment]');
  const b = m.getBoundingClientRect();
  const out = [];
  if (m.scrollHeight > m.clientHeight + 1) out.push('moment overflows vertically: ' + m.scrollHeight + ' > ' + m.clientHeight);
  if (b.bottom > innerHeight + 1 || b.right > innerWidth + 1) out.push('moment outside the viewport: ' + JSON.stringify(b));
  const d = document.documentElement;
  if (d.scrollWidth > d.clientWidth) out.push('horizontal scroll ' + d.scrollWidth + ' > ' + d.clientWidth);
  return out;
}"""


def track_errors(page):
    errors = []

    def on_console(m):
        if m.type != "error":
            return
        url = (m.location or {}).get("url", "")
        # expected while track E's read-only view is not merged (the screen falls back to its fixture)
        if "Failed to load resource" in m.text and "view=jurado" in url:
            return
        errors.append(m.text)

    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append(str(e)))
    return errors


async def login(browser, base, pin, w, h):
    ctx = await browser.new_context(base_url=base, viewport={"width": w, "height": h})
    r = await ctx.request.post("/api/access", data={"pin": pin, "role": "admision"})
    if not r.ok:
        await ctx.close()
        return None
    return ctx


async def settle_moment(page, moment):
    """lets the entry animations finish; on the two scenes, Space jumps cue by cue to the end of the scene"""
    await asyncio.sleep(1.2)
    if moment in ("escena1", "escena2"):
        for _ in range(14):
            await page.keyboard.press(" ")
            await asyncio.sleep(0.12)
        await asyncio.sleep(1.2)


async def check_presentation(browser, base, pin, w, h, shots):
    tag = f"presentar {w}x{h}"
    ctx = await login(browser, base, pin, w, h)
    if not ctx:
        return [f"{tag}: login failed"]
    fails = []
    page = await ctx.new_page()
    errors = track_errors(page)
    await page.goto("/demo?modo=presentar")
    await page.locator("[data-moment=qr]").wait_for(timeout=60000)
    await asyncio.sleep(2)

    # → walks the script in order
    for n, m in enumerate(MOMENTS):
        if n:
            await page.keyboard.press("ArrowRight")
        loc = page.locator(f"[data-moment={m}]")
        try:
            await loc.wait_for(timeout=5000)
        except Exception:
            fails.append(f"{tag}: → did not reach «{m}»")
            continue
        await settle_moment(page, m)
        for f in await page.evaluate(FIT_JS):
            fails.append(f"{tag} «{m}»: {f}")
        for f in await page.evaluate(TRUNCATION_JS, ".pr-root"):
            fails.append(f"{tag} «{m}»: {f}")
        font = await page.evaluate(MIN_FONT_JS)
        need = MIN_FONT[720 if h <= 720 else 1080]
        if font["min"] < need:
            fails.append(f"{tag} «{m}»: smallest text {font['min']:.1f} px < {need} px («{font['who']}»)")
        if shots:
            await page.screenshot(path=str(Path(shots) / f"despues-presentar-{m}-{w}.png"))

    # ← walks back; number keys jump
    await page.keyboard.press("ArrowLeft")
    if not await page.locator("[data-moment=escena2]").count():
        fails.append(f"{tag}: ← did not go back to «escena2»")
    for n, m in [(3, "etapas"), (1, "escena1"), (2, "escena2")]:
        await page.keyboard.press(str(n))
        try:
            await page.locator(f"[data-moment={m}]").wait_for(timeout=3000)
        except Exception:
            fails.append(f"{tag}: key {n} did not open «{m}»")
    # F asks for fullscreen (headless may refuse it): it must not break anything
    await page.keyboard.press("f")
    await asyncio.sleep(0.5)
    if await page.evaluate("() => !!document.fullscreenElement"):
        await page.keyboard.press("f")

    notice = page.locator(".pr-root footer").get_by_text(DISCLAIMER, exact=True)
    if not await notice.count() or not await notice.is_visible():
        fails.append(f"{tag}: demo notice not visible in the footer")

    # the switch goes to the operation mode
    await page.get_by_role("button", name="Operar").click()
    try:
        await page.get_by_role("region", name="Lista de espera").wait_for(timeout=10000)
    except Exception:
        fails.append(f"{tag}: «Operar» did not open the operation mode")
    if errors:
        fails.append(f"{tag}: console errors: {errors[:3]}")
    await ctx.close()
    return fails


def operation_controls(page):
    return [
        ("Paso 0 Preparar", page.get_by_role("link", name=re.compile(r"Paso 0: .*Preparar"))),
        ("Paso 1-2 Regulador", page.get_by_role("link", name=re.compile(r"Paso 1–2: .*Regulador"))),
        ("Paso 3 Enviar recordatorios", page.get_by_role("button", name=re.compile(r"Paso 3: Enviar recordatorios"))),
        ("Paso 4 Cerrar el plazo", page.get_by_role("button", name=re.compile(r"Paso 4: Cerrar el plazo de respuesta"))),
        ("Adelantar 30 min", page.get_by_role("button", name="Adelantar 30 min")),
        ("Paso 5-7 Por reasignar", page.get_by_role("link", name=re.compile(r"Paso 5–7: .*Por reasignar"))),
        ("Paso 8 Tablero", page.get_by_role("link", name=re.compile(r"Paso 8: .*Tablero"))),
        ("Reiniciar demo (separado)", page.get_by_role("button", name="Reiniciar demo")),
        ("Presentar", page.get_by_role("button", name="Presentar")),
        ("Sala ruidosa", page.get_by_role("switch", name=re.compile("Sala ruidosa"))),
        ("Recorrido del paciente", page.get_by_role("region", name="Recorrido del paciente")),
        ("Llamadas en vivo", page.get_by_role("region", name="Llamadas en vivo")),
        ("Cupos liberados", page.get_by_role("region", name="Cupos liberados y regla de asignación")),
        ("Regla: mayor prioridad", page.get_by_role("button", name=re.compile("Mayor prioridad al cierre"))),
        ("Regla: primero que acepta", page.get_by_role("button", name=re.compile("Primero que acepta"))),
        ("Lista de espera", page.get_by_role("region", name="Lista de espera")),
    ]


async def check_operation(browser, base, pin, w, h, shots):
    tag = f"operar {w}x{h}"
    ctx = await login(browser, base, pin, w, h)
    if not ctx:
        return [f"{tag}: login failed"]
    fails = []
    page = await ctx.new_page()
    errors = track_errors(page)
    await page.goto("/demo")
    await page.get_by_role("region", name="Lista de espera").wait_for(timeout=60000)
    await page.get_by_text(re.compile(r"\d+ en espera")).first.wait_for(timeout=30000)
    await asyncio.sleep(2)

    wide = w >= 1280
    for label, loc in operation_controls(page):
        if await loc.count() == 0:
            fails.append(f"{tag}: missing «{label}»")
            continue
        if not wide:
            await loc.first.scroll_into_view_if_needed()
        if not await loc.first.is_visible():
            fails.append(f"{tag}: «{label}» not visible")
            continue
        if wide:
            box = await loc.first.bounding_box()
            if not box or box["y"] < 0 or box["y"] + box["height"] > h + 0.5 or box["x"] + box["width"] > w + 0.5:
                fails.append(f"{tag}: «{label}» is not above the fold ({box})")

    # the clock shows the whole date ("lunes 16/10"), never cut
    if not await page.get_by_text(re.compile(r"^(lunes|martes|miércoles|jueves|viernes|sábado|domingo) \d{1,2}/\d{1,2}$")).count():
        fails.append(f"{tag}: the clock date is missing or cut")

    # finished test calls are hidden by default (only a ringing or ongoing one may show)
    calls = page.get_by_role("region", name="Llamadas en vivo")
    rows = calls.locator("li", has_text="Llamada de prueba")
    for k in range(await rows.count()):
        txt = await rows.nth(k).inner_text()
        if not re.search(r"Sonando|En llamada|Conectando|En la fila", txt):
            fails.append(f"{tag}: a finished test call is shown by default («{txt[:60]}»)")
            break

    dims = await page.evaluate("() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })")
    if dims["sw"] > dims["cw"]:
        culprits = await page.evaluate(
            "() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1)"
            ".slice(0, 5).map(e => e.tagName + ' ' + String(e.className).slice(0, 80))"
        )
        fails.append(f"{tag}: horizontal overflow {dims['sw']} > {dims['cw']}: {culprits}")
    for f in await page.evaluate(TRUNCATION_JS, ".cc-root"):
        fails.append(f"{tag}: {f}")

    if shots:
        await page.evaluate("() => window.scrollTo(0, 0)")
        await page.screenshot(path=str(Path(shots) / f"despues-operar-{w}.png"), full_page=not wide)

    notice = page.locator("footer.cc-footer").get_by_text(DISCLAIMER)
    if not await notice.count():
        fails.append(f"{tag}: demo notice missing in the footer")
    else:
        await notice.scroll_into_view_if_needed()
        if not await notice.is_visible():
            fails.append(f"{tag}: demo notice not visible in the footer")
    # one notice line only: the site footer is hidden on /demo
    shown = await page.get_by_text(DISCLAIMER).evaluate_all("els => els.filter(e => e.offsetParent !== null).length")
    if shown != 1:
        fails.append(f"{tag}: the demo notice shows {shown} times")

    # the switch goes to the presentation and back
    await page.get_by_role("button", name="Presentar").click()
    try:
        await page.locator("[data-moment=qr]").wait_for(timeout=10000)
    except Exception:
        fails.append(f"{tag}: «Presentar» did not open the presentation")
    await page.get_by_role("button", name="Operar").click()
    try:
        await page.get_by_role("region", name="Lista de espera").wait_for(timeout=10000)
    except Exception:
        fails.append(f"{tag}: «Operar» did not come back")

    if errors:
        fails.append(f"{tag}: console errors: {errors[:3]}")
    await ctx.close()
    return fails


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3170")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--shots", default=None, help="folder for screenshots (optional)")
    a = ap.parse_args()
    if a.shots:
        Path(a.shots).mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        fails = []
        for w, h in PRESENT_SIZES:
            f = await check_presentation(browser, a.base, a.pin, w, h, a.shots)
            print(f"presentar {w}x{h}: {'OK' if not f else 'FALLA'}")
            fails += f
        for w, h in OPERATE_SIZES:
            f = await check_operation(browser, a.base, a.pin, w, h, a.shots)
            print(f"operar {w}x{h}: {'OK' if not f else 'FALLA'}")
            fails += f
        await browser.close()
    for f in fails:
        print(" -", f)
    print("Todo en orden." if not fails else f"{len(fails)} problema(s).")
    sys.exit(1 if fails else 0)


asyncio.run(main())
