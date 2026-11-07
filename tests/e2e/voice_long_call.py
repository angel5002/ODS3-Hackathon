"""Long voice call on an emulated mid-range Android phone (E5, voice quality). Prints metrics and exits 1 above
the thresholds.

Usage (writes to the shared demo database: one test call to a fictitious character, closed at the end):
  ALLOW_DB_WRITE=1 ml/.venv/Scripts/python tests/e2e/voice_long_call.py --base http://localhost:3110 \
      --pin <local test PIN> --audio <spanish wav> [--who valeria] [--cpu 4] [--net slow4g] [--wave on|off] \
      [--seconds 200] [--out <dir>] [--no-thresholds]

What it does:
  - Chromium with a fake microphone that plays --audio (phrases with pauses, ending with
    "Quiero hablar con una persona"), Pixel 7 emulation, CPU throttling (CDP Emulation.setCPUThrottlingRate)
    and a simulated mobile network (CDP Network.emulateNetworkConditions; it applies to HTTP and WebSocket,
    not to WebRTC's UDP media);
  - a staff test call (start_test_call) to --who (never "rosa": the team uses Rosa), answered on /t/<who>;
  - an init script measures, without help from the app: requestAnimationFrame deltas, long tasks
    (PerformanceObserver), the RMS of the agent's audio every 50 ms (taps the SDK's output AnalyserNode with
    getFloatTimeDomainData: no smoothing), WebRTC inbound audio stats when the call uses WebRTC, and the call
    screen's state word and caption (DOM). If the app exposes window.__asistiaVoz (?metricas=1) it also reads
    the SDK's mode changes and interruptions.

Metrics and thresholds (why):
  frame_p95_ms      <= 50   : 20 fps under 4x CPU throttling; the audio is decoded on the main thread in
                              WebSocket mode, so a main thread that misses frames this often also delays chunks.
  longtask_ms_per_min <= 3000: at most 5 % of the main thread blocked in tasks > 50 ms.
  audio_gaps        <= 2    : playback underruns inside agent speech, what a person hears as a stutter:
                              WebSocket -> the SDK's playback buffer ran dry in the middle of a turn (the screen
                              drops from "Hablando" for < 1.2 s and comes back with no new words from the
                              person); WebRTC -> concealment events of the jitter buffer (each jump of
                              concealedSamples of >= 100 ms between two 2 s samples) plus accelerations.
                              Silent holes >= 700 ms in the audio RMS are reported (audio_holes_long) but not
                              thresholded: TTS pauses after a sentence already reach 300-500 ms.
  interruptions     <= 1    : the agent cut by the line itself (the WAV is timed to answer after the agent).
  transfer_s        <= 12   : from the moment the caption shows "Quiero hablar con una persona" (or the person's
                              turn that accepted a transfer the agent offered) to "Llamada finalizada": the LLM
                              (~1-2 s), one short sentence (~2 s), the tool (~1 s), the tool's sentence (~3 s) and
                              the hang-up. Before the fix: 15-20 s (and 14-17 s on the team's phone).
No personal data: the phone is a fictitious character; no transcript is stored, only lengths and timings.
"""
import os as _os
import sys as _sys

if _os.environ.get("ALLOW_DB_WRITE") != "1":
    print("voice_long_call.py: crea y cierra una llamada de prueba en la base compartida. No se ejecuta sin ALLOW_DB_WRITE=1.")
    _sys.exit(3)

import argparse
import asyncio
import json
import statistics
import time
from pathlib import Path

from playwright.async_api import async_playwright

THRESHOLDS = {"frame_p95_ms": 50, "longtask_ms_per_min": 3000, "audio_gaps": 2, "interruptions": 1, "transfer_s": 12}

NETWORKS = {
    # Chrome DevTools presets ("Slow 4G" / "Fast 4G"); throughput in bytes per second
    "slow4g": {"offline": False, "latency": 150, "downloadThroughput": 1.6 * 1024 * 1024 / 8, "uploadThroughput": 750 * 1024 / 8},
    "4g": {"offline": False, "latency": 60, "downloadThroughput": 9 * 1024 * 1024 / 8, "uploadThroughput": 1.5 * 1024 * 1024 / 8},
}

