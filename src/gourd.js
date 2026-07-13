import * as THREE from 'three';
import { state } from './state.js';

export const GOURD_HEIGHT = 3.0;
export function getGourdHeight() {
    return (state.gourdHeight || 30.0) * 0.1;
}
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
    
    const bulbPos = state.gourdBulbPosition !== undefined ? state.gourdBulbPosition : 0.25;
    const bulbRound = state.gourdBulbRoundness !== undefined ? state.gourdBulbRoundness : 1.0;
    const hasNeck = state.gourdHasNeck !== false;

    let r_cm;
    if (hasNeck) {
        // Standard double-bulb bottle gourd profile
        if (t < bulbPos) {
            const alpha = t / bulbPos;
            r_cm = THREE.MathUtils.lerp(rBase, rBulb, smoothstep(0, 1, alpha));
        } else if (t < 0.55) {
            // Blend from bulb peak to neck indentation
            // We squish/round the bulb lobe based on bulbRound
            const lobe = Math.exp(-Math.pow((t - bulbPos) / (0.15 * bulbRound), 2));
            r_cm = rNeck + (rBulb - rNeck) * lobe;
        } else if (t < 0.8) {
            const alpha = (t - 0.55) / 0.25;
            r_cm = THREE.MathUtils.lerp(rNeck, rRim * 1.2, smoothstep(0, 1, alpha));
        } else {
            const alpha = (t - 0.8) / 0.2;
            r_cm = THREE.MathUtils.lerp(rRim * 1.2, rRim, smoothstep(0, 1, alpha));
        }
    } else {
        // Neckless pear/spherical gourd profile
        if (t < bulbPos) {
            const alpha = t / bulbPos;
            r_cm = THREE.MathUtils.lerp(rBase, rBulb, smoothstep(0, 1, alpha));
        } else {
            const alpha = (t - bulbPos) / (1.0 - bulbPos);
            r_cm = THREE.MathUtils.lerp(rBulb, rRim, smoothstep(0, 1, alpha));
        }
    }

    const scaleFactor = 0.1;
    const r_three = r_cm * scaleFactor;
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

    const H = state.gourdHeight || 30.0;
    const scaleFactor = 0.1;
    const H_three = H * scaleFactor;

    const points = [];
    for (let i = 0; i <= PROFILE_SEGS; i++) {
        const t = i / PROFILE_SEGS;
        const r = getGourdRadius(t);
        const y = t * H_three;
        points.push(new THREE.Vector2(Math.max(EPS, r), y));
    }

    const geometry = new THREE.LatheGeometry(points, RADIAL_SEGS);
    geometry.translate(0, -H_three / 2, 0);

    // Apply lateral shift (X and Z bending offsets) for uneven gourds
    const bendX = state.gourdBendX || 0;
    const bendZ = state.gourdBendZ || 0;
    if (bendX !== 0 || bendZ !== 0) {
        const posAttr = geometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
            const y = posAttr.getY(i);
            const t = (y + H_three / 2) / H_three;
            const factor = Math.pow(t, 2); // straight base, bending towards neck
            const dx = bendX * scaleFactor * factor;
            const dz = bendZ * scaleFactor * factor;
            posAttr.setX(i, posAttr.getX(i) + dx);
            posAttr.setZ(i, posAttr.getZ(i) + dz);
        }
    }

    geometry.computeVertexNormals();
    return geometry;
}
