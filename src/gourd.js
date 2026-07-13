import * as THREE from 'three';
import { state } from './state.js';

export const GOURD_HEIGHT = 3.0;
export const PROFILE_SEGS = 80;
export const RADIAL_SEGS = 64;
const EPS = 0.001;

function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / Math.max(EPS, e1 - e0)));
    return t * t * (3 - 2 * t);
}

// Computes profile radius at height t (0 bottom, 1 top)
export function gourdRadius(t) {
    const H = state.gourdHeight || 30.0;
    const rBase = state.gourdBaseRadius || 3.5;
    const rBulb = state.gourdBulbRadius || 9.0;
    const rNeck = state.gourdNeckRadius || 3.8;
    const rRim = state.gourdRimRadius || 2.7;

    let r_cm;
    if (t < 0.05) {
        r_cm = THREE.MathUtils.lerp(0.1, rBase, t / 0.05);
    } else if (t < 0.3) {
        const alpha = (t - 0.05) / 0.25;
        r_cm = THREE.MathUtils.lerp(rBase, rBulb, smoothstep(0, 1, alpha));
    } else if (t < 0.55) {
        const alpha = (t - 0.3) / 0.25;
        r_cm = THREE.MathUtils.lerp(rBulb, rNeck, smoothstep(0, 1, alpha));
    } else if (t < 0.8) {
        const alpha = (t - 0.55) / 0.25;
        r_cm = THREE.MathUtils.lerp(rNeck, rRim * 1.2, smoothstep(0, 1, alpha));
    } else {
        const alpha = (t - 0.8) / 0.2;
        r_cm = THREE.MathUtils.lerp(rRim * 1.2, rRim, smoothstep(0, 1, alpha));
    }

    const r_three = 3.0 * (r_cm / H);
    return Math.max(EPS, r_three);
}

// Pre-compute profile for fast interpolation lookups
const profileCache = [];
for (let i = 0; i <= PROFILE_SEGS; i++) {
    profileCache.push(gourdRadius(i / PROFILE_SEGS));
}

export function getGourdRadius(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const idx = clamped * PROFILE_SEGS;
    const i = Math.floor(idx);
    const f = idx - i;
    if (i >= PROFILE_SEGS) return profileCache[PROFILE_SEGS];
    return profileCache[i] * (1 - f) + profileCache[i + 1] * f;
}

// Builds the 3D Lathe Geometry centered at y=0
export function createGourdGeometry() {
    profileCache.length = 0;
    for (let i = 0; i <= PROFILE_SEGS; i++) {
        profileCache.push(gourdRadius(i / PROFILE_SEGS));
    }

    const points = [];
    for (let i = 0; i <= PROFILE_SEGS; i++) {
        const t = i / PROFILE_SEGS;
        const r = getGourdRadius(t);
        const y = t * GOURD_HEIGHT;
        points.push(new THREE.Vector2(Math.max(EPS, r), y));
    }

    const geometry = new THREE.LatheGeometry(points, RADIAL_SEGS);
    geometry.translate(0, -GOURD_HEIGHT / 2, 0);
    geometry.computeVertexNormals();
    return geometry;
}
