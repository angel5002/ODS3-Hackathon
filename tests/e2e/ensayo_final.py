"""Full rehearsal of the final in script order (guion v7 §3–4): Escena 1 → the jury moment with the REAL printed
card of Carmen (she cancels, the staff approves, Tito accepts, the staff closes) → Escena 2, timing every step.

  - the two scenes are played by tests/e2e/escenas.py (keys, audio of the AI lines at their real length) and its
    measured durations are reported in their place in the script;
  - the jury moment uses the printed card j-cmp73z on a phone-sized browser: «No podré asistir» by message, then the
    same staff actions as the /demo buttons (escena1_aprobar, escena1_cerrar); the projector view (?view=jurado)
    must show the cancellation and then «asignado» to Tito.
It WRITES to the shared database and changes Carmen's card and Tito: run «Preparar para la final» afterwards.
Refuses without ALLOW_DB_WRITE=1 (exit 3).

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/ensayo_final.py --base http://localhost:3000 --pin <local test PIN>
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("ensayo_final.py: escribe en la base compartida. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)
import argparse
import asyncio
import re
import subprocess
import time
from pathlib import Path

from playwright.async_api import async_playwright, expect

HERE = Path(__file__).resolve().parent
CARMEN = "j-cmp73z"
FAIL: list[str] = []
ROWS: list[tuple[str, str, float | None, str]] = []  # (moment, step, seconds, script reference)


def check(ok, msg):
    print(("ok   " if ok else "FALLA"), msg, flush=True)
    if not ok:
        FAIL.append(msg)


VIDEO: str | None = None


def scenes(base: str, pin: str):
    """Runs escenas.py once and returns (scene1_s, scene2_s, ok)."""
    cmd = [_sys.executable, str(HERE / "escenas.py"), "--base", base, "--pin", pin, "--skip-presentation"]
    if VIDEO:
        cmd += ["--video", str(Path(VIDEO) / "escenas")]
    r = subprocess.run(cmd,
                       capture_output=True, text=True, encoding="utf-8", errors="replace", env={**_os.environ, "PYTHONIOENCODING": "utf-8"})
    out = r.stdout + r.stderr
    m1 = re.search(r"escena 1: ([\d.]+) s", out)
    m2 = re.search(r"escena 2: ([\d.]+) s", out)
    check(r.returncode == 0, f"escenas.py: {'todo en orden' if r.returncode == 0 else out[-400:]}")
    return (float(m1.group(1)) if m1 else None, float(m2.group(1)) if m2 else None)


async def jury_moment(pw, base: str, pin: str):
    b = await pw.chromium.launch()
    staff_ctx = await b.new_context()
    r = await staff_ctx.request.post(f"{base}/api/access", data={"pin": pin, "role": "admision"})
    check(r.ok, "entrada como Admisión (PIN de prueba local)")

    async def staff(body):
        res = await staff_ctx.request.post(f"{base}/api/staff", data=body)
        data = await res.json()
        if not res.ok:
            raise AssertionError(f"{body['action']}: {data.get('error')}")
        return data

    async def view():
        res = await staff_ctx.request.get(f"{base}/api/staff/data?view=jurado")
        return await res.json()

    async def wait(pred, timeout=30.0):
        t0 = time.monotonic()
        while time.monotonic() - t0 < timeout:
            v = await view()
            if pred(v):
                return time.monotonic() - t0, v
            await asyncio.sleep(0.5)
        return None, await view()

    # starting point: Carmen's card unused, Tito ready
    await staff({"action": "jury_rearm", "token": CARMEN})
    await staff({"action": "escena1_preparar"})

    rec = lambda name, w, h: {"record_video_dir": str(Path(VIDEO) / name), "record_video_size": {"width": w, "height": h}} if VIDEO else {}
    projector = None
    if VIDEO:  # the projected view of the jury moment, recorded next to Carmen's phone
        pctx = await b.new_context(viewport={"width": 1920, "height": 1080}, **rec("proyector", 1920, 1080))
        await pctx.add_cookies(await staff_ctx.cookies())
        projector = await pctx.new_page()
        await projector.goto(f"{base}/demo?modo=presentar")
        await projector.locator("[data-moment=escena1]").wait_for(timeout=60000)
    ctx = await b.new_context(viewport={"width": 390, "height": 760}, is_mobile=True, has_touch=True, **rec("carmen", 390, 760))
    page = await ctx.new_page()
    t0 = time.monotonic()
    await page.goto(f"{base}/j/{CARMEN}", wait_until="domcontentloaded", timeout=90000)
    await expect(page.get_by_role("heading", name="Carmen")).to_be_visible(timeout=60000)
    await page.locator("[data-jury-ready]").wait_for(timeout=60000)
    ROWS.append(("Jurado", "Carmen abre su cartilla (QR)", time.monotonic() - t0, "slide 5"))

    t1 = time.monotonic()
    await page.get_by_role("button", name=re.compile("Responder por mensaje")).click()
    btn = page.get_by_role("button", name="No podré asistir", exact=True).last
    await expect(btn).to_be_visible(timeout=45000)
    await btn.click()
    dt, v = await wait(lambda v: any(a["token"] == CARMEN and a["kind"] == "cancelo" for a in v["activity"]))
    ROWS.append(("Jurado", "Carmen avisa que no podrá ir (toques en el celular)", time.monotonic() - t1, "«su cupo no se pierde»"))
    check(dt is not None, f"el proyector muestra la cancelación de Carmen ({dt:.1f} s)" if dt is not None else "el proyector no mostró la cancelación")
    check((v.get("carmenSlot") or {}).get("state") == "libre", f"cupo de Carmen libre en el proyector ({(v.get('carmenSlot') or {}).get('state')})")

    t2 = time.monotonic()
    res = await staff({"action": "escena1_aprobar"})
    dt, v = await wait(lambda v: (v.get("carmenSlot") or {}).get("state") in ("ofrecido", "asignado"))
    ROWS.append(("Escena 1 en vivo", "El personal aprueba la oferta a Tito (clic en /demo)", time.monotonic() - t2, "«el personal aprueba»"))
    check(res.get("result", {}).get("offer_id") is not None, "la oferta sale para Tito, primero en la lista por su categoría")

    t3 = time.monotonic()
    try:
        await staff({"action": "escena1_cerrar"})
    except AssertionError as e:
        # older servers: Tito was the only candidate, so his answer already closed the offer
        print("  (cerrar:", e, "— se comprueba el estado en el proyector)", flush=True)
    dt, v = await wait(lambda v: (v.get("carmenSlot") or {}).get("state") == "asignado")
    ROWS.append(("Escena 1 en vivo", "Tito acepta y se cierra la oferta: el cupo es de Tito", time.monotonic() - t3, "«Listo. Su cita quedó reservada»"))
    slot = v.get("carmenSlot") or {}
    check(slot.get("state") == "asignado" and (slot.get("assignedTo") or "").startswith("Tito"), f"el proyector muestra el cupo de Carmen asignado a {slot.get('assignedTo')}")
    ROWS.append(("Jurado", "Circuito completo de Carmen a Tito", time.monotonic() - t1, "1–2 min"))
    if projector:
        await projector.keyboard.press("1")  # the scene-1 view follows carmenSlot: the slot moves to Tito
        await asyncio.sleep(6)
        await projector.context.close()
    await ctx.close()
    await b.close()


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--video", default=None, help="folder for .webm videos (scenes, Carmen's phone, projector)")
    a = ap.parse_args()
    global VIDEO
    VIDEO = a.video
    s1, s2 = scenes(a.base, a.pin)
    async with async_playwright() as pw:
        await jury_moment(pw, a.base, a.pin)
    order = [("Escena 1", "Reproducción con audio de la IA", s1, "~35 s")] + ROWS + [("Escena 2", "Preconsulta: chat cada 2.4 s y resumen", s2, "~35 s")]
    print("\nEnsayo en el orden del guion")
    print(f"{'Momento':<18} {'Paso':<56} {'Segundos':>9}  Guion")
    for m, step, sec, ref in order:
        print(f"{m:<18} {step:<56} {('%.1f' % sec) if sec is not None else '—':>9}  {ref}")
    print("RESULTADO:", "todo ok" if not FAIL else f"{len(FAIL)} fallas")
    _sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    asyncio.run(main())
