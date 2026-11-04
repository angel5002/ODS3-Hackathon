// Deterministic timeline for the video scenes.
// Every animation is created paused (Web Animations API) and only moves when
// seek(seconds) is called. Nothing depends on the real clock.
(() => {
  const anims = [];
  const tweens = [];
  const touched = new WeakMap(); // element -> set of animated properties

  const EASE = {
    out: "cubic-bezier(0.23, 1, 0.32, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    linear: "linear",
  };

  function els(target) {
    if (typeof target === "string") return [...document.querySelectorAll(target)];
    if (target instanceof Element) return [target];
    return [...target];
  }

  /**
   * Animate elements. at/dur in seconds. stagger in seconds between elements.
   * The first animation of a property on an element fills backwards (its first
   * keyframe applies before it starts); later ones only fill forwards, so they
   * never override earlier states before their own start.
   */
  function to(target, keyframes, { at = 0, dur = 0.5, ease = "out", stagger = 0 } = {}) {
    const props = new Set(keyframes.flatMap((k) => Object.keys(k)).filter((p) => p !== "offset" && p !== "easing"));
    els(target).forEach((el, i) => {
      const seen = touched.get(el) ?? new Set();
      const first = [...props].every((p) => !seen.has(p));
      props.forEach((p) => seen.add(p));
      touched.set(el, seen);
      const a = el.animate(keyframes, {
        duration: dur * 1000,
        delay: (at + i * stagger) * 1000,
        easing: EASE[ease] ?? ease,
        fill: first ? "both" : "forwards",
      });
      a.pause();
      anims.push(a);
    });
  }

  /** Call fn(progress 0..1) for values that are not CSS (counters, text). */
  function tween(at, dur, fn, ease = (x) => 1 - Math.pow(1 - x, 3)) {
    tweens.push({ at, dur, fn, ease });
  }

  function seek(t) {
    const ms = t * 1000;
    for (const a of anims) a.currentTime = ms;
    for (const w of tweens) {
      const p = Math.min(1, Math.max(0, (t - w.at) / w.dur));
      w.fn(w.ease(p));
    }
  }

  /** Scene title: complete and centered on the first frame, then parks in the top-left corner. */
  function parkTitle(sel = "#title", at = 1.0, scale = 1.9) {
    const t = document.querySelector(sel);
    const r = t.getBoundingClientRect();
    const dx = 960 - r.left - (r.width * scale) / 2;
    const dy = 540 - r.top - (r.height * scale) / 2;
    to(t, [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: "none" }], { at, dur: 0.7, ease: "inOut" });
  }

  const builders = [];
  /** Scenes register their timeline here; it runs once fonts are loaded (so text can be measured). */
  function build(fn) {
    builders.push(fn);
  }

  window.TL = { to, tween, build, parkTitle, EASE };
  window.seek = seek;
  // The renderer waits for this: fonts loaded, timeline built and the first frame placed.
  window.ready = (async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    await document.fonts.ready;
    for (const fn of builders) fn();
    seek(0);
    return true;
  })();
})();