PROBE = r"""
(() => {
  if (window.__m) return;
  const M = (window.__m = { raf: [], long: [], energy: [], states: [], captions: [], rtc: [], transport: null, ended: null });
  let last = 0;
  const loop = (t) => { if (last) M.raf.push([Math.round(t), +(t - last).toFixed(1)]); last = t; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) M.long.push([Math.round(e.startTime), Math.round(e.duration)]); })
      .observe({ type: "longtask", buffered: true });
  } catch (e) {}
  // WebRTC: remember the peer connections and remote tracks
  const remote = new Set();
  const PC = window.RTCPeerConnection;
  if (PC) {
    const Wrapped = function (...a) {
      const pc = new PC(...a);
      (M.pcs || (M.pcs = [])).push(pc);
      M.transport = "webrtc";
      pc.addEventListener("track", (e) => remote.add(e.track.id));
      return pc;
    };
    Wrapped.prototype = PC.prototype;
    Object.setPrototypeOf(Wrapped, PC);
    window.RTCPeerConnection = Wrapped;
  }
  const WS = window.WebSocket;
  window.WebSocket = new Proxy(WS, { construct(T, a) { if (String(a[0]).includes("elevenlabs")) M.transport = M.transport || "websocket"; return new T(...a); } });
  // the SDK's output analyser: websocket -> analyser connected to a MediaStreamDestination;
  // webrtc -> analyser fed by a MediaStreamSource of a remote track
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    try {
      if (this instanceof AnalyserNode && dest instanceof MediaStreamAudioDestinationNode) M.out = this;
      if (this instanceof MediaStreamAudioSourceNode && dest instanceof AnalyserNode) {
        const tr = this.mediaStream.getAudioTracks()[0];
        if (tr && remote.has(tr.id)) M.out = dest;
      }
    } catch (e) {}
    return connect.call(this, dest, ...rest);
  };
  let buf = null, lastState = null, lastCaption = null;
  setInterval(() => {
    const now = Math.round(performance.now());
    if (M.out) {
      if (!buf || buf.length !== M.out.fftSize) buf = new Float32Array(M.out.fftSize);
      M.out.getFloatTimeDomainData(buf);
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      M.energy.push([now, +Math.sqrt(s / buf.length).toFixed(4)]);
    }
    const st = document.querySelector('[role=dialog] [role=status]');
    const word = st ? st.textContent.trim() : null;
    if (word !== lastState) { M.states.push([now, word]); lastState = word; }
    const cap = document.querySelector('section[aria-label="Subtítulos"]');
    const text = cap ? cap.textContent.replace(/(Ocultar|Mostrar) subtítulos/, "").trim() : null;
    if (text !== lastCaption) { M.captions.push([now, text]); lastCaption = text; }
    if (!M.ended && document.body.innerText.includes("Llamada finalizada")) M.ended = now;
  }, 50);
  setInterval(async () => {
    for (const pc of M.pcs || []) {
      try {
        const r = await pc.getStats();
        r.forEach((s) => {
          if (s.type === "inbound-rtp" && s.kind === "audio")
            M.rtc.push([Math.round(performance.now()), s.totalSamplesReceived || 0, s.concealedSamples || 0, s.silentConcealedSamples || 0,
              s.insertedSamplesForDeceleration || 0, s.removedSamplesForAcceleration || 0, s.packetsLost || 0, s.jitter || 0,
              s.jitterBufferEmittedCount ? +(1000 * s.jitterBufferDelay / s.jitterBufferEmittedCount).toFixed(1) : null]);
        });
      } catch (e) {}
    }
  }, 2000);
})();
"""


def pct(xs, p):
    if not xs:
        return None
    xs = sorted(xs)
    return round(xs[min(len(xs) - 1, int(p / 100 * len(xs)))], 1)


def speaking_spans(states, end_ms):
    spans, start = [], None
    for t, w in states:
        talking = bool(w) and w.startswith("Hablando")
        if talking and start is None:
            start = t
        elif not talking and start is not None:
            spans.append((start, t))
            start = None
    if start is not None:
        spans.append((start, end_ms))
    return spans


def audio_gaps(energy, floor=0.004, min_gap=700, resume=1500):
    """Silent holes inside agent speech: voice, >= min_gap ms below the floor, voice again within `resume` ms."""
    gaps, silent_since, voiced_before = [], None, False
    for t, e in energy:
        if e >= floor:
            if silent_since is not None and voiced_before and min_gap <= t - silent_since <= resume:
                gaps.append((silent_since, t - silent_since))
            silent_since, voiced_before = None, True
        elif silent_since is None:
            silent_since = t
        elif t - silent_since > resume:
            voiced_before = False
    return gaps


