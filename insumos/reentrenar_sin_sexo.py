import sys, numpy as np, pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
df = pd.read_csv(sys.argv[1], sep=";", encoding="utf-8-sig", dtype=str)
df["y"]=(df["ATENDIDO"]=="NO").astype(int)
df["cita"]=pd.to_datetime(df["DIA_CITA"],format="%Y%m%d"); df["solicitud"]=pd.to_datetime(df["DIA_SOLICITACITA"],format="%Y%m%d")
df["espera"]=(df["cita"]-df["solicitud"]).dt.days; df["edad"]=pd.to_numeric(df["EDAD"],errors="coerce").clip(0,100)
t=df.groupby("ESPECIALIDAD")["y"].mean(); c=df[~df["ESPECIALIDAD"].isin(t[t>=0.95].index)].copy()
print("limpia",len(c),c.y.sum(),round(c.y.mean(),4))
print("espera<=7",round(c[c.espera<=7].y.mean(),4),"espera>7",round(c[c.espera>7].y.mean(),4))
dia=c.groupby(["ID","cita"])["y"].agg(n="size",ns="sum").reset_index().sort_values(["ID","cita"])
dia["prev_n"]=dia.groupby("ID")["n"].cumsum()-dia["n"]; dia["prev_ns"]=dia.groupby("ID")["ns"].cumsum()-dia["ns"]
c=c.merge(dia[["ID","cita","prev_n","prev_ns"]],on=["ID","cita"],how="left")
c["prev_tasa"]=np.where(c["prev_n"]>0,c["prev_ns"]/c["prev_n"].replace(0,1),np.nan)
c["dia_semana"]=c["cita"].dt.dayofweek; c["seguro"]=(c["SEGURO"]=="SI").astype(float)
c["remoto"]=(c["PRESENCIAL_REMOTO"]=="REMOTO").astype(int); c["femenino"]=(c["SEXO"]=="FEMENINO").astype(int)
c["esp_cod"]=c["ESPECIALIDAD"].astype("category").cat.codes
tr=c[c.cita<"2023-10-01"]; te=c[c.cita>="2023-10-01"].copy()
for name,X in [("con_sexo",["esp_cod","edad","femenino","seguro","remoto","espera","dia_semana","prev_n","prev_tasa"]),
               ("sin_sexo",["esp_cod","edad","seguro","remoto","espera","dia_semana","prev_n","prev_tasa"])]:
    m=HistGradientBoostingClassifier(max_iter=300,learning_rate=0.08,categorical_features=[X.index("esp_cod")],random_state=0).fit(tr[X],tr.y)
    te["r"]=m.predict_proba(te[X])[:,1]
    prec,capt=[],[]
    for _,g in te.groupby("cita"):
        if len(g)<100: continue
        top=g.nlargest(int(len(g)*0.10),"r"); prec.append(top.y.mean()); capt.append(top.y.sum()/max(g.y.sum(),1))
    print(name,"AUC",round(roc_auc_score(te.y,te.r),3),"prec",round(np.mean(prec),3),"capt",round(np.mean(capt),3),"base",round(te.y.mean(),3))
    te["ge"]=pd.cut(te.edad,[-1,11,17,29,59,120],labels=["0-11","12-17","18-29","30-59","60+"])
    print("  AUC por edad",{str(k):round(roc_auc_score(g.y,g.r),3) for k,g in te.groupby("ge",observed=True)})
    print("  AUC por sexo",{k:round(roc_auc_score(g.y,g.r),3) for k,g in te.groupby("SEXO")})
    print("  AUC seguro",{k:round(roc_auc_score(g.y,g.r),3) for k,g in te.groupby("SEGURO")})
    d=te[te.cita=="2023-10-19"]; top=d.nlargest(147,"r")
    print("  dia19 n",len(d),"noshow",d.y.sum(),"top147 noshow",top.y.sum())
    for lab,f in [("sin seguro",lambda x:x.SEGURO!="SI"),("0-11",lambda x:x.edad<=11),("60+",lambda x:x.edad>=60),("fem",lambda x:x.SEXO=="FEMENINO")]:
        print("   ",lab,"dia",round(f(d).mean(),3),"lista",round(f(top).mean(),3))
    if name=="sin_sexo":
        te[["ID","DIA_CITA","ESPECIALIDAD","edad","SEGURO","PRESENCIAL_REMOTO","espera","r","y"]].rename(columns={"r":"riesgo","y":"no_atendida"}).to_csv("predicciones_test_sin_sexo.csv",index=False)
