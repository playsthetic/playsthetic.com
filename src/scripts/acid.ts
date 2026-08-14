/*
 * The acid is not quite fixed. It wanders a few degrees of hue, a little more
 * yellow one minute and a little more green the next, on a cycle far too long
 * to catch in the act. You should only ever notice it by leaving the tab open
 * and coming back.
 *
 * Everything that paints the background reads the colour from here: the CSS
 * variable, the mark shader, and the foil band. If they sampled it separately
 * they would disagree by a frame and the artwork would sit on a seam.
 */

const BASE_HUE = 67.5; // #d2f000
const SWING = 9; // degrees either side, so 58.5 (yellow) to 76.5 (green)
const SATURATION = 1;
const LIGHTNESS = 0.47;
const TAU = Math.PI * 2;

// Two detuned cycles, the slower one dominant, so the wander never repeats on
// a beat you could learn.
const SLOW = 160; // seconds
const SLOWER = 97;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const k = (n: number) => (n + h / 30) % 12;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
	return [f(0), f(8), f(4)];
}

let current = hslToRgb(BASE_HUE, SATURATION, LIGHTNESS);

/** The background colour this frame, as linear 0..1 sRGB components. */
export function acid(): [number, number, number] {
	return current;
}

/*
 * Writing the CSS variable repaints the whole page background, so it runs at a
 * few hertz rather than every frame. Over a cycle this slow the difference is
 * far below anything visible, and the shaders read the un-throttled value.
 */
const CSS_INTERVAL = 200;
let lastWrite = -Infinity;

function write(now: number) {
	if (now - lastWrite < CSS_INTERVAL) return;
	lastWrite = now;
	const [r, g, b] = current;
	// Percentages rather than 0-255: at this pace, integer channels would step.
	document.documentElement.style.setProperty(
		'--acid',
		`rgb(${(r * 100).toFixed(2)}% ${(g * 100).toFixed(2)}% ${(b * 100).toFixed(2)}%)`
	);
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
		const t = (now - started) / 1000;
		const hue =
			BASE_HUE +
			SWING * (0.7 * Math.sin((TAU * t) / SLOW) + 0.3 * Math.sin((TAU * t) / SLOWER + 1.3));
		current = hslToRgb(hue, SATURATION, LIGHTNESS);
		write(now);
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}
