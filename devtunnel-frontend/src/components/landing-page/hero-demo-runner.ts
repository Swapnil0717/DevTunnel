/**
 * Drives the hero demo: match -> understand -> ship -> profile.
 *
 * The demo's markup is static JSX (`hero-demo.tsx`); this file only toggles
 * classes and fills the terminal and the calendar. It returns a cleanup that
 * stops every loop, timer, observer and listener, so React Strict Mode's
 * double effect run and route changes leave nothing behind.
 */

type TermEvent = {
  /** A typed command. */
  c?: string;
  /** Prompt HTML followed by typed text (`type`). */
  t?: string;
  type?: string;
  /** Output line HTML. */
  o?: string;
  /** Pause before the line, in ms. */
  d?: number;
  /** Lifecycle stage to mark once the line is shown. */
  stage?: number;
};

const AR = '<span class="ar">→</span> ';
const OK = '<span class="ok">✓</span> ';

// Terminal text mirrors the real CLI messages (devtunnel-cli/src/commands/*.ts).
const TERM: TermEvent[] = [
  { c: "dev start acme/ui-kit#482" },
  { o: AR + "Claiming task and preparing your fork…", d: 500 },
  { o: OK + "Branch <b>fix/482-close-button</b> created from <b>upstream/main</b>.", d: 800 },
  { o: OK + "Ready at <b>~/ui-kit</b> on branch <b>fix/482-close-button</b>.", d: 300, stage: 1 },
  { o: '<span class="dm"># fix the focus order in dialog.tsx, then check your work</span>', d: 800 },
  { c: "dev test" },
  { o: AR + "Found <b>1</b> project: <b>ui-kit</b> — running concurrently…", d: 600 },
  { o: OK + "<b>ui-kit</b> — install, lint, test passed", d: 1300 },
  { o: OK + "Everything passed.", d: 300 },
  { c: "dev submit" },
  { o: '<span class="ok">?</span> What kind of change is this? <span class="dm">›</span> <b>fix</b>', d: 500 },
  {
    t: '<span class="ok">?</span> Short description: <span class="dm">›</span> ',
    type: "close button focus order",
  },
  { o: AR + "Pushing <b>fix/482-close-button</b> to your fork…", d: 700 },
  { o: AR + "Opening the pull request…", d: 700 },
  {
    o: OK + "Pull request opened: <u>https://github.com/acme/ui-kit/pull/501</u>",
    d: 800,
    stage: 2,
  },
];

/** How long each scene stays up (the "ship" scene is paced by the terminal). */
const WAIT = [5200, 6600, 0, 5600];