def mode_gaps(states, captions):
    """'Hablando' -> other -> 'Hablando' in < 1.2 s with no new caption from the person in between."""
    out = []
    for i in range(1, len(states) - 1):
        t0, w0 = states[i - 1]
        t1, w1 = states[i]
        t2, w2 = states[i + 1]
        if (w0 or "").startswith("Hablando") and not (w1 or "").startswith("Hablando") and (w2 or "").startswith("Hablando") and t2 - t1 < 1200:
            if not any(t1 <= t <= t2 and c and c.startswith("Usted") for t, c in captions):
                out.append((t1, t2 - t1))
    return out


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3110")
    ap.add_argument("--pin", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--who", default="valeria")
    ap.add_argument("--cpu", type=float, default=4)
    ap.add_argument("--net", default="slow4g", choices=["slow4g", "4g", "none"])
    ap.add_argument("--wave", default="on", choices=["on", "off"])
    ap.add_argument("--seconds", type=int, default=200)
    ap.add_argument("--out", default="")
    ap.add_argument("--query", default="metricas=1")
    ap.add_argument("--no-thresholds", action="store_true")
    ap.add_argument("--shots", default="", help="seconds after answering to take screenshots, e.g. 15,32 (needs --out)")
    a = ap.parse_args()
    if a.who == "rosa":
        raise SystemExit("No uses a Rosa: el equipo la usa en vivo.")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=[
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            f"--use-file-for-fake-audio-capture={a.audio}",
            "--autoplay-policy=no-user-gesture-required",
        ])
        staff = await browser.new_context(base_url=a.base)
        r = await staff.request.post("/api/access", data={"pin": a.pin, "role": "admision"})
        assert r.ok, f"PIN local rechazado ({r.status})"
        live = await (await staff.request.get("/api/staff/data?view=live")).json()
        phones = {p["token"]: p["id"] for p in live["phones"]}
        patient = phones[a.who]

        device = dict(pw.devices["Pixel 7"])
        ctx = await browser.new_context(**device, base_url=a.base, permissions=["microphone"],
                                        reduced_motion="reduce" if a.wave == "off" else "no-preference")
        await ctx.add_init_script(PROBE)
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        page.on("console", lambda m: errors.append(m.text[:200]) if m.type == "error" else None)
        await page.goto(f"/t/{a.who}?{a.query}" if a.query else f"/t/{a.who}")
        try:
            await page.get_by_role("button", name="Activar sonido y llamadas").click(timeout=8000)
        except Exception:
            pass
        cdp = await ctx.new_cdp_session(page)
        if a.cpu > 1:
            await cdp.send("Emulation.setCPUThrottlingRate", {"rate": a.cpu})
        if a.net != "none":
            await cdp.send("Network.enable")
            await cdp.send("Network.emulateNetworkConditions", NETWORKS[a.net])

        r = await staff.request.post("/api/staff", data={"action": "test_call", "patientId": patient})
        call_id = (await r.json()).get("callId")
        print(f"llamada de prueba {call_id} a {a.who}", flush=True)
        t_answer = None
        try:
            btn = page.get_by_role("button", name="Contestar")
            await btn.wait_for(timeout=30000)
            await btn.click()
            t_answer = await page.evaluate("performance.now()")
            deadline = time.time() + a.seconds
            shots = [int(x) for x in a.shots.split(",") if x] if a.shots else []
            started = time.time()
            while time.time() < deadline:
                if await page.evaluate("!!(window.__m && window.__m.ended)"):
                    break
                if shots and time.time() - started >= shots[0] and a.out:
                    s = shots.pop(0)
                    Path(a.out).mkdir(parents=True, exist_ok=True)
                    await page.screenshot(path=str(Path(a.out) / f"llamada_{call_id}_{s}s.png"))
                await asyncio.sleep(1)
            await asyncio.sleep(1)
            m = await page.evaluate("""() => { const M = window.__m; const V = window.__asistiaVoz;
                return { raf: M.raf, long: M.long, energy: M.energy, states: M.states, captions: M.captions, rtc: M.rtc,
                         transport: M.transport, ended: M.ended, now: performance.now(), voz: V ? V.events : null }; }""")
        finally:
            # close only this call (never the team's)
            calls = (await (await staff.request.get("/api/staff/data?view=live")).json())["calls"]
            mine = [c for c in calls if c.get("id") == call_id]
            if mine and mine[0].get("status") in ("sonando", "en_curso"):
                await staff.request.post("/api/staff", data={"action": "end_call", "callId": call_id})
                print(f"llamada {call_id} cerrada por la prueba (seguía abierta)", flush=True)
            final = [c for c in (await (await staff.request.get("/api/staff/data?view=live")).json())["calls"] if c.get("id") == call_id]
            await ctx.close()
            await staff.close()
            await browser.close()

    t0 = t_answer or 0
    end = m["ended"] or m["now"]
    raf = [d for t, d in m["raf"] if t >= t0]
    spans = speaking_spans([(t, w) for t, w in m["states"] if t >= t0], end)
    in_speech = lambda t: any(s <= t <= e for s, e in spans)
    raf_speech = [d for t, d in m["raf"] if t >= t0 and in_speech(t)]
    longs = [(t, d) for t, d in m["long"] if t >= t0]
    minutes = max(0.1, (end - t0) / 60000)
    energy = [(t, e) for t, e in m["energy"] if t >= t0]
    gaps_e = [g for g in audio_gaps(energy) if in_speech(g[0])]
    gaps_m = mode_gaps([(t, w) for t, w in m["states"] if t >= t0], m["captions"])
    rtc_events = 0
    for prev, cur in zip(m["rtc"], m["rtc"][1:]):
        conc = (cur[2] - cur[3]) - (prev[2] - prev[3])  # non-silent concealment, in samples (48 kHz)
        if conc >= 4800:
            rtc_events += 1
        if cur[5] - prev[5] >= 4800:  # >= 100 ms removed to catch up: audible speed-up
            rtc_events += 1
    voz = m.get("voz") or []
    interruptions = sum(1 for e in voz if e[1] == "interruption") if m.get("voz") is not None else None
    asked = next((t for t, c in m["captions"] if c and c.startswith("Usted") and "persona" in c.lower()), None)
    # the agent may offer the transfer itself and the person accept it ("Sí…"): then count from the person's
    # last turn before the successful transfer_to_human (SDK events of ?metricas=1)
    tool_t = next((e[0] for e in voz if e[1] == "tool" and (e[2] or {}).get("tool") == "transfer_to_human" and not (e[2] or {}).get("error")), None)
    if tool_t is not None:
        before = [e[0] for e in voz if e[1] == "user_turn" and e[0] <= tool_t]
        if before and (asked is None or before[-1] < asked):
            asked = before[-1]
    transfer_s = round((m["ended"] - asked) / 1000, 1) if asked and m["ended"] else None
    # WebRTC: the screen's "Hablando" follows LiveKit's active speaker, which drops in every pause between
    # sentences: there the underruns come only from the jitter buffer statistics
    gaps_threshold = rtc_events if m["transport"] == "webrtc" else len(gaps_m) + rtc_events
    rtc = m["rtc"][-1] if m["rtc"] else None
    metrics = {
        "call_id": call_id,
        "transport": m["transport"],
        "wave": a.wave,
        "cpu_throttle": a.cpu,
        "network": a.net,
        "call_s": round((end - t0) / 1000, 1),
        "ended_on_screen": bool(m["ended"]),
        "final_status": final[0].get("status") if final else None,
        "frames": len(raf),
        "frame_p50_ms": pct(raf, 50),
        "frame_p95_ms": pct(raf, 95),
        "frame_p95_speaking_ms": pct(raf_speech, 95),
        "frames_over_50ms": sum(1 for d in raf if d > 50),
        "longtasks": len(longs),
        "longtask_ms_per_min": round(sum(d for _, d in longs) / minutes),
        "longtask_max_ms": max((d for _, d in longs), default=0),
        "agent_speaking_s": round(sum(e - s for s, e in spans) / 1000, 1),
        "audio_gaps": gaps_threshold,
        "audio_gaps_mode": [[round((t - t0) / 1000, 1), d] for t, d in gaps_m][:20],
        "audio_gaps_webrtc": rtc_events,
        "audio_holes_long": [[round((t - t0) / 1000, 1), d] for t, d in gaps_e][:20],
        "interruptions": interruptions,
        "transfer_s": transfer_s,
        "webrtc_last": dict(zip(["t", "samples", "concealed", "silent_concealed", "inserted_decel", "removed_accel", "lost", "jitter", "jb_ms"], rtc)) if rtc else None,
        "page_errors": errors[:8],
        "sdk_events": {k: sum(1 for e in voz if e[1] == k) for k in sorted({e[1] for e in voz})} if voz else None,
    }
    print(json.dumps(metrics, ensure_ascii=False, indent=1))
    if a.out:
        out = Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        name = f"long_{a.wave}_{m['transport']}_{int(time.time())}"
        (out / f"{name}.json").write_text(json.dumps({"metrics": metrics, "states": m["states"], "energy_n": len(energy), "captions_n": len(m["captions"]),
                                                       "rtc": m["rtc"], "longtasks": longs}, ensure_ascii=False, indent=1), encoding="utf-8")
    if a.no_thresholds:
        return 0
    failed = []
    for k, lim in THRESHOLDS.items():
        v = metrics.get(k)
        if v is None:
            if k in ("transfer_s",):
                failed.append(f"{k}: sin dato (la llamada no terminó tras pedir una persona)")
            continue
        if v > lim:
            failed.append(f"{k}={v} > {lim}")
    if not metrics["ended_on_screen"]:
        failed.append("la pantalla no llegó a «Llamada finalizada»")
    for f in failed:
        print("FALLA", f)
    print("RESULTADO", "FALLA" if failed else "OK")
    return 1 if failed else 0


if __name__ == "__main__":
    _sys.exit(asyncio.run(main()))
