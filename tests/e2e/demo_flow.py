"""End-to-end test following the demo script, with screenshots (H8, updated for v4).

    ml/.venv/Scripts/python tests/e2e/demo_flow.py --base http://localhost:3000 --pin <PIN>

Staff uses a desktop browser; five patients use phone-sized browsers (simulated channels). Every
step checks that the change shows up on the other screens within 2 seconds.
Ends with "Reiniciar demo", so it leaves the demo in its initial state.
"""
import argparse
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "capturas"
LIMIT_MS = 2000
results: list[tuple[str, int]] = []
failures: list[str] = []


def timed(label: str, action, check, limit=LIMIT_MS):
    t = time.monotonic()
    action()
    check()
    ms = int((time.monotonic() - t) * 1000)
    results.append((label, ms))
    print(f"  {label}: {ms} ms")
    if ms > limit:
        failures.append(f"{label}: {ms} ms (límite {limit})")


def toast(page: Page, text: str, timeout=8000):
    page.wait_for_function(
        "t => (document.querySelector('[data-sonner-toaster]')?.innerText || '').includes(t)", arg=text, timeout=timeout
    )


def shot(page: Page, name: str, full=False):
    SHOTS.mkdir(exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=full)


def main(base: str, pin: str):
    with sync_playwright() as p:
        # one browser per device: a hidden tab gets its timers frozen, a separate device does not
        browser = p.chromium.launch(headless=True)
        phones_browser = p.chromium.launch(headless=True)
        staff_ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="es-PE")
        phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="es-PE")

        staff = staff_ctx.new_page()
        staff.on("console", lambda m: print("   [panel]", m.type, m.text[:300]) if m.type in ("error", "warning") else None)
        staff.on("requestfailed", lambda r: print("   [panel] falló", r.url[:120]))
        # Regression: from the home page, the router used to keep a cached redirect to /acceso
        # and the PIN form stayed on "Verificando…" after a correct PIN.
        print("0. Ingreso con PIN desde la página de inicio")
        staff.goto(f"{base}/")
        expect(staff.get_by_role("link", name="Ver la demo")).to_be_visible()
        staff.wait_for_timeout(1500)  # let the links prefetch, as a real visit does
        shot(staff, "escritorio-inicio")
        staff.get_by_role("link", name="Ver la demo").click()
        staff.wait_for_url("**/acceso**")
        expect(staff.get_by_label("PIN")).to_be_visible()
        shot(staff, "escritorio-acceso")
        staff.get_by_label("PIN").fill(pin)
        staff.get_by_role("button", name="Entrar").click()
        staff.wait_for_url(lambda u: u.rstrip("/").endswith("/panel") and "acceso" not in u, timeout=8000)
        expect(staff.get_by_role("heading", name="Citas en 3 días")).to_be_visible()
        print("  el PIN lleva al panel: OK")
        res = staff.request.post(f"{base}/api/staff", data={"action": "reset"})
        assert res.ok, res.text()
        staff.goto(f"{base}/demo")
        expect(staff.get_by_text("Teléfono 5")).to_be_visible()
        shot(staff, "escritorio-demo-qr", full=True)

        phones = {}
        for token in ["rosa", "valeria", "carmen", "julio", "ana"]:
            pg = p.chromium.launch(headless=True).new_context(**phone).new_page()  # each phone is its own device
            pg.goto(f"{base}/t/{token}?voz=guion")
            expect(pg.get_by_text("Teléfono simulado de")).to_be_visible()
            phones[token] = pg
        shot(phones["carmen"], "celular-sin-mensajes")

        staff.goto(f"{base}/panel")
        send = staff.get_by_role("button", name="Enviar recordatorios (")
        expect(send).to_be_enabled(timeout=15000)
        shot(staff, "escritorio-panel-inicio")

        print("1. Recordatorios")
        timed("recordatorio visible en el celular", send.click,
              lambda: expect(phones["carmen"].get_by_role("button", name="No podré asistir")).to_be_visible(timeout=8000),
              limit=LIMIT_MS + 1500)  # includes the bulk write of ~1,500 appointments
        shot(phones["carmen"], "celular-recordatorio")

        print("2. Un paciente confirma desde su teléfono")
        valeria = phones["valeria"]
        expect(valeria.get_by_role("button", name="Confirmo")).to_be_visible()
        timed("confirmación visible en el panel", lambda: valeria.get_by_role("button", name="Confirmo").click(),
              lambda: toast(staff, "confirmó por mensaje"))
        shot(valeria, "celular-confirmada")

        print("3. Otro paciente libera su cupo")
        timed("cupo liberado visible en el panel", lambda: phones["carmen"].get_by_role("button", name="No podré asistir").click(),
              lambda: toast(staff, "liberó su cupo por mensaje"))

        print("4. El personal aprueba la oferta simultánea (zona cercana)")
        staff.get_by_role("button", name="Por reasignar").first.click()
        card = staff.locator("article").filter(has_text="Cardiología").filter(has_text="10:20").first
        approve = card.get_by_role("button", name="Aprobar y enviar oferta")
        expect(approve).to_be_visible(timeout=10000)
        expect(card).to_contain_text("54 % con 4 candidatos")
        shot(staff, "escritorio-panel-reasignar")
        julio, ana = phones["julio"], phones["ana"]
        timed("oferta visible en el celular del candidato", approve.click,
              lambda: expect(julio.get_by_role("button", name="Acepto")).to_be_visible(timeout=8000))
        shot(julio, "celular-oferta")

        print("5. Julio acepta primero, Ana después; gana Ana por prioridad")
        julio.get_by_role("button", name="Acepto").click()
        expect(julio.get_by_text("Registramos que acepta")).to_be_visible(timeout=8000)
        expect(ana.get_by_role("button", name="Acepto")).to_be_visible(timeout=8000)
        ana.get_by_role("button", name="Acepto").click()
        expect(ana.get_by_text("Registramos que acepta")).to_be_visible(timeout=8000)
        close = card.get_by_role("button", name="Cerrar oferta y asignar")
        timed("asignación visible en el panel", close.click,
              lambda: expect(staff.get_by_text("aunque Julio respondió primero (0.48)")).to_be_visible(timeout=8000))
        shot(staff, "escritorio-panel-asignada")
        expect(julio.get_by_text("Usted queda primero")).to_be_visible(timeout=8000)
        timed("validación de Ana visible en el panel", lambda: ana.get_by_role("button", name="Sí, soy el paciente").click(),
              lambda: expect(staff.get_by_text("Ana G. confirmó el cupo")).to_be_visible(timeout=8000))
        shot(ana, "celular-cupo-validado")
        expect(staff.get_by_text("09/11").first).to_be_visible(timeout=8000)  # domino: her 09/11 appointment is free
        shot(staff, "escritorio-panel-domino", full=True)

        print("6. Cierre del plazo: el asistente llama a Rosa (lista del 10 %)")
        staff.get_by_role("button", name="Citas").first.click()
        rosa = phones["rosa"]
        timed("llamada entrante en el celular",
              lambda: staff.request.post(f"{base}/api/staff", data={"action": "advance", "minutes": 181}),
              lambda: expect(rosa.get_by_role("button", name="Contestar")).to_be_visible(timeout=12000), limit=LIMIT_MS + 8000)
        shot(rosa, "celular-llamada-entrante")
        rosa.get_by_role("button", name="Contestar").click()
        rosa.get_by_role("button", name="Sí, soy yo").click()
        rosa.get_by_role("button", name="Sí, asistiré").click()
        expect(rosa.get_by_text("la cita quedó confirmada")).to_be_visible(timeout=8000)
        shot(rosa, "celular-llamada-agente")
        staff.get_by_role("tab", name="Todas").click()
        staff.get_by_placeholder("Buscar paciente…").fill("Rosa Díaz Ortiz")
        expect(staff.get_by_role("row").filter(has_text="Rosa Díaz Ortiz").get_by_text("Confirmada")).to_be_visible(timeout=8000)
        staff.get_by_role("row").filter(has_text="Rosa Díaz Ortiz").get_by_role("button").first.click()
        expect(staff.get_by_text("Última llamada")).to_be_visible(timeout=10000)
        shot(staff, "escritorio-panel-detalle-llamada")

        print("7. El tablero lo refleja")
        board = staff_ctx.new_page()  # now the front tab of the laptop
        board.goto(f"{base}/tablero")
        tile = board.get_by_text("Cupos liberados que se llenan", exact=True).locator("..")
        expect(tile).to_contain_text("1", timeout=8000)
        shot(board, "escritorio-tablero", full=True)
        board.get_by_role("button", name="Ver qué pasó").click()
        expect(board.get_by_text("Lo que pasó de verdad ese día")).to_be_visible(timeout=5000)
        shot(board, "escritorio-tablero-revelado", full=True)

        mobile_staff = phones_browser.new_context(**phone)
        mobile_staff.add_cookies(staff_ctx.cookies())
        mp = mobile_staff.new_page()
        mp.goto(f"{base}/panel")
        expect(mp.get_by_text("Citas en 3 días")).to_be_visible()
        mp.wait_for_timeout(1500)
        shot(mp, "celular-panel")
        mp.goto(f"{base}/tablero")
        expect(mp.get_by_text("Tablero en vivo")).to_be_visible()
        mp.wait_for_timeout(1500)
        shot(mp, "celular-tablero")
        mp.goto(f"{base}/panel")
        expect(mp.get_by_text("Citas en 3 días")).to_be_visible()
        mp.get_by_placeholder("Buscar paciente…").fill("Rosa Díaz Ortiz")
        mp.get_by_role("row").filter(has_text="Rosa Díaz Ortiz").get_by_role("button").first.click()
        expect(mp.get_by_text("Lo que más pesa")).to_be_visible()
        mp.wait_for_timeout(800)
        shot(mp, "celular-panel-detalle")
        mp.goto(f"{base}/demo")
        expect(mp.get_by_text("Teléfono 5")).to_be_visible()
        shot(mp, "celular-demo")
        guest = phones_browser.new_context(**phone).new_page()  # no PIN cookie
        guest.goto(f"{base}/")
        expect(guest.get_by_role("link", name="Ver la demo")).to_be_visible()
        shot(guest, "celular-inicio")
        guest.goto(f"{base}/panel")
        expect(guest.get_by_label("PIN")).to_be_visible()
        shot(guest, "celular-acceso")

        print("8. Reiniciar demo")
        board.close()
        staff.bring_to_front()
        staff.goto(f"{base}/demo")
        staff.once("dialog", lambda d: d.accept())
        t = time.monotonic()
        staff.get_by_role("button", name="Reiniciar demo").click()
        expect(staff.get_by_text("Demo reiniciada")).to_be_visible(timeout=5000)
        results.append(("reinicio de la demo", int((time.monotonic() - t) * 1000)))
        expect(phones["julio"].get_by_text("Todavía no hay mensajes")).to_be_visible(timeout=8000)
        browser.close()
        phones_browser.close()

    print("\nResultados:")
    for label, ms in results:
        print(f"  {label:45s} {ms:5d} ms")
    if failures:
        sys.exit("Fuera del límite de tiempo: " + "; ".join(failures))
    print("OK: flujo completo")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", default=os.environ.get("E2E_PIN"))
    a = ap.parse_args()
    if not a.pin:
        sys.exit("Falta el PIN: use --pin o la variable E2E_PIN")
    main(a.base.rstrip("/"), a.pin)
