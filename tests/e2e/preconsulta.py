"""Pre-visit (preconsulta) end to end, LIVE (not the playback): proposal v5.1 §4.1-4.2, pitch v7 scene 2.
WRITES to the shared database (pre-visit sessions, answers, and one staff 'alarma' task per run): it refuses and exits 3
without ALLOW_DB_WRITE=1. It never resets the demo and never creates calls. Every session expires in 24 h.

For each --base (repeat it: the local server AND the deployed one):
  1. staff creates a link (POST /api/staff/preconsulta) for the fictitious "Tito Prueba" at 10:15;
  2. the patient page: consent ("Acepto · soy el paciente"), then the script's answers typed in the chat;
     the questions are the script's, the medicine is confirmed one by one ("Anoté: Ibuprofeno"), the closing line gives
     the arrival window "llegue entre 10:20 y 10:35" and says it is an estimate;
  3. the doctor's view (/panel/preconsulta and GET ?id=): "Referido por el paciente", motive, onset, Ibuprofeno
     confirmed, allergies "ninguna" verified, the three signs denied, other signs "no evaluado", no diagnosis;
     a correction by the doctor is recorded;
  4. ALARM path: a second patient (public start /preconsulta) answers "me duele la rodilla y tengo fiebre": the chat
     STOPS (no input box), says emergency + 106, the summary is "derivado a emergencia" and a staff task exists;
  5. a double submit with the same version is applied once.

Usage: ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/preconsulta.py --base http://localhost:3160 --pin <PIN>
       [--base https://asistia-e5.vercel.app --pin-env DEMO_PIN]   (the PIN is read from the environment, never printed)
Exit 0 when every check passes, 1 otherwise, 3 without ALLOW_DB_WRITE=1.
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ANSWERS = ["Me duele la rodilla derecha desde hace una semana.", "Ibuprofeno. Alergias, ninguna.", "Sí", "No."]
QUESTIONS = [
    "Hola, Tito Prueba. Antes de su cita, ¿qué molestia quiere consultar?",
    "¿Tomó algún medicamento? ¿Tiene alergias?",
    "Anoté: Ibuprofeno. ¿Es correcto? Responda SÍ o NO.",
    "¿Tiene fiebre, o la rodilla está muy hinchada o caliente?",
]
CLOSING = "Su consultorio va con 20 min de atraso: llegue entre 10:20 y 10:35."


async def bubbles(page):
    return await page.locator("ol[aria-label=Conversación] li").all_inner_texts()


async def send(page, text):
    n = len(await bubbles(page))
    await page.locator("#pc-answer").fill(text)
    await page.locator("#pc-answer").press("Enter")
    for _ in range(200):
        if len(await bubbles(page)) > n + 1 or await page.locator("main [role=alert]").count():
            return
        await asyncio.sleep(0.05)


async def run_base(browser, base, pin, shots):
    fails = []
    tag = base
    ctx = await browser.new_context(base_url=base, viewport={"width": 420, "height": 860})
    ctx.set_default_navigation_timeout(180000)  # a dev server compiles each page on its first visit
    r = await ctx.request.post("/api/access", data={"pin": pin, "role": "admision"})
    if not r.ok:
        return [f"{tag}: login failed ({r.status})"]
    page = await ctx.new_page()
    errors = []
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    # 1. staff creates the link
    r = await ctx.request.post("/api/staff/preconsulta", data={"action": "create", "alias": "Tito Prueba", "time": "10:15", "gender": "m"})
    if not r.ok:
        return [f"{tag}: create failed ({r.status})"]
    created = await r.json()
    sid, path = created["id"], created["path"]

    # 2. the patient
    await page.goto(path)
    await page.get_by_role("button", name="Acepto · soy el paciente").click()
    await page.locator("#pc-answer").wait_for(timeout=15000)
    got = await bubbles(page)
    if not got or got[0] != QUESTIONS[0]:
        fails.append(f"{tag}: first question {got[:1]}")
    for a in ANSWERS:
        await send(page, a)
    got = await bubbles(page)
    ia = [b for b in got if b not in ANSWERS]
    for q in QUESTIONS:
        if q not in ia:
            fails.append(f"{tag}: missing question «{q}»")
    if not any(CLOSING in b for b in ia):
        fails.append(f"{tag}: closing line with the arrival window missing: {ia[-2:]}")
    if not any("estimación" in b for b in ia):
        fails.append(f"{tag}: the arrival window is not labelled as an estimate")
    if await page.locator("#pc-answer").count():
        fails.append(f"{tag}: the input is still there after the end")
    if shots:
        await page.screenshot(path=str(Path(shots) / "preconsulta-paciente.png"), full_page=True)

    # 3. the doctor
    d = await (await ctx.request.get(f"/api/staff/preconsulta?id={sid}")).json()
    s = d.get("summary", {})
    checks = {
        "referido": s.get("referidoPorElPaciente") is True,
        "motivo": s.get("motivo") == "Me duele la rodilla derecha",
        "inicio": s.get("inicio") == "desde hace una semana",
        "medicamento confirmado": s.get("medicamentos") == [{"nombre": "Ibuprofeno", "confirmado": True}],
        "alergias ninguna": s.get("alergias") == "ninguna",
        "alarma preguntada y negada": s.get("alarma") == {"preguntada": True, "positiva": False, "detalle": None},
        "signos negados (verificados)": all(x.get("estado") == "no" for x in s.get("signos", [])),
        "otros no evaluado": s.get("otrosSignos") == "no_evaluado",
        "ventana estimada": (s.get("ventanaLlegada") or {}).get("esEstimacion") is True and (s.get("ventanaLlegada") or {}).get("desde") == "10:20",
        "estado completa": d.get("status") == "completa",
        "transcripción": len(d.get("transcript", [])) >= 9,
    }
    for k, okk in checks.items():
        if not okk:
            fails.append(f"{tag}: summary check failed: {k}")
    low = str(s).lower()
    for never in ["diagnóstico", "diagnostico", "artritis", "radiograf", "resonancia", "examen"]:
        if never in low:
            fails.append(f"{tag}: the summary contains «{never}»")
    # doctor's screen
    doc = await ctx.new_page()
    await doc.set_viewport_size({"width": 1400, "height": 1000})
    await doc.goto("/panel/preconsulta")
    await doc.get_by_role("button", name="Tito Prueba").first.click()
    await doc.get_by_text("Referido por el paciente · pendiente de verificación profesional").wait_for(timeout=15000)
    body = await doc.locator("main").inner_text()
    for must in ["«Me duele la rodilla derecha»", "Confirmado por el paciente", "Ninguna · negación verificada", "Otros signos de alarma: no evaluado", "no es una hora garantizada"]:
        if must not in body:
            fails.append(f"{tag}: doctor view misses «{must}»")
    # a correction is recorded
    r = await ctx.request.post("/api/staff/preconsulta", data={"action": "edit", "id": sid, "field": "inicio", "value": "hace 8 días"})
    e = await r.json()
    if not r.ok or not e.get("edits") or e["summary"].get("inicio") != "hace 8 días":
        fails.append(f"{tag}: the doctor's correction was not recorded")
    if shots:
        await doc.wait_for_timeout(2000)
        await doc.screenshot(path=str(Path(shots) / "preconsulta-medico.png"), full_page=True)

    # 5. a double submit with an old version is applied once
    v = await (await ctx.request.get(path.replace("/preconsulta/", "/api/preconsulta/"))).json()
    r2 = await ctx.request.post(path.replace("/preconsulta/", "/api/preconsulta/"), data={"action": "answer", "text": "otra cosa", "version": v["version"] - 1})
    if r2.status not in (409, 200) or len((await r2.json()).get("messages", [])) != len(v["messages"]):
        fails.append(f"{tag}: a stale submit changed the conversation")

    # 4. the alarm path (public start)
    p2 = await ctx.new_page()
    await p2.goto("/preconsulta")
    await p2.locator("#alias").fill("Rita Prueba")
    await p2.get_by_role("button", name="Empezar").click()
    await p2.get_by_role("button", name="Acepto · respondo por el paciente").click()
    await p2.locator("#pc-answer").wait_for(timeout=15000)
    await send(p2, "Me duele la rodilla y tengo fiebre")
    await p2.get_by_text("No espere su cita", exact=True).wait_for(timeout=10000)
    txt = await p2.locator("main").inner_text()
    if "106" not in txt or "emergencia" not in txt:
        fails.append(f"{tag}: alarm: no emergency/106 instruction")
    if await p2.locator("#pc-answer").count():
        fails.append(f"{tag}: alarm: the interview did not stop")
    if shots:
        await p2.screenshot(path=str(Path(shots) / "preconsulta-alarma.png"), full_page=True)
    lst = (await (await ctx.request.get("/api/staff/preconsulta")).json()).get("sessions", [])
    rita = next((x for x in lst if x["patient_alias"] == "Rita Prueba"), None)
    if not rita or rita["status"] != "derivada_emergencia":
        fails.append(f"{tag}: alarm: session not 'derivada_emergencia'")
    else:
        ds = (await (await ctx.request.get(f"/api/staff/preconsulta?id={rita['id']}")).json())["summary"]
        if not ds.get("derivadoAEmergencia") or ds.get("respondio") != "acompanante":
            fails.append(f"{tag}: alarm: summary not marked (emergencia / acompañante)")
    tasks = (await (await ctx.request.get("/api/callcenter")).json()).get("tasks", [])
    if not any(t.get("type") == "alarma" and "Preconsulta de Rita Prueba" in (t.get("note") or "") for t in tasks):
        fails.append(f"{tag}: alarm: no staff task")

    if errors:
        fails.append(f"{tag}: console errors: {errors[:2]}")
    await ctx.close()
    return fails


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", action="append", required=True)
    ap.add_argument("--pin", action="append", default=[], help="PIN for each --base (same order)")
    ap.add_argument("--pin-env", action="append", default=[], help="name of an environment variable holding the PIN of the next --base")
    ap.add_argument("--shots", default=None)
    a = ap.parse_args()
    if os.environ.get("ALLOW_DB_WRITE") != "1":
        print("preconsulta.py: escribe en la base compartida (preconsultas y una tarea de alarma). No se ejecuta sin ALLOW_DB_WRITE=1.")
        sys.exit(3)
    pins = list(a.pin) + [os.environ.get(n, "") for n in a.pin_env]
    if len(pins) < len(a.base):
        print("Falta un PIN por cada --base (use --pin o --pin-env).")
        sys.exit(1)
    if a.shots:
        Path(a.shots).mkdir(parents=True, exist_ok=True)
    fails = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        for base, pin in zip(a.base, pins):
            f = await run_base(browser, base, pin, a.shots)
            print(f"{base}: {'OK' if not f else 'FALLA'}")
            fails += f
        await browser.close()
    for f in fails:
        print(" -", f)
    print("Todo en orden." if not fails else f"{len(fails)} problema(s).")
    sys.exit(1 if fails else 0)


asyncio.run(main())
