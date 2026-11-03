"""
Análisis base del dataset de citas del Hospital María Auxiliadora (2023).
CientíficaHack 2026 - Desafío 4.

Uso:
    pip install pandas scikit-learn
    python analisis_hma.py "DATOS HOSPITAL MARIA AUXILIADORA.csv"

Qué hace:
  1. Carga el CSV (separador ';', UTF-8 con BOM).
  2. Excluye especialidades con >= 95 % de citas no atendidas (artefactos de registro).
  3. Imprime las cifras de la propuesta (tasas por edad, seguro, modalidad, especialidad).
  4. Entrena un modelo base: entrenamiento ene-sep 2023, prueba oct-dic 2023.
     El historial del paciente usa solo citas de fechas ANTERIORES (sin fuga de información).
  5. Guarda 'citas_limpias.csv' y 'predicciones_test.csv' para el prototipo.
"""
import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score

ruta = sys.argv[1] if len(sys.argv) > 1 else "DATOS HOSPITAL MARIA AUXILIADORA.csv"
df = pd.read_csv(ruta, sep=";", encoding="utf-8-sig", dtype=str)
print(f"Filas originales: {len(df):,}")

# ---------- 1. Preparación
df["y"] = (df["ATENDIDO"] == "NO").astype(int)            # 1 = cita programada no atendida
df["cita"] = pd.to_datetime(df["DIA_CITA"], format="%Y%m%d")
df["solicitud"] = pd.to_datetime(df["DIA_SOLICITACITA"], format="%Y%m%d")
df["espera"] = (df["cita"] - df["solicitud"]).dt.days
df["edad"] = pd.to_numeric(df["EDAD"], errors="coerce").clip(0, 100)

# ---------- 2. Limpieza: especialidades con >= 95 % no atendidas
tasa_esp = df.groupby("ESPECIALIDAD")["y"].mean()
excluidas = tasa_esp[tasa_esp >= 0.95].index.tolist()
print(f"Especialidades excluidas ({len(excluidas)}): {', '.join(sorted(excluidas))}")
c = df[~df["ESPECIALIDAD"].isin(excluidas)].copy()

dias = c["cita"].nunique()
print(f"\nBase limpia: {len(c):,} citas | {c['ID'].nunique():,} pacientes | "
      f"no atendidas: {c['y'].sum():,} ({c['y'].mean():.1%}) | ~{c['y'].sum()/dias:.0f} por día de atención")

# ---------- 3. Cifras descriptivas
c["grupo_edad"] = pd.cut(c["edad"], [-1, 11, 17, 29, 59, 120], labels=["0-11", "12-17", "18-29", "30-59", "60+"])
for col in ["grupo_edad", "SEGURO", "PRESENCIAL_REMOTO"]:
    print(f"\nTasa de no atención por {col}:")
    print(c.groupby(col, observed=True)["y"].agg(citas="size", tasa="mean").round(3))
print("\nEspecialidades con más citas no atendidas:")
print(c.groupby("ESPECIALIDAD")["y"].agg(citas="size", tasa="mean", no_atendidas="sum")
      .sort_values("no_atendidas", ascending=False).head(10).round(3))

# ---------- 4. Historial del paciente (solo fechas anteriores)
dia = c.groupby(["ID", "cita"])["y"].agg(n="size", ns="sum").reset_index().sort_values(["ID", "cita"])
dia["prev_n"] = dia.groupby("ID")["n"].cumsum() - dia["n"]
dia["prev_ns"] = dia.groupby("ID")["ns"].cumsum() - dia["ns"]
c = c.merge(dia[["ID", "cita", "prev_n", "prev_ns"]], on=["ID", "cita"], how="left")
c["prev_tasa"] = np.where(c["prev_n"] > 0, c["prev_ns"] / c["prev_n"].replace(0, 1), np.nan)

c["dia_semana"] = c["cita"].dt.dayofweek
c["seguro"] = (c["SEGURO"] == "SI").astype(float)
c["remoto"] = (c["PRESENCIAL_REMOTO"] == "REMOTO").astype(int)
c["femenino"] = (c["SEXO"] == "FEMENINO").astype(int)
c["esp_cod"] = c["ESPECIALIDAD"].astype("category").cat.codes
X = ["esp_cod", "edad", "femenino", "seguro", "remoto", "espera", "dia_semana", "prev_n", "prev_tasa"]

# ---------- 5. Modelo con corte temporal
tr = c[c["cita"] < "2023-10-01"]
te = c[c["cita"] >= "2023-10-01"].copy()
m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08,
                                   categorical_features=[X.index("esp_cod")], random_state=0)
m.fit(tr[X], tr["y"])
te["riesgo"] = m.predict_proba(te[X])[:, 1]
print(f"\nModelo: entrenamiento {len(tr):,} citas (ene-sep) | prueba {len(te):,} (oct-dic)")
print(f"AUC en prueba: {roc_auc_score(te['y'], te['riesgo']):.3f}")

prec, capt = [], []
for _, g in te.groupby("cita"):
    if len(g) < 100:
        continue
    top = g.nlargest(int(len(g) * 0.10), "riesgo")
    prec.append(top["y"].mean())
    capt.append(top["y"].sum() / max(g["y"].sum(), 1))
print(f"Lista diaria del 10 % de mayor riesgo: {np.mean(prec):.0%} no atendidas "
      f"(promedio general {te['y'].mean():.0%}); captura {np.mean(capt):.0%} del total del día")

# ---------- 6. Salidas para el prototipo
c.drop(columns=["y"]).assign(no_atendida=c["y"]).to_csv("citas_limpias.csv", index=False)
te[["ID", "DIA_CITA", "ESPECIALIDAD", "edad", "SEGURO", "PRESENCIAL_REMOTO", "espera", "riesgo", "y"]] \
    .rename(columns={"y": "no_atendida"}).to_csv("predicciones_test.csv", index=False)
print("\nArchivos guardados: citas_limpias.csv, predicciones_test.csv")
