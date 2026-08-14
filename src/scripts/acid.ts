/*
 * The page is not one flat colour. Two close acids sit in a very wide gradient
 * that pans across the viewport, far too slowly to catch in the act. You should
 * only ever notice it by leaving the tab open and coming back.
 *
 * The CSS background and the mark shader both read the gradient from here, and
 * both evaluate the same wave at the same viewport position. That is the point
 * of the module: the mark cuts its silhouette out of the page, so if it painted
 * its own average of the colour there would be a visible seam around it wherever
 * the gradient was moving underneath.
 *
 * The wave is a cosine. A triangle is the shape a three-stop CSS gradient makes
 * on its own, and it is continuous but its slope is not: the colour arrives at
 * each end and turns straight around, which draws a visible crease across an
 * otherwise flat page. A cosine has no such corner. CSS can only interpolate in
 * straight lines, so the gradient is emitted as stops sampled off that cosine,
 * close enough together that the two agree to well under a single 8-bit step.
 */

const HUE_A = 62; // the yellower end
const HUE_B = 71; // the greener end
const SATURATION = 1;
const LIGHTNESS = 0.47;

/** Degrees, CSS convention: 0 points up, 90 points right. So this runs down. */
const ANGLE = 180;

/**
 * CSS pixels from one A to the next. Wide enough to read as a wash rather than
 * as a band, but shorter than the horizontal run used to be: a window is a good
 * deal shorter than it is wide, and at the old width barely a fifth of the wave
 * would ever be on screen.
 */
const WAVELENGTH = 2000;

/** Seconds to pan a full wavelength, so about fifteen pixels a second. */
const PERIOD = 180;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

const A = hslToRgb(HUE_A, SATURATION, LIGHTNESS);
const B = hslToRgb(HUE_B, SATURATION, LIGHTNESS);

// Screen-space axis of the gradient, with y running down the page.
const radians = (ANGLE * Math.PI) / 180;
const DIR: [number, number] = [Math.sin(radians), -Math.cos(radians)];

let phase = 0;

/** The two ends, the axis, and how far apart the ends are, for the shaders. */
export const backdrop = {
	a: A,
	b: B,
	dir: DIR,
	wavelength: WAVELENGTH,
	phase: () => phase,
};

/** Where the wave sits, 0 at A and 1 at B, for a position along the axis. */
function wave(t: number): number {
	return 0.5 - 0.5 * Math.cos(2 * Math.PI * (t - Math.floor(t)));
}

const blend = (v: number): [number, number, number] => [
	A[0] + (B[0] - A[0]) * v,
	A[1] + (B[1] - A[1]) * v,
	A[2] + (B[2] - A[2]) * v,
];

/** The colour at a point in the viewport, in CSS pixels. */
export function backdropAt(x: number, y: number): [number, number, number] {
	return blend(wave((x * DIR[0] + y * DIR[1]) / WAVELENGTH - phase));
}

const css = (c: [number, number, number]) =>
	`rgb(${(c[0] * 100).toFixed(2)}% ${(c[1] * 100).toFixed(2)}% ${(c[2] * 100).toFixed(2)}%)`;

/** Stops per wavelength. Twelve holds the error far below one 8-bit step. */
const STOPS = 12;

/*
 * One tile, exactly one wavelength tall, written once and never rebuilt.
 *
 * The pan is then only a background-position, which costs a composite rather
 * than a repaint: the browser already has the tile rasterised and simply moves
 * it. Rebuilding the gradient string instead, which is the obvious way to do
 * it, makes the browser rasterise a fresh full-page gradient several times a
 * second for a wash that travels eleven pixels in one.
 *
 * It tiles without a seam because the wave is a whole period across the tile,
 * so the first and last stop are the same colour, and because the axis is
 * straight down: an angled tile would have to be periodic on both axes at once,
 * which for a shallow angle means a tile tens of thousands of pixels tall.
 */
function gradient(): string {
	const parts: string[] = [];
	for (let i = 0; i <= STOPS; i++) {
		const t = i / STOPS;
		parts.push(`${css(blend(wave(t)))} ${Math.round(t * WAVELENGTH)}px`);
	}
	return `linear-gradient(${ANGLE}deg, ${parts.join(', ')})`;
}

/*
 * The phase only advances on a write, so the shaders read exactly the value the
 * page is currently painted with rather than a continuous one sitting a
 * fraction ahead of it. At eleven pixels a second the step between writes is
 * about one pixel of travel.
 */
const CSS_INTERVAL = 100;
let lastWrite = -Infinity;

/*
 * Whatever reads the page's colour for the window chrome reads theme-color, not
 * the pixels: browser UI, and the extensions that tint a title bar to match.
 * With the page a moving gradient there is no one colour to state, so it states
 * the colour at the very top of the viewport, which is the edge those consumers
 * are actually sitting against, and keeps restating it as the wash goes by.
 */
const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
let lastTheme = '';

function paintChrome() {
	if (!themeMeta) return;
	const [r, g, b] = backdropAt(0, 0);
	const hex = `#${[r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
	if (hex === lastTheme) return;
	lastTheme = hex;
	themeMeta.content = hex;
}

function write(now: number, seconds: number) {
	if (now - lastWrite < CSS_INTERVAL) return;
	lastWrite = now;
	phase = (seconds / PERIOD) % 1;
	document.documentElement.style.setProperty('--bg-shift', `0 ${(phase * WAVELENGTH).toFixed(1)}px`);
	paintChrome();
}

/**
 * Starts the pan. Safe to call more than once: only the first call takes.
 * Under a reduced-motion preference the gradient simply stays put.
 */
let running = false;

export function driftAcid() {
	if (running) return;
	running = true;

	document.documentElement.style.setProperty('--bg-image', gradient());
	document.documentElement.style.setProperty('--bg-wave', `${WAVELENGTH}px`);
	paintChrome();

	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	const started = performance.now();
	const tick = (now: number) => {
		write(now, (now - started) / 1000);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