export function startDemo(root: HTMLElement): () => void {
  const all = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
  const one = (sel: string) => root.querySelector<HTMLElement>(sel);

  const scenes = all(".sc");
  const stages = all("#stages li");
  const tabs = all(".d-tab");
  const out = one("#out");
  const cal = one("#cal");
  const ctl = one("#ctl");
  if (!out || !cal || !ctl) return () => {};

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let run = 0;
  let paused = false;
  let visible = false;
  let started = false;
  let disposed = false;
  let timer: number | undefined;
  let caret: HTMLSpanElement | null = null;

  const active = () => !paused && visible && !document.hidden;

  /** Waits `ms` of *active* time (pauses while hidden, off screen or paused). */
  function delay(ms: number, my: number, tick?: (p: number) => void): Promise<void> {
    return new Promise((resolve) => {
      let elapsed = 0;
      const loop = () => {
        if (my !== run || disposed) return resolve();
        if (active()) {
          elapsed += 50;
          tick?.(Math.min(1, elapsed / ms));
          if (elapsed >= ms) return resolve();
        }
        timer = window.setTimeout(loop, 50);
      };
      loop();
    });
  }

  /* calendar: empty, with one square lit for today */
  function buildCal() {
    const holder = cal!.parentElement;
    let w = (holder ? holder.clientWidth : 0) - 36;
    if (w < 100) w = 900;
    const cols = Math.max(8, Math.floor((w + 4) / 16));
    cal!.innerHTML = "";
    for (let i = 0; i < cols * 7; i++) {
      const c = document.createElement("i");
      if (i === cols * 7 - 3) c.className = "new";
      cal!.appendChild(c);
    }
  }

  function setTabs(step: number, p: number) {
    tabs.forEach((t, i) => {
      t.classList.toggle("on", i === step);
      t.classList.toggle("done", i < step);
      t.setAttribute("aria-pressed", String(i === step));
      t.style.setProperty("--p", String(i === step ? p : 0));
    });
  }

  function showScene(i: number) {
    scenes.forEach((s, k) => {
      if (k === i) {
        s.classList.remove("play", "on");
        void s.offsetWidth; // restart the reveal animations
        s.classList.add("on", "play");
      } else if (s.classList.contains("on")) {
        s.classList.remove("on");
        window.setTimeout(() => {
          if (!disposed && !s.classList.contains("on")) s.classList.remove("play");
        }, 480);
      }
    });
  }

  function setStage(n: number) {
    stages.forEach((s, i) => {
      s.classList.toggle("past", i < n);
      s.classList.toggle("now", i === n);
    });
  }

  /* ---- terminal ---- */
  function line(cls: string, html: string) {
    const d = document.createElement("div");
    d.className = "ln " + cls;
    d.innerHTML = html;
    return d;
  }
  function fit() {
    out!.scrollTop = out!.scrollHeight;
    out!.classList.toggle("sc2", out!.scrollHeight > out!.clientHeight + 2);
  }
  function clearCaret() {
    caret?.parentNode?.removeChild(caret);
    caret = null;
  }
  function put(n: HTMLElement) {
    clearCaret();
    out!.appendChild(n);
    while (out!.children.length > 40) out!.removeChild(out!.firstChild as ChildNode);
    fit();
  }
  function withCaret(n: HTMLElement) {
    clearCaret();
    caret = document.createElement("span");
    caret.className = "caret";
    n.appendChild(caret);
  }
  function resetTerm() {
    out!.innerHTML = "";
    out!.classList.remove("sc2");
    clearCaret();
    setStage(0);
  }
  function commandLine(text: string) {
    const n = line("cmd", '<span class="p">$</span><span class="tx"></span>');
    (n.querySelector(".tx") as HTMLElement).textContent = text;
    return n;
  }
  function promptLine(html: string, typed: string) {
    const n = line("", "");
    n.innerHTML = html + '<b class="tx"></b>';
    (n.querySelector(".tx") as HTMLElement).textContent = typed;
    return n;
  }

  /** Whole terminal at once (reduced motion, or jumping to a later tab). */
  function termInstant() {
    resetTerm();
    for (const ev of TERM) {
      if (ev.c) put(commandLine(ev.c));
      else if (ev.t) put(promptLine(ev.t, ev.type ?? ""));
      else put(line("", ev.o ?? ""));
      if (ev.stage) setStage(ev.stage);
    }
    out!.querySelectorAll<HTMLElement>(".ln").forEach((l) => {
      l.style.animation = "none";
    });
    fit();
  }

  async function playTerm(my: number) {
    resetTerm();
    for (let k = 0; k < TERM.length; k++) {
      const ev = TERM[k];
      if (ev.c || ev.t) {
        const text = ev.c ?? ev.type ?? "";
        const n = ev.c ? commandLine("") : promptLine(ev.t ?? "", "");
        put(n);
        const box = n.querySelector(".tx") as HTMLElement;
        withCaret(n);
        await delay(ev.c ? 400 : 250, my);
        if (my !== run) return;
        for (let i = 1; i <= text.length; i++) {
          box.textContent = text.slice(0, i);
          if (caret) n.appendChild(caret);
          fit();
          await delay(50, my);
          if (my !== run) return;
        }
        await delay(350, my);
        if (my !== run) return;
        clearCaret();
      } else {
        await delay(ev.d ?? 300, my);
        if (my !== run) return;
        put(line("", ev.o ?? ""));
      }
      if (ev.stage) setStage(ev.stage);
      setTabs(2, (k + 1) / TERM.length);
    }
  }

  async function playFrom(step: number): Promise<void> {
    const my = ++run;
    window.clearTimeout(timer);
    for (let s = step; s < 4; s++) {
      if (my !== run) return;
      setTabs(s, 0);
      showScene(s);
      if (s === 2) {
        await playTerm(my);
        if (my !== run) return;
        await delay(1400, my);
        if (my !== run) return;
      } else {
        await delay(WAIT[s], my, (p) => {
          if (my === run) setTabs(s, p);
        });
        if (my !== run) return;
      }
    }
    if (my === run) void playFrom(0);
  }

  function showStatic(step: number) {
    run++;
    window.clearTimeout(timer);
    if (step >= 2) termInstant();
    else resetTerm();
    if (step === 2) setStage(2);
    setTabs(step, 1);
    showScene(step);
  }

  /* ---- wiring ---- */
  buildCal();
  let resizeTimer: number | undefined;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(buildCal, 150);
  };
  window.addEventListener("resize", onResize);

  const tabHandlers = tabs.map((t) => {
    const handler = () => {
      const s = Number(t.dataset.step);
      if (reduce) showStatic(s);
      else void playFrom(s);
    };
    t.addEventListener("click", handler);
    return handler;
  });

  const onCtl = () => {
    paused = !paused;
    ctl.classList.toggle("paused", paused);
    ctl.setAttribute("aria-label", paused ? "Play demo" : "Pause demo");
  };
  ctl.addEventListener("click", onCtl);

  let observer: IntersectionObserver | undefined;
  if (reduce) {
    ctl.hidden = true;
    showStatic(0);
  } else {
    resetTerm();
    setTabs(0, 0);
    showScene(0);
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? false;
          if (visible && !started) {
            started = true;
            void playFrom(0);
          }
        },
        { threshold: 0.25 },
      );
      observer.observe(root);
    } else {
      visible = true;
      started = true;
      void playFrom(0);
    }
  }

  return () => {
    disposed = true;
    run++;
    window.clearTimeout(timer);
    window.clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
    tabs.forEach((t, i) => t.removeEventListener("click", tabHandlers[i]));
    ctl.removeEventListener("click", onCtl);
    observer?.disconnect();
  };
}
