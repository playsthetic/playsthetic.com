/*
 * The acid is not quite fixed. It wanders a few degrees of hue, a little more
 * yellow one minute and a little more green the next, on a cycle far too long
 * to catch in the act. You should only ever notice it by leaving the tab open
 * and coming back.
 *
 * The page is one flat colour, so everything that paints it reads that colour
 * from here: the CSS variable, the mark shader, the foil band, and the meta tag
 * the browser chrome samples. If they each took their own reading they would
 * disagree by a frame, and the mark, being a hole cut in the page, would show a
 * seam around itself.
 */

const BASE_HUE = 66; // just yellow of the brand hue of 67.5 (#d2f000)
const SWING = 14; // degrees either side, so 52 (#f0d400) to 80 (#9cf000)
const SATURATION = 1;
const LIGHTNESS = 0.47;

/** Seconds for a full there and back. Detuned, so the wander never repeats. */
const PERIOD_A = 160;
const PERIOD_B = 97;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

let current = hslToRgb(BASE_HUE, SATURATION, LIGHTNESS);

/** The page colour this frame, as 0..1 sRGB components. */
export function acid(): [number, number, number] {
	return current;
}

/** Triangle rather than a sine: a sine dwells at each end instead of passing. */
function pingPong(seconds: number, period: number, offset: number): number {
	const u = (seconds / period + offset) % 1;
	return 1 - 4 * Math.abs(u - 0.5);
}

const hex = (c: [number, number, number]) =>
	`#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;

/*
 * Whatever reads the page's colour for the window chrome reads theme-color, not
 * the pixels: browser UI, and the extensions that tint a title bar to match. A
 * hardcoded value goes stale the moment the hue starts moving, so it is
 * restated alongside the page itself.
 */
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

/*
 * Writing the variable repaints the page, so it runs at a few hertz rather than
 * every frame. The colour only advances on those writes, which means the
 * shaders read exactly what the page is painted with instead of a continuous
 * value sitting a fraction ahead of it. Over a cycle this slow the step between
 * writes is far below anything visible.
 */
const CSS_INTERVAL = 200;
let lastWrite = -Infinity;

function write(now: number, seconds: number) {
	if (now - lastWrite < CSS_INTERVAL) return;
	lastWrite = now;

	const hue =
		BASE_HUE +
		SWING * (0.72 * pingPong(seconds, PERIOD_A, 0.25) + 0.28 * pingPong(seconds, PERIOD_B, 0.7));
	current = hslToRgb(hue, SATURATION, LIGHTNESS);

	const [r, g, b] = current;
	// Percentages rather than 0-255: at this pace, integer channels would step.
	document.documentElement.style.setProperty(
		'--acid',
		`rgb(${(r * 100).toFixed(2)}% ${(g * 100).toFixed(2)}% ${(b * 100).toFixed(2)}%)`
	);
	if (themeMeta) themeMeta.content = hex(current);
}

/**
 * Starts the drift. Safe to call more than once: only the first call takes.
 * Under a reduced-motion preference the colour simply stays put.
 */
let running = false;

export function driftAcid() {
	if (running) return;
	running = true;

	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	const started = performance.now();
	const tick = (now: number) => {
		write(now, (now - started) / 1000);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
