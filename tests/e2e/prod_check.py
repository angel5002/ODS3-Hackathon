"""Checks the public deployment without the staff PIN.

    ml/.venv/Scripts/python tests/e2e/prod_check.py --base https://ods3-hackathon.vercel.app

Phones are real browsers on the public URL. Staff actions (send reminders,
offer a slot) are done with the same database functions the panel calls,
using the server key from .env.local. Resets the demo before and after.
For the staff screens on production, run demo_flow.py with --base and --pin.
"""
import argparse
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def env():
    out = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"')
    return out


E = env()
URL, KEY = E["NEXT_PUBLIC_SUPABASE_URL"], E["SUPABASE_SERVICE_ROLE_KEY"]


def rest(path, body=None):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urllib.request.urlopen(req) as r:
        txt = r.read().decode()
        return json.loads(txt) if txt else None


def wait_status(appt_id, status, limit=2.0):
    t = time.monotonic()
    while time.monotonic() - t < 5:
        if rest(f"appointments?id=eq.{appt_id}&select=status")[0]["status"] == status:
            return int((time.monotonic() - t) * 1000)
        time.sleep(0.1)
    raise AssertionError(f"appointment {appt_id} never became {status}")


def main(base):
    rest("rpc/reset_demo", {})
    carmen = rest("patients?demo_role=eq.libera_cupo&select=id")[0]["id"]
    slot = rest(f"appointments?patient_id=eq.{carmen}&select=id,specialty")[0]
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        phone = dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        gate = b.new_context().new_page()
        gate.goto(f"{base}/panel")
        assert "/acceso" in gate.url, "the panel must ask for the PIN"
        print("PIN pedido en /panel: OK")
        c = b.new_context(**phone).new_page()
        j = b.new_context(**phone).new_page()
        c.goto(f"{base}/t/carmen")
        j.goto(f"{base}/t/julio")
        expect(c.get_by_text("Teléfono simulado de")).to_be_visible(timeout=15000)
        expect(j.get_by_text("Todavía no hay mensajes")).to_be_visible(timeout=15000)

        t = time.monotonic()
        rest("rpc/send_reminders", {})
        expect(c.get_by_role("button", name="No podré asistir")).to_be_visible(timeout=5000)
        print(f"recordatorio en el celular (producción): {int((time.monotonic() - t) * 1000)} ms")

        c.get_by_role("button", name="No podré asistir").click()
        print(f"liberación registrada: {wait_status(slot['id'], 'liberada')} ms")

        first = rest(f"waitlist?specialty=eq.{urllib.parse.quote(slot['specialty'])}&order=wait_days.desc,id&limit=1&select=id")[0]["id"]
        t = time.monotonic()
        rest("rpc/make_offer", {"p_slot": slot["id"], "p_waitlist": first, "p_actor": "Prueba de producción"})
        expect(j.get_by_role("button", name="Acepto")).to_be_visible(timeout=5000)
        print(f"oferta en el celular del candidato: {int((time.monotonic() - t) * 1000)} ms")
        j.get_by_role("button", name="Acepto").click()
        print(f"reasignación registrada: {wait_status(slot['id'], 'reasignada')} ms")
        expect(j.get_by_text("queda registrada")).to_be_visible(timeout=5000)
        b.close()
    rest("rpc/reset_demo", {})
    print("OK: producción responde y el flujo de teléfonos funciona")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://ods3-hackathon.vercel.app")
    main(ap.parse_args().base.rstrip("/"))
