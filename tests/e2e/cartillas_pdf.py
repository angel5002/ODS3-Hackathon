"""Prints the jury cards (A6, 4 per A4) to docs/cartillas/ with Playwright's page.pdf().

    ml/.venv/Scripts/python tests/e2e/cartillas_pdf.py [--base http://localhost:3180]

Needs a DEVELOPMENT server (the print page /dev/cartillas is notFound() in production) with the database
variables. Read only: it never writes to the database. Writes:
    docs/cartillas/cartillas.pdf          the cards (character, story, what to try, QR)
    docs/cartillas/cartillas_reserva.pdf  backup: one line of instructions per card
"""
import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[2] / "docs" / "cartillas"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3180")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for name, query in (("cartillas.pdf", ""), ("cartillas_reserva.pdf", "?v=reserva")):
            page.goto(f"{args.base}/dev/cartillas{query}", wait_until="networkidle", timeout=120000)
            cards = page.locator("article.card").count()
            if cards == 0:
                raise SystemExit(f"{name}: no hay cartillas en la página (¿se aplicó la migración?)")
            page.emulate_media(media="print")
            page.pdf(path=str(OUT / name), format="A4", print_background=True, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            page.emulate_media(media="screen")
            page.screenshot(path=str(OUT / name.replace(".pdf", ".png")), full_page=True)
            print(f"{name}: {cards} cartillas")
        browser.close()


if __name__ == "__main__":
    main()
