"""Data loading, cleaning and leak-free features.

Same logic as insumos/analisis_hma.py (the validated reference). The patient
history uses ONLY appointments on earlier dates: tests/ml/test_no_leak.py
checks this on synthetic and real data.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

EXCLUDE_THRESHOLD = 0.95
TEST_START = pd.Timestamp("2023-10-01")
FEATURES = ["esp_cod", "edad", "femenino", "seguro", "remoto", "espera", "dia_semana", "prev_n", "prev_tasa"]


def load_raw(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, sep=";", encoding="utf-8-sig", dtype=str)
    df["y"] = (df["ATENDIDO"] == "NO").astype(int)  # 1 = no-show (ATENDIDO = NO)
    df["cita"] = pd.to_datetime(df["DIA_CITA"], format="%Y%m%d")
    df["solicitud"] = pd.to_datetime(df["DIA_SOLICITACITA"], format="%Y%m%d")
    df["espera"] = (df["cita"] - df["solicitud"]).dt.days
    df["edad"] = pd.to_numeric(df["EDAD"], errors="coerce").clip(0, 100)
    return df


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Drop specialties with >= 95 % no-shows (registry artifacts)."""
    rate = df.groupby("ESPECIALIDAD")["y"].mean()
    excluded = sorted(rate[rate >= EXCLUDE_THRESHOLD].index.tolist())
    return df[~df["ESPECIALIDAD"].isin(excluded)].copy(), excluded


def add_history(c: pd.DataFrame) -> pd.DataFrame:
    """prev_n / prev_ns / prev_tasa: counts over the patient's appointments on EARLIER dates only.

    Appointments on the same day are aggregated first, so a same-day sibling
    appointment never leaks into the history.
    """
    day = c.groupby(["ID", "cita"])["y"].agg(n="size", ns="sum").reset_index().sort_values(["ID", "cita"])
    day["prev_n"] = day.groupby("ID")["n"].cumsum() - day["n"]
    day["prev_ns"] = day.groupby("ID")["ns"].cumsum() - day["ns"]
    out = c.drop(columns=[x for x in ("prev_n", "prev_ns", "prev_tasa") if x in c.columns])
    out = out.merge(day[["ID", "cita", "prev_n", "prev_ns"]], on=["ID", "cita"], how="left")
    out["prev_tasa"] = np.where(out["prev_n"] > 0, out["prev_ns"] / out["prev_n"].replace(0, 1), np.nan)
    return out


def add_features(c: pd.DataFrame) -> pd.DataFrame:
    c = c.copy()
    c["dia_semana"] = c["cita"].dt.day_of_week
    c["seguro"] = (c["SEGURO"] == "SI").astype(float)
    c["remoto"] = (c["PRESENCIAL_REMOTO"] == "REMOTO").astype(int)
    c["femenino"] = (c["SEXO"] == "FEMENINO").astype(int)
    c["esp_cod"] = c["ESPECIALIDAD"].astype("category").cat.codes
    c["grupo_edad"] = pd.cut(c["edad"], [-1, 11, 17, 29, 59, 120], labels=["0-11", "12-17", "18-29", "30-59", "60+"])
    return c


def build(path: str) -> tuple[pd.DataFrame, list[str], int]:
    raw = load_raw(path)
    c, excluded = clean(raw)
    c = add_features(add_history(c))
    return c, excluded, len(raw)
