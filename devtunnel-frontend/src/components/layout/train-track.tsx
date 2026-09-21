/**
 * The footer's animated train: a four-car set crossing a strip of track,
 * headlight on, left to right, forever — the "Meridian animated train footer"
 * from recent.design, redrawn in the app's own palette (near-black bodies,
 * hairline #2E2E2E outlines, accent-green stripe, windows and headlight)
 * instead of the reference's colors.
 *
 * Pure SVG + CSS: no JavaScript, no image request, and it's a server
 * component, so it costs nothing in the client bundle (rules 34, 38). It is
 * decoration only — `aria-hidden`, no text inside — so it carries no meaning
 * a crawler or screen reader would need (rules 21, 22). The motion is the
 * `.footer-train` class in globals.css, which also parks the train under
 * `prefers-reduced-motion`.
 *
 * Geometry is computed rather than hand-placed so the car count, the width
 * and the windows can't drift apart: `CAR_COUNT` cars of `CAR_W` with a
 * `GAP` coupling between them, the last one drawn as the head car with a
 * raked nose and a windshield, and a faint headlight beam ahead of it.
 */
const CAR_COUNT = 4;
const CAR_W = 70;
const GAP = 4;
const BODY_TOP = 12;
const BODY_H = 24;
const BODY_BOTTOM = BODY_TOP + BODY_H;
const BEAM_W = 44;
const TRAIN_W = CAR_COUNT * CAR_W + (CAR_COUNT - 1) * GAP; // 292
const VIEW_W = TRAIN_W + BEAM_W;
const VIEW_H = 44;

const BODY_FILL = "#141414";
const BODY_STROKE = "#2E2E2E";
const ACCENT = "#1D9E75";

export function TrainTrack() {
  const cars = Array.from({ length: CAR_COUNT }, (_, index) => {
    const x = index * (CAR_W + GAP);
    return { x, head: index === CAR_COUNT - 1 };
  });

  return (
    <div
      aria-hidden="true"
      className="relative h-[68px] overflow-hidden border-t border-[#1A1A1A]"
    >
      {/* Sleepers, then the running rail on top of them. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[repeating-linear-gradient(90deg,#1F1F1F_0_2px,transparent_2px_14px)]" />
      <div className="absolute inset-x-0 bottom-[3px] h-px bg-[#2A2A2A]" />

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="footer-train absolute bottom-px left-0 h-[62px] w-auto max-w-none"
        fill="none"
      >
        <defs>
          <linearGradient id="train-beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.32" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Headlight beam, ahead of the head car. */}
        <polygon
          points={`${TRAIN_W},29 ${VIEW_W},22 ${VIEW_W},${BODY_BOTTOM + 2} ${TRAIN_W},33`}
          fill="url(#train-beam)"
        />

        {cars.map(({ x, head }) => (
          <g key={x}>
            {head ? (
              <path
                d={`M${x} ${BODY_BOTTOM} V${BODY_TOP + 4} a4 4 0 0 1 4 -4 H${x + 48} L${x + CAR_W} 26 V${BODY_BOTTOM} Z`}
                fill={BODY_FILL}
                stroke={BODY_STROKE}
              />
            ) : (
              <rect
                x={x}
                y={BODY_TOP}
                width={CAR_W}
                height={BODY_H}
                rx={4}
                fill={BODY_FILL}
                stroke={BODY_STROKE}
              />
            )}

            {/* Passenger windows (fewer on the head car, which has the windshield). */}
            {Array.from({ length: head ? 3 : 5 }, (_, w) => (
              <rect
                key={w}
                x={x + 6 + w * 12}
                y={17}
                width={8}
                height={7}
                rx={1.5}
                fill={ACCENT}
                fillOpacity={0.35}
              />
            ))}

            {head ? (
              <>
                <path
                  d={`M${x + 45} 17 L${x + 47} 17 L${x + 62} 26 H${x + 45} Z`}
                  fill={ACCENT}
                  fillOpacity={0.5}
                />
                <circle cx={x + CAR_W - 1.5} cy={30} r={1.8} fill={ACCENT} />
              </>
            ) : null}

            {/* Livery stripe. */}
            <rect x={x + 3} y={29} width={head ? CAR_W - 10 : CAR_W - 6} height={1.5} rx={0.75} fill={ACCENT} fillOpacity={0.8} />

            {/* Bogies. */}
            <circle cx={x + 14} cy={BODY_BOTTOM + 3} r={3.2} fill="#0A0A0A" stroke="#3A3A3A" />
            <circle cx={x + CAR_W - 14} cy={BODY_BOTTOM + 3} r={3.2} fill="#0A0A0A" stroke="#3A3A3A" />

            {/* Coupling to the next car. */}
            {x + CAR_W < TRAIN_W ? (
              <rect x={x + CAR_W} y={28} width={GAP} height={2} fill={BODY_STROKE} />
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  );
}
