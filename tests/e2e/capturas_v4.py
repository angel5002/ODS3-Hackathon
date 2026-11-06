"""Screenshots of the v4 screens for GUIA_DE_USO.md (capturas/v4/). Resets the demo before and after.

    ml/.venv/Scripts/python tests/e2e/capturas_v4.py --base http://localhost:3000 --pin <PIN>
"""
import argparse
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

OUT = Path(__file__).resolve().parents[2] / "capturas" / "v4"


def main(base: str, pin: str):
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        desk = b.new_context(viewport={"width": 1440, "height": 900}, locale="es-PE")
        mob = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="es-PE")
        s = desk.new_page()

        def shot(page, name, full=False):
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / f"{name}.png"), full_page=full)

        s.goto(f"{base}/acceso")
        shot(s, "01-acceso-roles")
        s.get_by_label("PIN").fill(pin)
        s.get_by_role("button", name="Entrar").click()
        s.wait_for_url("**/panel**")
        s.request.post(f"{base}/api/staff", data={"action": "reset"})

        # the jury: /pedir-cita on a phone
        jury = b.new_context(**mob).new_page()
        jury.goto(f"{base}/pedir-cita")
        expect(jury.get_by_text("¿Necesita una cita?")).to_be_visible()
        shot(jury, "02-pedir-cita-inicio")
        jury.get_by_role("button", name="Chatear con el asistente").click()
        for text in ["ACEPTO", "1", "1", "Lucía Prueba", "4", "35", "7", "2", "Manchas en la piel desde hace dos meses", "NO", "1", "1", "3"]:
            jury.get_by_label("Mensaje").fill(text)
            jury.get_by_role("button", name="Enviar").click()
            jury.wait_for_timeout(2200)
        shot(jury, "03-chat-resumen")
        jury.get_by_label("Mensaje").fill("1")
        jury.get_by_role("button", name="Enviar").click()
        expect(jury.get_by_text("Su número de solicitud es")).to_be_visible(timeout=10000)
        shot(jury, "04-chat-codigo")

        # regulator: blind view
        s.request.post(f"{base}/api/access", data={"role": "regulador"})
        s.goto(f"{base}/regulador")
        expect(s.get_by_text("No ves nombre")).to_be_visible()
        s.wait_for_timeout(1500)
        shot(s, "05-regulador")
        card = s.locator("li").filter(has_text="Manchas en la piel").first
        card.get_by_role("button", name="P3").click()
        s.wait_for_timeout(1500)

        # admission: waiting list, reminders, Carmen releases, offer
        s.request.post(f"{base}/api/access", data={"role": "admision"})
        s.goto(f"{base}/panel?vista=espera")
        expect(s.get_by_text("Ana Gutiérrez Silva")).to_be_visible(timeout=15000)
        shot(s, "06-lista-de-espera")
        s.get_by_role("button", name="Registrar solicitud").click()
        shot(s, "07-registrar-solicitud")
        s.keyboard.press("Escape")
        s.goto(f"{base}/panel")
        s.get_by_role("button", name="Enviar recordatorios (72 h)").click()
        s.wait_for_timeout(2500)
        shot(s, "08-citas")
        carmen = b.new_context(**mob).new_page()
        carmen.goto(f"{base}/t/carmen?voz=guion")
        carmen.get_by_role("button", name="No podré asistir").click()
        carmen.wait_for_timeout(1000)
        shot(carmen, "09-telefono-carmen")
        s.goto(f"{base}/panel?vista=reasignar")
        card = s.locator("article").filter(has_text="Cardiología").filter(has_text="10:20").first
        expect(card.get_by_role("button", name="Aprobar y enviar oferta")).to_be_visible(timeout=15000)
        shot(s, "10-por-reasignar")
        card.get_by_role("button", name="Aprobar y enviar oferta").click()
        julio = b.new_context(**mob).new_page()
        julio.goto(f"{base}/t/julio?voz=guion")
        julio.get_by_role("button", name="Acepto").click()
        julio.wait_for_timeout(800)
        shot(julio, "11-telefono-julio-oferta")
        card.get_by_role("button", name="Acepta").first.click()  # Ana, "usar simulado"
        s.wait_for_timeout(1200)
        shot(s, "12-oferta-abierta")
        card.get_by_role("button", name="Cerrar oferta y asignar").click()
        expect(s.get_by_text("aunque Julio respondió primero")).to_be_visible(timeout=8000)
        shot(s, "13-asignado-a-ana")
        s.goto(f"{base}/panel?vista=validar")
        expect(s.get_by_text("Ana Gutiérrez Silva")).to_be_visible(timeout=10000)
        shot(s, "14-por-validar")
        s.get_by_role("button", name="Usar simulado: confirma").first.click()
        s.wait_for_timeout(1500)
        s.goto(f"{base}/panel?vista=reasignar")
        s.wait_for_timeout(2500)
        shot(s, "15-domino", full=True)

        s.goto(f"{base}/callcenter")
        s.wait_for_timeout(2000)
        shot(s, "16-call-center")
        s.goto(f"{base}/tablero")
        s.wait_for_timeout(3000)
        shot(s, "17-tablero", full=True)
        s.goto(f"{base}/demo")
        s.wait_for_timeout(2500)
        shot(s, "18-demo-en-vivo", full=True)

        # call screen on Rosa's phone after the deadline
        rosa = b.new_context(**mob).new_page()
        rosa.goto(f"{base}/t/rosa?voz=guion")
        s.request.post(f"{base}/api/staff", data={"action": "advance", "minutes": 181})
        expect(rosa.get_by_role("button", name="Contestar")).to_be_visible(timeout=15000)
        shot(rosa, "19-llamada-entrante")
        rosa.get_by_role("button", name="Contestar").click()
        rosa.wait_for_timeout(1500)
        shot(rosa, "20-llamada-guion")
        rosa.get_by_role("button", name="Rechazar").count()
        s.request.post(f"{base}/api/staff", data={"action": "reset"})
        b.close()
    print("Capturas en", OUT)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--pin", default=os.environ.get("E2E_PIN"))
    a = ap.parse_args()
    main(a.base.rstrip("/"), a.pin)
