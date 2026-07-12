import * as THREE from 'three';

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
    let r;
    if (t < 0.04) {
        r = smoothstep(0, 0.04, t) * 0.35;
    } else if (t < 0.28) {
        r = 0.35 + smoothstep(0.04, 0.28, t) * 0.55;
    } else if (t < 0.48) {
        r = 0.9 - smoothstep(0.28, 0.48, t) * 0.52;
    } else if (t < 0.64) {
        r = 0.38 + smoothstep(0.48, 0.64, t) * 0.2;
    } else if (t < 0.82) {
        r = 0.58 - smoothstep(0.64, 0.82, t) * 0.43;
    } else if (t < 0.92) {
        r = 0.15 + smoothstep(0.82, 0.92, t) * 0.08;
    } else if (t < 0.97) {
        r = 0.23 + smoothstep(0.92, 0.97, t) * 0.04;
    } else {
        r = 0.27 - smoothstep(0.97, 1.0, t) * 0.07;
    }
    return Math.max(EPS, r);
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
