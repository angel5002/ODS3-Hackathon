"""Tests for ml/: no future leakage, model quality range, fictitious identities only.

Run: ml/.venv/Scripts/python -m pytest tests/ml -q
Tests that need the original CSV are skipped when it is not present (it is not in the repo).
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ml"))
from fake import FIRST_F, FIRST_M, PHONE_PATTERN, SURNAMES  # noqa: E402
from features import TEST_START, add_history, build  # noqa: E402

CSV = ROOT / "insumos" / "DATOS HOSPITAL MARIA AUXILIADORA.csv"
OUT = ROOT / "ml" / "out"
needs_csv = pytest.mark.skipif(not CSV.exists(), reason="original CSV not available")


def synthetic() -> pd.DataFrame:
    rows = [
        # patient A: three dates, two appointments on the second date
        ("A", "2023-01-05", 1), ("A", "2023-02-10", 0), ("A", "2023-02-10", 1), ("A", "2023-03-01", 0),
        ("B", "2023-01-05", 0), ("B", "2023-04-01", 1),
    ]
    df = pd.DataFrame(rows, columns=["ID", "cita", "y"])
    df["cita"] = pd.to_datetime(df["cita"])
    return df


def test_history_counts_only_earlier_dates():
    h = add_history(synthetic())
    a = h[h["ID"] == "A"].sort_values("cita")
    assert a["prev_n"].tolist() == [0, 1, 1, 3]
    assert a["prev_ns"].tolist() == [0, 1, 1, 2]
    # same-day sibling appointments never see each other
    same_day = a[a["cita"] == "2023-02-10"]
    assert same_day["prev_n"].nunique() == 1 and same_day["prev_ns"].nunique() == 1
    assert np.isnan(a.iloc[0]["prev_tasa"])


def test_history_ignores_future_outcomes():
    base = add_history(synthetic())
    changed = synthetic()
    cut = pd.Timestamp("2023-02-10")
    changed.loc[changed["cita"] >= cut, "y"] = 1 - changed.loc[changed["cita"] >= cut, "y"]
    after = add_history(changed)
    cols = ["prev_n", "prev_ns"]
    m_before = base[base["cita"] <= cut].sort_values(["ID", "cita", "y"])[cols].to_numpy()
    m_after = after[after["cita"] <= cut].sort_values(["ID", "cita"])[cols].to_numpy()
    # features on or before the cut cannot depend on outcomes on/after the cut
    assert sorted(map(tuple, m_before)) == sorted(map(tuple, m_after))


@pytest.fixture(scope="module")
def real():
    c, excluded, n_raw = build(str(CSV))
    return c, excluded, n_raw


@needs_csv
def test_reproduces_reference(real):
    c, excluded, _ = real
    assert len(c) == 412_747
    assert len(excluded) == 19
    assert round(c["y"].mean(), 3) == 0.257
    assert c["ID"].nunique() == 93_657


@needs_csv
def test_real_history_matches_brute_force(real):
    c, _, _ = real
    sample = c.sample(300, random_state=1)
    for _, r in sample.iterrows():
        prior = c[(c["ID"] == r["ID"]) & (c["cita"] < r["cita"])]
        assert r["prev_n"] == len(prior)
        assert r["prev_ns"] == prior["y"].sum()


@needs_csv
def test_auc_in_expected_range(real):
    from pipeline import train
    from sklearn.metrics import roc_auc_score

    c, _, _ = real
    _, tr, te = train(c)
    assert tr["cita"].max() < TEST_START <= te["cita"].min()
    auc = roc_auc_score(te["y"], te["riesgo"])
    assert 0.63 <= auc <= 0.68


def load(name):
    return json.loads((OUT / name).read_text(encoding="utf-8"))


def test_demo_day_model_trained_before_demo_day():
    s = load("summary.json")
    assert s["train_max_date"] < s["demo_day"]
    assert pd.Timestamp(s["demo_day"]) >= TEST_START
    assert 1300 <= s["demo_day_rows"] <= 1600
    assert {a["date"] for a in load("appointments.json")} == {s["demo_day"]}
    assert load("model_card.json")["demo_day_check"]["trained_before_demo_day"] is True


def test_identities_are_fictitious():
    patients = load("patients.json")
    phone = re.compile(PHONE_PATTERN)
    firsts = set(FIRST_F) | set(FIRST_M)
    surnames = set(SURNAMES)
    for p in patients:
        assert phone.match(p["phone"]), p["phone"]
        first, s1, s2 = p["full_name"].split(" ")
        assert first in firsts and s1 in surnames and s2 in surnames
        if p["caregiver_name"]:
            cf, c1, c2 = p["caregiver_name"].split(" ")
            assert cf in firsts and c1 in surnames and c2 in surnames
        assert "ID" not in p  # dataset patient IDs are never exported
    assert len({p["phone"] for p in patients}) == len(patients)
    assert len({p["token"] for p in patients}) == len(patients)


def test_demo_patients_prepared():
    patients = load("patients.json")
    roles = {p["demo_role"] for p in patients if p["demo_role"]}
    assert roles == {"alto_riesgo", "pediatrico", "libera_cupo", "espera_1", "espera_2"}
    kid = next(p for p in patients if p["demo_role"] == "pediatrico")
    assert kid["age"] < 12 and kid["caregiver_name"]
    waitlist = load("waitlist.json")
    appts = {a["patient_id"]: a for a in load("appointments.json")}
    release = appts[next(p["id"] for p in patients if p["demo_role"] == "libera_cupo")]
    first = next(p for p in patients if p["demo_role"] == "espera_1")
    spec_list = sorted((w for w in waitlist if w["specialty"] == release["specialty"]), key=lambda w: -w["wait_days"])
    assert spec_list[0]["patient_id"] == first["id"]
    for spec in {w["specialty"] for w in waitlist}:
        assert 5 <= sum(w["specialty"] == spec for w in waitlist) <= 30
