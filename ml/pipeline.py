"""One-command data and model pipeline for the prototype.

    ml/.venv/Scripts/python ml/pipeline.py "insumos/DATOS HOSPITAL MARIA AUXILIADORA.csv"

1. Reproduces insumos/analisis_hma.py (clean base, no-show rate, AUC).
2. Picks the demo day ("tomorrow") from the test period and checks that the
   model used for it was trained only on earlier dates.
3. Scores every appointment of that day: risk, rank and plain-language factors.
4. Generates fictitious patients, waiting lists and the prepared demo patients.
5. Exports the model card and aggregated 2023 statistics.
6. Writes everything the app loads into Supabase to ml/out/.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fake import Faker  # noqa: E402
from features import FEATURES, TEST_START, build  # noqa: E402

SEED = 20231
OUT = Path(__file__).resolve().parent / "out"
CALL_LIST_SHARE = 0.10
# Peru public holidays and non-working days in Oct-Dec 2023
HOLIDAYS = {"2023-10-08", "2023-11-01", "2023-12-07", "2023-12-08", "2023-12-09", "2023-12-25"}
DAY_MIN, DAY_MAX = 1300, 1600
WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
# Assumptions for RF-17 (simulated replies of patients without a QR). Shown as assumptions in /demo.
SIM = {"no_reply_base": 0.10, "no_reply_per_risk": 0.55, "release_base": 0.04, "release_per_risk": 0.25,
       "talk_to_person": 0.03, "max_delay_min": 110}

EXPECTED = {"clean_rows": 412_747, "no_show_rate": 0.257, "auc": 0.655}


def pct(x: float) -> str:
    return f"{x * 100:.0f} %"


WORDS = {"pediatrica": "pediátrica", "plastica": "plástica", "toraxica": "torácica", "medica": "médica",
         "quirurgica": "quirúrgica", "ecografia": "ecografía", "pediatria": "pediatría"}
AGE_LABEL = {"0-11": "0 a 11", "12-17": "12 a 17", "18-29": "18 a 29", "30-59": "30 a 59", "60+": "60 o más"}


def accent(w: str) -> str:
    if w in WORDS:
        return WORDS[w]
    for a, b in (("logia", "logía"), ("iatria", "iatría"), ("cirugia", "cirugía"), ("cion", "ción"),
                 ("fisica", "física"), ("clinica", "clínica"), ("genetica", "genética")):
        if w.endswith(a):
            return w[: -len(a)] + b
    return w


def title(s: str) -> str:
    small = {"de", "y", "del", "la", "en"}
    words = [accent(w) for w in s.strip().lower().replace("  ", " ").split()]
    return " ".join(w if w in small and i else w[:1].upper() + w[1:] for i, w in enumerate(words))


def train(c: pd.DataFrame) -> tuple[HistGradientBoostingClassifier, pd.DataFrame, pd.DataFrame]:
    tr = c[c["cita"] < TEST_START]
    te = c[c["cita"] >= TEST_START].copy()
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08,
                                       categorical_features=[FEATURES.index("esp_cod")], random_state=0)
    m.fit(tr[FEATURES], tr["y"])
    te["riesgo"] = m.predict_proba(te[FEATURES])[:, 1]
    return m, tr, te


def daily_list_metrics(te: pd.DataFrame, share: float = CALL_LIST_SHARE) -> tuple[float, float, pd.Series]:
    prec, capt, in_list = [], [], pd.Series(False, index=te.index)
    for _, g in te.groupby("cita"):
        if len(g) < 100:
            continue
        top = g.nlargest(int(len(g) * share), "riesgo")
        in_list.loc[top.index] = True
        prec.append(top["y"].mean())
        capt.append(top["y"].sum() / max(g["y"].sum(), 1))
    return float(np.mean(prec)), float(np.mean(capt)), in_list


def pick_demo_day(te: pd.DataFrame) -> tuple[pd.Timestamp, pd.DataFrame]:
    days = te.groupby("cita")["y"].agg(n="size", rate="mean").reset_index()
    days["weekday"] = days["cita"].dt.day_of_week
    ok = days[days["weekday"].between(1, 4) & (~days["cita"].dt.strftime("%Y-%m-%d").isin(HOLIDAYS))
              & days["n"].between(DAY_MIN, DAY_MAX)].copy()
    avg = te["y"].mean()
    typical = ok[(ok["rate"] - avg).abs() <= 0.03].copy()
    pool = typical if len(typical) else ok
    med = pool["n"].median()
    pool["dist"] = (pool["n"] - med).abs()
    best = pool.sort_values(["dist", "cita"]).iloc[0]
    return best["cita"], ok


# ---------- explanations (RF-04)

def explain(model, rows: pd.DataFrame, ref: dict, ctx: dict) -> list[list[dict]]:
    """Occlusion: how much the risk changes if a factor took a typical value.

    Factor groups never include sex (not actionable, sensitive)."""
    groups = {
        "historial": ["prev_n", "prev_tasa"],
        "espera": ["espera"],
        "especialidad": ["esp_cod"],
        "edad": ["edad"],
        "seguro": ["seguro"],
        "modalidad": ["remoto"],
        "dia": ["dia_semana"],
    }
    base = model.predict_proba(rows[FEATURES])[:, 1]
    contrib = {}
    for g, cols in groups.items():
        alt = rows[FEATURES].copy()
        for col in cols:
            alt[col] = ref[col]
        contrib[g] = base - model.predict_proba(alt)[:, 1]
    out = []
    for i, (_, r) in enumerate(rows.iterrows()):
        items = sorted(((g, float(contrib[g][i])) for g in groups), key=lambda t: -abs(t[1]))
        ups = [t for t in items if t[1] > 0.01]
        downs = [t for t in items if t[1] < -0.01]
        chosen = ups[:3] if len(ups) >= 2 else (ups + downs)[:3] if ups else downs[:2]
        if not chosen:
            chosen = items[:2]
        out.append([{"key": g, "effect": "sube" if v > 0 else "baja", "text": factor_text(g, r, v > 0, ctx)}
                    for g, v in chosen])
    return out


def factor_text(g: str, r: pd.Series, up: bool, ctx: dict) -> str:
    if g == "historial":
        n, ns = int(r["prev_n"]), int(r["prev_ns"])
        if n == 0:
            return "No tiene citas anteriores registradas en 2023"
        if ns == 0:
            return f"Asistió a sus {n} citas anteriores" if n > 1 else "Asistió a su cita anterior"
        return f"Faltó a {ns} de sus {n} citas anteriores"
    if g == "espera":
        d = int(r["espera"])
        return f"Pidió la cita hace {d} días" if d != 1 else "Pidió la cita hace 1 día"
    if g == "especialidad":
        rate = ctx["esp_rate"][r["ESPECIALIDAD"]]
        return f"En {title(r['ESPECIALIDAD'])} no se atendió el {pct(rate)} de las citas en ene–sep (promedio {pct(ctx['avg'])})"
    if g == "edad":
        a = int(r["edad"])
        return f"Edad: {a} años" if a != 1 else "Edad: 1 año"
    if g == "seguro":
        return "No tiene seguro de salud" if r["seguro"] == 0 else "Tiene seguro de salud"
    if g == "modalidad":
        return "Cita remota (teleconsulta)" if r["remoto"] == 1 else "Cita presencial"
    if g == "dia":
        return f"Cita en {WEEKDAYS[int(r['dia_semana'])]}"
    return g


# ---------- groups and history (RF-05, RF-36)

def group_table(df: pd.DataFrame, col: str, label_map: dict | None = None, extra=None) -> list[dict]:
    rows = []
    for k, g in df.groupby(col, observed=True):
        item = {"group": label_map.get(k, str(k)) if label_map else str(k), "citas": int(len(g)),
                "tasa": round(float(g["y"].mean()), 4)}
        if extra:
            item.update(extra(g))
        rows.append(item)
    return rows


def main(path: str) -> None:
    OUT.mkdir(exist_ok=True)
    c, excluded, n_raw = build(path)
    days = c["cita"].nunique()
    summary = {
        "raw_rows": n_raw, "excluded_specialties": excluded, "clean_rows": int(len(c)),
        "patients": int(c["ID"].nunique()), "no_shows": int(c["y"].sum()),
        "no_show_rate": round(float(c["y"].mean()), 4), "care_days": int(days),
        "no_shows_per_day": round(float(c["y"].sum() / days), 1),
    }
    print(f"Base limpia: {summary['clean_rows']:,} citas | {summary['patients']:,} pacientes | "
          f"no atendidas {summary['no_shows']:,} ({summary['no_show_rate']:.1%})")

    model, tr, te = train(c)
    auc = float(roc_auc_score(te["y"], te["riesgo"]))
    prec, capt, in_list = daily_list_metrics(te)
    te["en_lista"] = in_list
    summary.update({"train_rows": int(len(tr)), "test_rows": int(len(te)), "auc": round(auc, 4),
                    "call_list_precision": round(prec, 4), "call_list_capture": round(capt, 4),
                    "test_no_show_rate": round(float(te["y"].mean()), 4)})
    print(f"AUC {auc:.3f} | lista 10 %: {prec:.0%} no atendidas (promedio {te['y'].mean():.0%}), captura {capt:.0%}")

    diffs = {
        "clean_rows": summary["clean_rows"] == EXPECTED["clean_rows"],
        "no_show_rate": abs(summary["no_show_rate"] - EXPECTED["no_show_rate"]) < 0.001,
        "auc": abs(auc - EXPECTED["auc"]) < 0.005,
    }
    summary["matches_reference"] = diffs
    if not all(diffs.values()):
        print("ATENCIÓN: no coincide con la referencia:", diffs)
        (OUT / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        sys.exit(2)

    # ---------- demo day (RF-03)
    demo_day, eligible = pick_demo_day(te)
    train_max = tr["cita"].max()
    assert train_max < demo_day, "model must be trained only on dates before the demo day"
    d = te[te["cita"] == demo_day].copy()
    summary["demo_day"] = demo_day.strftime("%Y-%m-%d")
    summary["demo_day_weekday"] = WEEKDAYS[demo_day.day_of_week]
    summary["demo_day_rows"] = int(len(d))
    summary["demo_day_no_show_rate"] = round(float(d["y"].mean()), 4)
    summary["train_max_date"] = train_max.strftime("%Y-%m-%d")
    summary["eligible_days"] = int(len(eligible))
    print(f"Día de demo: {summary['demo_day']} ({summary['demo_day_weekday']}), {len(d)} citas; "
          f"modelo entrenado hasta {summary['train_max_date']}")

    # risk levels: thresholds from the test-period distribution (configurable in the app)
    t_high = round(float(te["riesgo"].quantile(0.90)), 2)
    t_mid = round(float(te["riesgo"].quantile(0.65)), 2)

    esp_rate = tr.groupby("ESPECIALIDAD")["y"].mean().to_dict()
    ref = {col: float(tr[col].median()) for col in FEATURES if col not in ("esp_cod", "prev_tasa")}
    ref["esp_cod"] = int(tr["esp_cod"].mode()[0])
    ref["prev_tasa"] = float(tr["prev_tasa"].median())
    ref["prev_n"] = float(tr["prev_n"].median())
    d = d.sort_values("riesgo", ascending=False).reset_index(drop=True)
    d["rank"] = np.arange(1, len(d) + 1)
    factors = explain(model, d, ref, {"esp_rate": esp_rate, "avg": float(tr["y"].mean())})

    rng = np.random.default_rng(SEED)
    fk = Faker(SEED)

    # ---------- appointment times (the dataset only has dates)
    d["hora"] = ""
    for esp, g in d.groupby("ESPECIALIDAD"):
        idx = rng.permutation(g.index.to_numpy())
        rooms = max(1, math.ceil(len(idx) / 30))
        for i, ix in enumerate(idx):
            slot = i // rooms
            minutes = 7 * 60 + slot * 20
            if minutes >= 13 * 60:
                minutes += 60  # lunch break 13:00-14:00
            d.loc[ix, "hora"] = f"{minutes // 60:02d}:{minutes % 60:02d}"

    # ---------- demo patients (RF-38)
    single = d["ID"].map(d["ID"].value_counts()) == 1  # prepared patients have one appointment that day
    adults = d[(d["edad"] >= 25) & (d["edad"] <= 64) & (d["remoto"] == 0) & single]
    common = adults["ESPECIALIDAD"].value_counts()
    preferred = ["CARDIOLOGIA", "OFTALMOLOGIA", "GASTROENTEROLOGIA", "TRAUMATOLOGIA", "MEDICINA INTERNA"]
    usable = [p for p in preferred if common.get(p, 0) >= 15]
    s_spec = usable[0] if usable else common[~common.index.str.contains("PEDIATR|OBSTETR|GINECO")].index[0]
    high_cut = d["riesgo"].quantile(0.97)
    high = adults[(adults["riesgo"] >= high_cut) & (adults["ESPECIALIDAD"] != s_spec) & (adults["prev_ns"] >= 1)]
    high = high if len(high) else adults[adults["riesgo"] >= high_cut]
    demo_high = high.sort_values("hora").index[0]
    kids = d[(d["edad"] <= 11) & (d["remoto"] == 0) & (d["riesgo"] >= t_mid) & single]
    if (kids["ESPECIALIDAD"].str.contains("PEDIATR")).any():
        kids = kids[kids["ESPECIALIDAD"].str.contains("PEDIATR")]
    kids = kids if len(kids) else d[(d["edad"] <= 11)]
    demo_kid = kids.sort_values("riesgo", ascending=False).index[0]
    rel = adults[(adults["ESPECIALIDAD"] == s_spec) & (adults["riesgo"] < t_high) & (adults["riesgo"] >= t_mid)]
    rel = rel if len(rel) else adults[adults["ESPECIALIDAD"] == s_spec]
    demo_rel = rel.sort_values("hora").index[len(rel) // 3]

    # v4: the prepared patients are fixed by docs/requisitos_v4.md section 1 (Rosa: ENT, high risk;
    # Valeria: 1 year old, pediatric surgery; Carmen: cardiology at 10:20), whatever the model ranks first.
    fem = d["SEXO"] == "FEMENINO"
    ent = adults[(adults["ESPECIALIDAD"] == "OTORRINOLARINGOLOGIA") & fem & (adults["riesgo"] >= t_high)]
    if len(ent):
        demo_high = ent.sort_values("riesgo", ascending=False).index[0]
    kid1 = d[(d["ESPECIALIDAD"] == "CIRUGIA PEDIATRICA") & (d["edad"] == 1) & fem & single]
    if len(kid1):
        demo_kid = kid1.sort_values("riesgo", ascending=False).index[0]
    car = rel[fem.loc[rel.index]]
    if len(car):
        demo_rel = car.sort_values("hora").index[len(car) // 3]
    # Carmen's appointment is at 10:20: swap times with whoever had 10:20 in her specialty
    target = "10:20"
    other = d[(d["ESPECIALIDAD"] == d.loc[demo_rel, "ESPECIALIDAD"]) & (d["hora"] == target)].index
    if len(other) and other[0] != demo_rel:
        d.loc[other[0], "hora"], d.loc[demo_rel, "hora"] = d.loc[demo_rel, "hora"], target
    elif not len(other):
        d.loc[demo_rel, "hora"] = target

    demo_roles = {
        demo_high: ("alto_riesgo", "Riesgo alto: no responde el mensaje y recibe la llamada"),
        demo_kid: ("pediatrico", "Cita pediátrica: responde su cuidador y confirma"),
        demo_rel: ("libera_cupo", "Avisa que no podrá ir y libera su cupo"),
    }
    demo_names = {"alto_riesgo": ("Rosa", "Jorge"), "pediatrico": ("Valeria", "Mateo"), "libera_cupo": ("Carmen", "Luis")}
    demo_sex = {ix: d.loc[ix, "SEXO"] == "FEMENINO" for ix in demo_roles}
    demo_tokens = {role: demo_names[role][0 if demo_sex[ix] else 1].lower() for ix, (role, _) in demo_roles.items()}
    demo_tokens |= {"espera_1": "julio", "espera_2": "ana"}
    for tok in demo_tokens.values():
        fk.reserve_token(tok)

    # ---------- patients for the demo day (one per dataset ID)
    patients, pid_of = [], {}
    for ix, r in d.iterrows():
        key = r["ID"]
        if key in pid_of:
            continue
        pid = f"P{len(patients) + 1:04d}"
        pid_of[key] = pid
        female = r["SEXO"] == "FEMENINO"
        role = demo_roles.get(ix, (None, None))[0]
        first = None
        if role:
            first = demo_names[role][0 if female else 1]
        full, first_name, s1 = fk.full_name(female, first=first)
        age = int(r["edad"])
        cg_name = cg_rel = None
        if age < 18:
            cg_name, cg_rel = fk.caregiver(s1)
            if role == "pediatrico":
                cg_name, cg_rel = f"Lucía {s1} Flores", "madre"
        patients.append({
            "id": pid, "full_name": full, "first_name": first_name, "short_name": f"{first_name} {s1[0]}.",
            "sex": "F" if female else "M", "age": age, "phone": fk.phone(),
            "caregiver_name": cg_name, "caregiver_relation": cg_rel,
            "token": demo_tokens[role] if role else fk.token(),
            "demo_role": role, "demo_label": demo_roles[ix][1] if role else None, "demo_order": None,
        })

    appointments, outcomes = [], []
    for i, (ix, r) in enumerate(d.iterrows()):
        risk = float(r["riesgo"])
        if ix in demo_roles:
            reply, delay = None, None  # prepared patients answer from their phone
        else:
            u = rng.random()
            p_none = SIM["no_reply_base"] + SIM["no_reply_per_risk"] * risk
            if u < p_none:
                reply = None
            else:
                v = rng.random()
                p_rel = SIM["release_base"] + SIM["release_per_risk"] * risk
                reply = "libera" if v < p_rel else "persona" if v < p_rel + SIM["talk_to_person"] else "confirma"
            delay = int(rng.integers(3, SIM["max_delay_min"])) if reply else None
        appointments.append({
            "id": i + 1, "patient_id": pid_of[r["ID"]], "specialty": title(r["ESPECIALIDAD"]),
            "date": demo_day.strftime("%Y-%m-%d"), "time": r["hora"], "remote": bool(r["remoto"]),
            "insured": bool(r["seguro"] == 1), "wait_days": int(r["espera"]), "prev_n": int(r["prev_n"]),
            "prev_no_shows": int(r["prev_ns"]), "risk": round(risk, 4), "risk_rank": int(r["rank"]),
            "factors": factors[i], "sim_reply": reply, "sim_delay_min": delay,
        })
        outcomes.append({"appointment_id": i + 1, "no_show": bool(r["y"])})
    # v4: 68.6 % of the population uses instant messaging (OSIPTEL); the rest gets a call.
    # Separate generator so the rest of the seeded data (times, replies) does not change.
    rng_msg = np.random.default_rng(SEED + 4)
    for i, (ix, r) in enumerate(d.iterrows()):
        appointments[i]["uses_messaging"] = True if ix in demo_roles else bool(rng_msg.random() < 0.686)
    ap_by_ix = {ix: appointments[i] for i, ix in enumerate(d.index)}

    # ---------- waiting lists (RF-06): 5-30 per specialty, wait days from the real distribution
    waitlist = []
    spec_counts = d["ESPECIALIDAD"].value_counts()
    for esp, n_day in spec_counts.items():
        hist = c[(c["ESPECIALIDAD"] == esp) & (c["espera"] >= 1)]
        n = int(min(30, max(5, round(n_day * 0.3))))
        waits = rng.choice(hist["espera"].to_numpy(), n)
        ages = rng.choice(hist["edad"].dropna().to_numpy(), n)
        sexes = rng.choice(hist["SEXO"].to_numpy(), n)
        order = np.argsort(-waits, kind="stable")
        for rank, j in enumerate(order):
            role = None
            if esp == s_spec and rank < 2:
                role = "espera_1" if rank == 0 else "espera_2"
            female = sexes[j] == "FEMENINO"
            age = int(ages[j])
            if role == "espera_1":
                female, age = False, max(age, 40)
            if role == "espera_2":
                female, age = True, max(age, 30)
            first = "Julio" if role == "espera_1" else "Ana" if role == "espera_2" else None
            full, first_name, s1 = fk.full_name(female, first=first)
            cg_name = cg_rel = None
            if age < 18:
                cg_name, cg_rel = fk.caregiver(s1)
            pid = f"P{len(patients) + 1:04d}"
            patients.append({
                "id": pid, "full_name": full, "first_name": first_name, "short_name": f"{first_name} {s1[0]}.",
                "sex": "F" if female else "M", "age": age, "phone": fk.phone(),
                "caregiver_name": cg_name, "caregiver_relation": cg_rel,
                "token": demo_tokens[role] if role else fk.token(),
                "demo_role": role,
                "demo_label": ("Primero en la lista de espera: recibe la oferta del cupo" if role == "espera_1" else
                               "Segunda en la lista de espera: recibe la oferta si el primero no puede" if role else None),
                "demo_order": None,
            })
            w = int(waits[j])
            waitlist.append({"id": len(waitlist) + 1, "patient_id": pid, "specialty": title(esp),
                             "wait_days": w, "requested_on": (demo_day - pd.Timedelta(days=w)).strftime("%Y-%m-%d")})

    order = {"alto_riesgo": 1, "pediatrico": 2, "libera_cupo": 3, "espera_1": 4, "espera_2": 5}
    for p in patients:
        if p["demo_role"]:
            p["demo_order"] = order[p["demo_role"]]

    demo = []
    ap_age = {p["id"]: p["age"] for p in patients}
    for ix, (role, label) in demo_roles.items():
        ap = ap_by_ix[ix]
        demo.append({"role": role, "appointment_id": ap["id"], "patient_id": ap["patient_id"],
                     "specialty": ap["specialty"], "risk": ap["risk"], "label": label, "time": ap["time"],
                     "age": ap_age.get(ap["patient_id"])})
    summary["demo_patients"] = demo
    summary["demo_specialty_for_release"] = title(s_spec)

    # ---------- model card (RF-05)
    def grp_extra(g):
        lst = g["en_lista"]
        return {"auc": round(float(roc_auc_score(g["y"], g["riesgo"])), 3) if g["y"].nunique() > 1 else None,
                "riesgo_medio": round(float(g["riesgo"].mean()), 4),
                "en_lista": int(lst.sum()),
                "precision_lista": round(float(g.loc[lst, "y"].mean()), 4) if lst.sum() else None,
                "share_poblacion": round(len(g) / len(te), 4), "share_lista": round(float(lst.sum() / te["en_lista"].sum()), 4)}

    te_l = te.copy()
    model_card = {
        "model": "Gradient boosting (HistGradientBoostingClassifier, scikit-learn)",
        "train_period": "enero–septiembre 2023", "test_period": "octubre–diciembre 2023",
        "train_rows": summary["train_rows"], "test_rows": summary["test_rows"],
        "auc": summary["auc"], "test_no_show_rate": summary["test_no_show_rate"],
        "call_list_share": CALL_LIST_SHARE, "call_list_precision": summary["call_list_precision"],
        "call_list_capture": summary["call_list_capture"],
        "thresholds": {"alto": t_high, "medio": t_mid},
        "features": ["Especialidad", "Edad", "Tiene seguro", "Presencial o remota",
                     "Días entre la solicitud y la cita", "Día de la semana",
                     "Citas anteriores del paciente", "Inasistencias anteriores del paciente"],
        "history_rule": "El historial del paciente solo usa citas de fechas anteriores a la cita evaluada.",
        "demo_day_check": {"demo_day": summary["demo_day"], "train_max_date": summary["train_max_date"],
                           "trained_before_demo_day": bool(train_max < demo_day)},
        "groups": {
            "seguro": group_table(te_l, "SEGURO", {"SI": "Con seguro", "NO": "Sin seguro"}, grp_extra),
            "edad": group_table(te_l, "grupo_edad", {"0-11": "0 a 11", "12-17": "12 a 17", "18-29": "18 a 29",
                                                      "30-59": "30 a 59", "60+": "60 o más"}, grp_extra),
            "modalidad": group_table(te_l, "PRESENCIAL_REMOTO", {"PRESENCIAL": "Presencial", "REMOTO": "Remota"},
                                     grp_extra),
        },
        "limitations": [
            "El modelo distingue mejor que el azar (AUC 0.5), pero se equivoca a menudo: sirve para ordenar a quién apoyar primero, no para decidir sobre una cita.",
            "No usa la variable sexo: retirarla no cambió el desempeño (AUC 0.655 con y sin ella).",
            "Un riesgo alto significa más apoyo para llegar a la cita (mensaje, llamada), nunca perderla.",
            "Los datos son de 2023 y de un solo hospital; un piloto debe recalibrarlo con datos recientes.",
        ],
        "simulation_assumptions": SIM,
    }

    # ---------- historical statistics 2023 (RF-36)
    spec = c.groupby("ESPECIALIDAD")["y"].agg(citas="size", tasa="mean", no_atendidas="sum").reset_index()
    spec = spec.sort_values("no_atendidas", ascending=False)
    historical = {
        "summary": summary | {"excluded_specialties": excluded},
        "by_specialty": [{"group": title(r.ESPECIALIDAD), "citas": int(r.citas), "tasa": round(float(r.tasa), 4),
                          "no_atendidas": int(r.no_atendidas),
                          "flag": "Tasa inusualmente alta: posible problema de registro" if r.ESPECIALIDAD == "OBSTETRICIA" else None}
                         for r in spec.itertuples()],
        "by_age": group_table(c, "grupo_edad", {"0-11": "0 a 11", "12-17": "12 a 17", "18-29": "18 a 29",
                                                "30-59": "30 a 59", "60+": "60 o más"}),
        "by_insurance": group_table(c, "SEGURO", {"SI": "Con seguro", "NO": "Sin seguro"}),
        "by_modality": group_table(c, "PRESENCIAL_REMOTO", {"PRESENCIAL": "Presencial", "REMOTO": "Remota"}),
        "by_month": [{"group": k.strftime("%Y-%m"), "citas": int(len(g)), "tasa": round(float(g["y"].mean()), 4)}
                     for k, g in c.groupby(c["cita"].dt.to_period("M").dt.to_timestamp())],
    }

    def dump(name, obj):
        (OUT / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")

    dump("summary.json", summary)
    dump("patients.json", patients)
    dump("appointments.json", appointments)
    dump("outcomes.json", outcomes)
    dump("waitlist.json", waitlist)
    dump("model_card.json", model_card)
    dump("historical.json", historical)
    print(f"Pacientes {len(patients)} | citas {len(appointments)} | lista de espera {len(waitlist)} "
          f"| especialidad de la reasignación: {title(s_spec)}")
    for x in demo:
        print("  demo:", x["role"], x["patient_id"], x["specialty"], x["time"], "edad", x["age"], f"riesgo {x['risk']:.2f}")
    print(f"Archivos en {OUT}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[1] / "insumos" /
                                                     "DATOS HOSPITAL MARIA AUXILIADORA.csv"))
