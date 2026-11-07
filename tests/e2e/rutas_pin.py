"""Without the staff PIN, every staff screen redirects to /acceso and every staff API answers 401; the public front page
is reachable, static and sets no cookie. HTTP only, read-only (the POSTs are refused by the proxy before any handler).

Usage: ml/.venv/Scripts/python tests/e2e/rutas_pin.py [--base https://asistia.vercel.app]
"""
import argparse
import sys
import urllib.error
import urllib.request

PAGES = ["/demo", "/demo?modo=presentar", "/panel", "/panel/preconsulta", "/panel/escenas", "/tablero", "/regulador", "/callcenter"]
APIS = [
    ("GET", "/api/staff/data?view=overview"),
    ("GET", "/api/staff/data?view=jurado"),
    ("GET", "/api/staff/preconsulta"),
    ("POST", "/api/staff"),
    ("POST", "/api/staff/scene-event"),
    ("POST", "/api/regulator"),
    ("GET", "/api/callcenter"),
    ("GET", "/api/fhir/requests"),
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPEN = urllib.request.build_opener(NoRedirect)


def hit(base, method, path):
    data = b"{}" if method == "POST" else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        r = OPEN.open(req, timeout=60)
        return r.status, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.headers


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://asistia-e5.vercel.app")
    base = ap.parse_args().base.rstrip("/")
    fails = []
    for p in PAGES:
        s, h = hit(base, "GET", p)
        ok = s in (302, 307, 308) and "/acceso" in (h.get("Location") or "")
        print(("ok   " if ok else "FALLA"), f"sin PIN {p} → {s} {h.get('Location') or ''}")
        ok or fails.append(p)
    for m, p in APIS:
        s, _ = hit(base, m, p)
        ok = s == 401
        print(("ok   " if ok else "FALLA"), f"sin PIN {m} {p} → {s}")
        ok or fails.append(p)
    s, h = hit(base, "GET", "/")
    ok = s == 200 and not h.get("Set-Cookie")
    print(("ok   " if ok else "FALLA"), f"portada / → {s}, sin cookie: {not h.get('Set-Cookie')}")
    ok or fails.append("/")
    print("RESULTADO:", "todo ok" if not fails else f"{len(fails)} fallas")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
