"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { post } from "@/lib/post";
import { useServerView } from "@/components/panel/useStaffView";
import { DemoButton, DemoCard, demoField } from "./DemoUi";

export type Param = {
  key: string;
  value: number;
  label: string;
  unit: string;
  sort: number;
};
/** params row of the v5.1 assignment rule: 1 = highest priority when the window closes, 0 = first to accept */
const RULE_KEY = "regla_asignacion";
// v5.1 (section 3.5): the list has no bonuses, so the v4 weights are not shown; the assignment rule is a choice
const HIDDEN = new Set(["annual_no_shows", "w_r", "w_n", "w_e"]);

/** Parameters the hospital approves (proposal 4.6), editable as assumptions in the demo. */
export function ParamsCard() {
  const { data, reload } = useServerView<{ params: Param[] }>(
    "/api/staff/data?view=params",
    ["full"],
  );
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pctKeys = new Set([
    "protected_pct",
    "fill_target",
    "a_base",
    "a_short",
    "s",
    "c",
    "f",
    "breakeven_r",
  ]);
  const show = (p: Param) =>
    pctKeys.has(p.key)
      ? String(Math.round(p.value * 1000) / 10)
      : String(p.value);
  return (
    <ParamsView
      params={data?.params ?? null}
      edit={edit}
      setEdit={setEdit}
      busy={busy}
      show={show}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const params = Object.fromEntries(
            Object.entries(edit).map(([k, v]) => [
              k,
              pctKeys.has(k) ? Number(v) / 100 : Number(v),
            ]),
          );
          await post("/api/staff", { action: "params", params });
          toast.success("Parámetros guardados");
          setEdit({});
          reload();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

type ParamsViewProps = {
  params: Param[] | null;
  edit: Record<string, string>;
  setEdit: (edit: Record<string, string>) => void;
  busy: boolean;
  show: (p: Param) => string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
};

/** "Reglas aprobadas por el hospital", props only (ParamsCard owns the data and the save). */
export function ParamsView({
  params,
  edit,
  setEdit,
  busy,
  show,
  onSubmit,
}: ParamsViewProps) {
  return (
    <DemoCard className="p-5">
      <h2 className="font-display text-[19px] font-bold tracking-[-0.01em]">
        Reglas aprobadas por el hospital (parámetros)
      </h2>
      <p className="mt-1 text-[13px] text-vc-text-2">
        Valores iniciales de la propuesta (sección 4.6). Cambiarlos se registra
        como supuesto de la demo.
      </p>
      <form
        className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2"
        onSubmit={onSubmit}
      >
        {params
          ?.filter((p) => !HIDDEN.has(p.key))
          .map((p) =>
            p.key === RULE_KEY ? (
              <label
                key={p.key}
                className="flex items-center justify-between gap-3 text-[14px] sm:col-span-2"
              >
                <span>Regla de asignación de cupos liberados</span>
                <select
                  value={edit[p.key] ?? show(p)}
                  onChange={(e) =>
                    setEdit({ ...edit, [p.key]: e.target.value })
                  }
                  className={demoField}
                >
                  <option value="1">
                    Mayor prioridad al cierre de la ventana
                  </option>
                  <option value="0">Primero que acepta</option>
                </select>
              </label>
            ) : (
              <label
                key={p.key}
                className="flex items-center justify-between gap-3 text-[14px]"
              >
                <span>{p.label}</span>
                <span className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={edit[p.key] ?? show(p)}
                    onChange={(e) =>
                      setEdit({ ...edit, [p.key]: e.target.value })
                    }
                    className={demoField}
                  />
                  <span className="w-20 text-[12px] text-vc-text-2">
                    {p.unit}
                  </span>
                </span>
              </label>
            ),
          )}
        <div className="pt-1 sm:col-span-2">
          <DemoButton
            type="submit"
            disabled={busy || !Object.keys(edit).length}
          >
            Guardar parámetros
          </DemoButton>
        </div>
      </form>
    </DemoCard>
  );
}
