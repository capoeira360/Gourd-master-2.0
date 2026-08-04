import * as THREE from 'three';
import { getGourdRadius, getGourdHeight, createGourdGeometry } from './gourd.js';
import { state } from './state.js';

function starWave(x, points = 5) {
    const anglePerPoint = (2 * Math.PI) / points;
    const phase = (x % anglePerPoint) / anglePerPoint;
    if (phase < 0.5) {
        return -1 + phase * 4;
    } else {
        return 3 - phase * 4;
    }
}

function organicWave(x, baseFreq = 3) {
    // Seamless multi-octave wave combination wrapping at 2*PI
    return Math.sin(baseFreq * x)
         + 0.45 * Math.sin(baseFreq * 2 * x + 1.5)
         + 0.25 * Math.sin(baseFreq * 3 * x + 0.8);
}

function seededRandom(seed) {
    let s = seed;
    return function() {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
}

function getBoxPoints(N) {
    if (N <= 1) return [{ u: 0.5, v: 0.5 }];
    if (N === 2) {
        return [
            { u: 0.33, v: 0.5 },
            { u: 0.67, v: 0.5 }
        ];
    }
    if (N === 3) {
        return [
            { u: 0.25, v: 0.5 },
            { u: 0.5, v: 0.5 },
            { u: 0.75, v: 0.5 }
        ];
    }
    if (N === 4) {
        return [
            { u: 0.33, v: 0.33 },
            { u: 0.67, v: 0.33 },
            { u: 0.33, v: 0.67 },
            { u: 0.67, v: 0.67 }
        ];
    }
    if (N === 5) {
        return [
            { u: 0.25, v: 0.25 },
            { u: 0.75, v: 0.25 },
            { u: 0.5, v: 0.5 },
            { u: 0.25, v: 0.75 },
            { u: 0.75, v: 0.75 }
        ];
    }
    if (N === 6) {
        return [
            { u: 0.33, v: 0.25 },
            { u: 0.67, v: 0.25 },
            { u: 0.33, v: 0.5 },
            { u: 0.67, v: 0.5 },
            { u: 0.33, v: 0.75 },
            { u: 0.67, v: 0.75 }
        ];
    }
    // Default fallback to a grid or ring
    const pts = [];
    const side = Math.ceil(Math.sqrt(N));
    for (let r = 0; r < side; r++) {
        for (let c = 0; c < side; c++) {
            if (pts.length >= N) break;
            const u = side > 1 ? 0.25 + (r / (side - 1)) * 0.5 : 0.5;
            const v = side > 1 ? 0.25 + (c / (side - 1)) * 0.5 : 0.5;
            pts.push({ u, v });
        }
    }
    return pts;
}

// Calculates a 3D coordinate directly wrapped on the gourd's surface with an offset
export function getSurfacePoint(t, angle, offset = 0.006, rOffset = 0) {
    const H_three = getGourdHeight();
    const r = getGourdRadius(t) + offset + rOffset;
    let y = t * H_three - H_three / 2;
    
    let x = r * Math.cos(angle);
    let z = r * Math.sin(angle);
    
    // Apply lateral shifts for uneven/bent shape
    const bendX = state.gourdBendX || 0;
    const bendZ = state.gourdBendZ || 0;
    if (bendX !== 0 || bendZ !== 0) {
        const factor = Math.pow(t, 2);
        const scaleFactor = 0.1;
        x += bendX * scaleFactor * factor;
        z += bendZ * scaleFactor * factor;
    }
    
    return new THREE.Vector3(x, y, z);
}

// Calculates the surface normal vector at height t and angle theta
export function getSurfaceNormal(t, theta) {
    const H_three = getGourdHeight();
    const dt = 0.01;
    const r1 = getGourdRadius(Math.max(0, t - dt));
    const r2 = getGourdRadius(Math.min(1, t + dt));
    const dr = (r2 - r1) / (2 * dt);

    // Normal components in local lathe coordinate space
    const ny = -dr / H_three;
    const nx = Math.cos(theta);
    const nz = Math.sin(theta);

    const normal = new THREE.Vector3(nx, ny, nz);
    return normal.normalize();
}

// Checks if a point on the surface (height t, angle theta) lies inside a pattern zone boundary (ignores exclusion/inversion masks)
export function isPointInZoneRaw(t, theta, zone) {
    if (!zone) return true;
    if (zone.type === 'full') return true;

    const depthVal = zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;

    if (zone.type === 'hor-band') {
        let wave = 0;
        const waveAmp = depthVal * (zone.density || 1.0);
        if (zone.patternType === 'flower') {
            wave = Math.sin(6 * theta) * waveAmp;
        } else if (zone.patternType === 'star') {
            wave = starWave(theta, 5) * waveAmp;
        } else if (zone.patternType === 'organic') {
            wave = organicWave(theta, 3) * waveAmp;
        }
        return t >= (zone.tMin + wave) && t <= (zone.tMax + wave);
    }

    if (zone.type === 'ver-strip') {
        let wave = 0;
        const r = getGourdRadius(t);
        const waveAmp = (depthVal * 2.5) / Math.max(0.1, r);
        if (zone.patternType === 'flower') {
            wave = Math.sin(t * Math.PI * 6) * waveAmp;
        } else if (zone.patternType === 'star') {
            wave = starWave(t * Math.PI, 5) * waveAmp;
        } else if (zone.patternType === 'organic') {
            wave = organicWave(t * Math.PI, 3) * waveAmp;
        }

        let min = zone.thetaMin + wave;
        let max = zone.thetaMax + wave;
        if (min > max) {
            const tmp = min;
            min = max;
            max = tmp;
        }
        
        let val = theta;
        while (val < min) val += Math.PI * 2;
        while (val > min + Math.PI * 2) val -= Math.PI * 2;
        
        return val >= min && val <= max;
    }

    // Apply repeated sector mapping for all localized patches/shapes
    const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;
    let mappedTheta = theta;
    if (patchCount > 1) {
        const sector = (2 * Math.PI) / patchCount;
        let dTheta = theta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        dTheta = ((dTheta + sector / 2) % sector + sector) % sector - sector / 2;
        mappedTheta = zone.centerTheta + dTheta;
    }

    if (zone.type === 'custom-image') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;

        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const radius = Math.max(0.005, zone.radius || 0.15);
        const u = rx / radius;
        const v = ry / radius;

        if (Math.abs(u) > 1.0 || Math.abs(v) > 1.0) {
            return false;
        }

        const px = Math.floor((u + 1.0) / 2.0 * 128);
        const py = Math.floor((v + 1.0) / 2.0 * 128);
        const invertedPy = 127 - py;

        if (zone.customImageDataUrl) {
            if (!window.appImageCache) window.appImageCache = {};
            const cached = window.appImageCache[zone.customImageDataUrl];
            if (cached && cached.status === 'loaded' && cached.alphaGrid) {
                const alphaGrid = cached.alphaGrid;
                const idx = (invertedPy * 128 + px) * 4;
                const red = alphaGrid[idx];
                const green = alphaGrid[idx + 1];
                const blue = alphaGrid[idx + 2];
                const alpha = alphaGrid[idx + 3];

                if (alpha < 50) return false;
                const brightness = (red + green + blue) / 3;
                return brightness < 200;
            } else if (!cached) {
                // Trigger loading
                window.appImageCache[zone.customImageDataUrl] = { status: 'loading' };
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 128;
                    canvas.height = 128;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, 128, 128);
                    const alphaGrid = ctx.getImageData(0, 0, 128, 128).data;
                    window.appImageCache[zone.customImageDataUrl] = {
                        status: 'loaded',
                        img: img,
                        alphaGrid: alphaGrid
                    };
                    if (window.refreshPatternGroup) {
                        window.refreshPatternGroup();
                    }
                };
                img.src = zone.customImageDataUrl;
            }
        } else {
            // Draw a fallback cross shape so they see something is active
            return Math.abs(u) <= 0.15 || Math.abs(v) <= 0.15;
        }
        return false;
    }

    if (zone.type === 'swirls') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= (zone.radius !== undefined ? zone.radius : 0.2);
    }

    if (zone.type === 'circular-patch') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= zone.radius;
    }

    if (zone.type === 'square-patch' || zone.type === 'square') {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;
        
        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const halfSide = zone.radius || 0.15;
        
        if (zone.type === 'square-patch') {
            return Math.abs(rx) <= halfSide && Math.abs(ry) <= halfSide;
        } else {
            const inOuter = Math.abs(rx) <= halfSide && Math.abs(ry) <= halfSide;
            if (zone.fillType === 'concentric') {
                return inOuter;
            } else {
                const thickness = 0.015;
                const inInner = Math.abs(rx) <= (halfSide - thickness) && Math.abs(ry) <= (halfSide - thickness);
                return inOuter && !inInner;
            }
        }
    }

    if (zone.type === 'diagonal-stripe') {
        const y = t * getGourdHeight() - getGourdHeight() / 2;
        const r = getGourdRadius(t);
        const x = r * theta;
        const slantRad = (zone.slantAngle || 0) * Math.PI / 180;

        let wave = 0;
        const waveAmp = depthVal * 5.0; // Scale factor matching Three.js scene dimensions
        if (zone.patternType === 'flower') {
            wave = Math.sin(6 * theta) * waveAmp;
        } else if (zone.patternType === 'star') {
            wave = starWave(theta, 5) * waveAmp;
        } else if (zone.patternType === 'organic') {
            wave = organicWave(theta, 3) * waveAmp;
        }

        const proj = y * Math.cos(slantRad) - x * Math.sin(slantRad);
        const centerProj = (zone.centerT * getGourdHeight() - getGourdHeight() / 2) * Math.cos(slantRad);
        return Math.abs(proj - centerProj - wave) <= (zone.width || 0.15);
    }

    if (zone.type === 'diagonal-frame') {
        const y = t * getGourdHeight() - getGourdHeight() / 2;
        const r = getGourdRadius(t);
        const slantRad = (zone.slantAngle || 0) * Math.PI / 180;
        
        const centerT = zone.centerT !== undefined ? zone.centerT : 0.5;
        const centerT_y = centerT * getGourdHeight() - getGourdHeight() / 2;
        
        const amp = r * Math.tan(slantRad);
        const centerTheta = zone.centerTheta !== undefined ? zone.centerTheta : 0;
        const targetY = centerT_y + amp * Math.cos(theta - centerTheta);
        
        let wave = 0;
        const waveAmp = depthVal * 5.0;
        if (zone.patternType === 'flower') {
            wave = Math.sin(6 * theta) * waveAmp;
        } else if (zone.patternType === 'star') {
            wave = starWave(theta, 5) * waveAmp;
        } else if (zone.patternType === 'organic') {
            wave = organicWave(theta, 3) * waveAmp;
        }
        
        const dy = Math.abs(y - targetY - wave);
        const thickness = zone.width || 0.15;
        return dy <= thickness / 2;
    }

    const localShapes = ['circle', 'fish', 'star', 'flower', 'heart', 'triangle'];
    if (localShapes.includes(zone.type)) {
        const dt = t - zone.centerT;
        let dTheta = mappedTheta - zone.centerTheta;
        dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        const r = getGourdRadius(t);
        const dy = dt * getGourdHeight();
        const dx = r * dTheta;

        const shapeRotRad = -(zone.shapeRotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(shapeRotRad) - dy * Math.sin(shapeRotRad);
        const ry = dx * Math.sin(shapeRotRad) + dy * Math.cos(shapeRotRad);

        const radius = Math.max(0.005, zone.radius || 0.15);
        const u = rx / radius;
        const v = ry / radius;

        if (zone.type === 'circle') {
            const inOuter = (u * u + v * v) <= 1.0;
            if (zone.fillType === 'concentric') {
                return inOuter;
            } else {
                const thickness = 0.015;
                const inInner = (u * u + v * v) <= ((1.0 - thickness) * (1.0 - thickness));
                return inOuter && !inInner;
            }
        }
        if (zone.type === 'fish') {
            const inBody = (((u + 0.15) * (u + 0.15)) / 0.36 + (v * v) / 0.08) <= 1.0;
            const inTail = (u >= 0.2 && u <= 0.7 && Math.abs(v) <= 0.5 * (u - 0.15));
            const inEye = (((u + 0.3) * (u + 0.3)) + ((v - 0.04) * (v - 0.04))) <= 0.0016;
            return (inBody || inTail) && !inEye;
        }
        if (zone.type === 'star') {
            const rStar = Math.sqrt(u * u + v * v);
            const aStar = Math.atan2(v, u);
            const starBound = 0.6 + 0.4 * Math.cos(5 * aStar - Math.PI / 2) * 0.4;
            return rStar <= starBound;
        }
        if (zone.type === 'flower') {
            const rFl = Math.sqrt(u * u + v * v);
            const aFl = Math.atan2(v, u);
            const flBound = 0.7 + 0.3 * Math.cos(6 * aFl);
            return rFl <= flBound;
        }
        if (zone.type === 'heart') {
            const x = u * 1.2;
            const y = (v + 0.2) * 1.2;
            return (x*x + y*y - 0.4)*(x*x + y*y - 0.4)*(x*x + y*y - 0.4) - x*x*y*y*y <= 0;
        }
        if (zone.type === 'triangle') {
            return v >= -0.5 && v <= 1.0 - 1.5 * Math.abs(u);
        }
    }

    return false;
}

// Checks if a point on the surface (height t, angle theta) lies inside a pattern zone (handles exclusion masks & cross-layer masking)
export function isPointInZone(t, theta, zone, templateCenter = null) {
    if (!zone) return true;

    // 1. Evaluate this zone's own clipping bounds
    const inThisZone = isPointInZoneRaw(t, theta, zone);
    if (!inThisZone) return false;

    // 2. Check cross-layer clipping
    // Local shape/image layers themselves are NEVER clipped by other layers (enabling stacking/overlaying)
    const isBackgroundZone = ['full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'diagonal-frame'].includes(zone.type);
    if (!isBackgroundZone) {
        return true;
    }

    // Background layers can be clipped by other shape layers in the stack
    const zones = (state && state.patternZones) ? state.patternZones : [];

    for (const otherZone of zones) {
        if (otherZone.id === zone.id) continue;
        if (otherZone.style === 'off' || otherZone.visible === false) continue;
        if (otherZone.clipBackground === false) continue;

        // 'full' layers never clip other layers
        if (otherZone.type === 'full') continue;

        const isOtherLocal = !['full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'diagonal-frame'].includes(otherZone.type);
        if (isOtherLocal) {
            // Check if this otherZone instance belongs to the current templateCenter
            if (templateCenter !== null && window.activeTemplateCenters && window.activeTemplateCenters.length > 0) {
                let closestInstanceTheta = otherZone.centerTheta;
                let minDistInstance = Infinity;
                const patchCount = otherZone.patchCount !== undefined ? otherZone.patchCount : 1;
                for (let p = 0; p < patchCount; p++) {
                    const offsetTheta = (p / patchCount) * Math.PI * 2;
                    let currentTheta = otherZone.centerTheta + offsetTheta;
                    let dTheta = theta - currentTheta;
                    dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                    if (Math.abs(dTheta) < minDistInstance) {
                        minDistInstance = Math.abs(dTheta);
                        closestInstanceTheta = currentTheta;
                    }
                }
                
                let cTheta = closestInstanceTheta;
                while (cTheta < -Math.PI) cTheta += Math.PI * 2;
                while (cTheta > Math.PI) cTheta -= Math.PI * 2;

                let closestCenter = window.activeTemplateCenters[0];
                let minDist = Infinity;
                for (const center of window.activeTemplateCenters) {
                    let diff = Math.abs(cTheta - center);
                    diff = ((diff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                    if (Math.abs(diff) < minDist) {
                        minDist = Math.abs(diff);
                        closestCenter = center;
                    }
                }

                if (Math.abs(closestCenter - templateCenter) < 0.0001) {
                    if (isPointInZoneRaw(t, theta, otherZone)) {
                        return false;
                    }
                }
            } else {
                if (isPointInZoneRaw(t, theta, otherZone)) {
                    return false;
                }
            }
        } else {
            // Non-local shapes (like bands/stripes) clip globally
            if (isPointInZoneRaw(t, theta, otherZone)) {
                return false;
            }
        }
    }

    return true;
}

// Clips a continuous coordinate path into multiple segments that lie within a zone
export function clipPathToZone(path, zone, templateCenter = null) {
    const subPaths = [];
    let currentSubPath = [];

    const isLocalZone = zone && !['full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'diagonal-frame'].includes(zone.type);

    const finalizeSubPath = (sub) => {
        if (sub.length >= 2) {
            if (isLocalZone) {
                // Find closest repeated sector center
                const midPt = sub[Math.floor(sub.length / 2)];
                const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;
                let closestTheta = zone.centerTheta;
                let minDist = Infinity;
                for (let p = 0; p < patchCount; p++) {
                    const offsetTheta = (p / patchCount) * Math.PI * 2;
                    let currentTheta = zone.centerTheta + offsetTheta;
                    
                    let dTheta = midPt.theta - currentTheta;
                    dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                    if (Math.abs(dTheta) < minDist) {
                        minDist = Math.abs(dTheta);
                        closestTheta = currentTheta;
                    }
                }
                sub.centerTheta = closestTheta;
            }
            subPaths.push(sub);
        }
    };

    for (const pt of path) {
        if (isPointInZone(pt.t, pt.theta, zone, templateCenter)) {
            currentSubPath.push(pt);
        } else {
            finalizeSubPath(currentSubPath);
            currentSubPath = [];
        }
    }
    finalizeSubPath(currentSubPath);
    return subPaths;
}

// Samples a cylindrical path array uniformly along 3D space arc lengths
export function samplePathUniformly(path, stepSize) {
    const points = [];
    if (path.length === 0) return points;

    const pts3d = path.map(p => getSurfacePoint(p.t, p.theta, 0, p.rOffset || 0));

    let accumulatedDistance = 0;
    points.push(path[0]);

    let lastSampleDist = 0;

    for (let i = 0; i < path.length - 1; i++) {
        const pA = path[i];
        const pB = path[i + 1];

        const ptA = pts3d[i];
        const ptB = pts3d[i + 1];

        const segmentLength = ptA.distanceTo(ptB);

        while (lastSampleDist + stepSize <= accumulatedDistance + segmentLength) {
            const neededDist = (lastSampleDist + stepSize) - accumulatedDistance;
            const alpha = neededDist / Math.max(0.0001, segmentLength);

            const t = pA.t + alpha * (pB.t - pA.t);

            let thetaA = pA.theta;
            let thetaB = pB.theta;
            if (Math.abs(thetaB - thetaA) > Math.PI) {
                if (thetaB > thetaA) thetaA += Math.PI * 2;
                else thetaB += Math.PI * 2;
            }
            let theta = thetaA + alpha * (thetaB - thetaA);
            theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

            const rOffset = (pA.rOffset || 0) + alpha * ((pB.rOffset || 0) - (pA.rOffset || 0));

            points.push({ t, theta, rOffset });
            lastSampleDist += stepSize;
        }

        accumulatedDistance += segmentLength;
    }

    return points;
}

// Generates primary/horizontal paths (rings, CW spirals) with tilt shear
export function generateHorizontalPaths(type, density, tiltAngleDeg = 0, zone = null, forHoles = false) {
    const paths = [];
    const localTilt = zone && zone.tiltSkew !== undefined ? zone.tiltSkew : 0;
    const tanGamma = Math.tan((tiltAngleDeg + localTilt) * Math.PI / 180);

    if (type === 'box-grid') {
        const ringCount = Math.round(density * 10);
        if (!forHoles) {
            for (let i = 0; i <= ringCount; i++) {
                const t = i / ringCount;
                const path = [];
                const steps = 120;
                for (let j = 0; j <= steps; j++) {
                    const a = (j / steps) * Math.PI * 2;
                    path.push({ t, theta: a, rOffset: 0 });
                }
                paths.push(path);
            }
            return paths;
        }
        const merCount = Math.round(density * 8);
        const N = zone && zone.patchCount !== undefined ? zone.patchCount : 1;
        const isDraughts = zone && zone.draftMode;
        for (let i = 0; i < ringCount; i++) {
            const t_min = i / ringCount;
            const t_max = (i + 1) / ringCount;
            for (let j = 0; j < merCount; j++) {
                if (isDraughts && (i + j) % 2 !== 0) {
                    continue;
                }
                const theta_min = j * (2 * Math.PI) / merCount;
                const theta_max = (j + 1) * (2 * Math.PI) / merCount;
                
                const t_w = t_max - t_min;
                const theta_w = theta_max - theta_min;
                const relPoints = getBoxPoints(N);
                
                for (const p of relPoints) {
                    const t = t_min + p.u * t_w;
                    const theta = theta_min + p.v * theta_w;
                    paths.push([{ t, theta, rOffset: 0 }]);
                }
            }
        }
    } else if (type === 'grid') {
        const ringCount = Math.round(density * 14);
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            const segs = 64;
            for (let j = 0; j <= segs; j++) {
                const a = (j / segs) * Math.PI * 2;
                const tTilt = tBase + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
    } else if (type === 'flower') {
        const ringCount = Math.round(density * 14);
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            const segs = 120;
            for (let j = 0; j <= segs; j++) {
                const a = (j / segs) * Math.PI * 2;
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = depthVal * density;
                const wave = Math.sin(6 * a) * waveAmp; // 6 waves around representing 6 petals
                const tTilt = tBase + wave + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
    } else if (type === 'star') {
        const ringCount = Math.round(density * 14);
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            const segs = 120;
            for (let j = 0; j <= segs; j++) {
                const a = (j / segs) * Math.PI * 2;
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = depthVal * density;
                const wave = starWave(a, 5) * waveAmp; // 5-pointed star wave
                const tTilt = tBase + wave + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
    } else if (type === 'organic') {
        const ringCount = Math.round(density * 14);
        for (let i = 1; i < ringCount; i++) {
            const tBase = i / ringCount;
            const rBase = getGourdRadius(tBase);
            if (rBase < 0.04) continue;
            const path = [];
            const segs = 120;
            for (let j = 0; j <= segs; j++) {
                const a = (j / segs) * Math.PI * 2;
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = depthVal * density;
                const wave = organicWave(a, 3) * waveAmp; // 3-wave seamless organic liquid contour
                const tTilt = tBase + wave + (rBase * tanGamma / getGourdHeight()) * Math.cos(a);
                const t = Math.max(0.01, Math.min(0.99, tTilt));
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
    } else if (type === 'spiral') {
        const spirals = Math.round(density * 6);
        const wraps = 5 * density;
        for (let i = 0; i < spirals; i++) {
            const startAngle = (i / spirals) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 120; j++) {
                const t = 0.02 + (j / 120) * 0.96;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const a = startAngle + t * Math.PI * wraps;
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                path.push({ t, theta: a + twist, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    }

    return paths;
}

// Generates secondary/vertical paths (meridians, CCW spirals) with tilt shear
export function generateVerticalPaths(type, density, tiltAngleDeg = 0, leanAngle = 0, zone = null, forHoles = false) {
    const paths = [];
    const tanGamma = Math.tan(tiltAngleDeg * Math.PI / 180);
    const leanTan = Math.tan(leanAngle * Math.PI / 180);

    if (type === 'box-grid') {
        if (forHoles) {
            return [];
        }
        const merCount = Math.round(density * 8);
        for (let i = 0; i < merCount; i++) {
            const a = (i / merCount) * Math.PI * 2;
            const path = [];
            const steps = 60;
            for (let j = 0; j <= steps; j++) {
                const t = j / steps;
                path.push({ t, theta: a, rOffset: 0 });
            }
            paths.push(path);
        }
        return paths;
    }

    if (type === 'grid' || type === 'spiral') {
        const merCount = Math.round(density * 10);
        for (let i = 0; i < merCount; i++) {
            const baseAngle = (i / merCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 80; j++) {
                const t = 0.03 + (j / 80) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: baseAngle + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'flower') {
        const merCount = Math.round(density * 10);
        for (let i = 0; i < merCount; i++) {
            const baseAngle = (i / merCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 120; j++) {
                const t = 0.03 + (j / 120) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                // Serpentine waves climbing up the gourd (6 wave cycles along the height)
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = (depthVal * 2.5) / Math.max(0.1, r);
                const wave = Math.sin(t * Math.PI * 6) * waveAmp;
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: baseAngle + wave + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'star') {
        const merCount = Math.round(density * 10);
        for (let i = 0; i < merCount; i++) {
            const baseAngle = (i / merCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 120; j++) {
                const t = 0.03 + (j / 120) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                // Star zig-zag waves climbing up the gourd
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = (depthVal * 2.5) / Math.max(0.1, r);
                const wave = starWave(t * Math.PI, 5) * waveAmp; // 5-pointed star wave
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: baseAngle + wave + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    } else if (type === 'organic') {
        const merCount = Math.round(density * 10);
        for (let i = 0; i < merCount; i++) {
            const baseAngle = (i / merCount) * Math.PI * 2;
            const path = [];
            for (let j = 0; j <= 120; j++) {
                const t = 0.03 + (j / 120) * 0.94;
                const r = getGourdRadius(t);
                if (r < 0.04) {
                    if (path.length > 1) paths.push(path);
                    path.length = 0;
                    continue;
                }
                // Organic fluid waves climbing up the gourd
                const depthVal = zone && zone.flowerDepth !== undefined ? zone.flowerDepth : 0.02;
                const waveAmp = (depthVal * 2.5) / Math.max(0.1, r);
                const wave = organicWave(t * Math.PI, 3) * waveAmp; // 3-wave organic vertical curve
                const twist = ((t - 0.5) * getGourdHeight() / Math.max(0.1, r)) * tanGamma;
                const leanOffset = (t * getGourdHeight() * leanTan) / Math.max(0.05, r);
                path.push({ t, theta: baseAngle + wave + twist + leanOffset, rOffset: 0 });
            }
            if (path.length > 1) paths.push(path);
        }
    }

    return paths;
}

// Internal helper to render a single custom layer in the pattern group
function renderPatternLayer(group, paths, style, colorHex, opacity, holeSize, distMode, holeCount, holeDistance, dashSpacing = 0, zone = null) {
    if (paths.length === 0) return 0;

    const idx = (zone && state && state.patternZones) ? state.patternZones.indexOf(zone) : -1;
    const baseRenderOrder = 900;
    const renderOrderVal = idx !== -1 ? baseRenderOrder + (state.patternZones.length - idx) : 900;

    if (style === 'lines') {
        const color = new THREE.Color(colorHex);
        const mat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        mat.userData = { originalOpacity: opacity };

        let lineSegmentCount = 0;
        for (const path of paths) {
            if (path.length < 2) continue;
            
            if (dashSpacing > 0.02) {
                const pts3d = path.map(pt => getSurfacePoint(pt.t, pt.theta, 0.005, pt.rOffset || 0));
                
                let currentLen = 0;
                let activeSegment = [pts3d[0]];
                
                for (let i = 0; i < path.length - 1; i++) {
                    const ptA = pts3d[i];
                    const ptB = pts3d[i+1];
                    const d = ptA.distanceTo(ptB);
                    currentLen += d;
                    
                    const cycle = currentLen % dashSpacing;
                    const isDraw = cycle < (dashSpacing * 0.5);
                    
                    if (isDraw) {
                        activeSegment.push(ptB);
                    } else {
                        if (activeSegment.length >= 2) {
                            const geom = new THREE.BufferGeometry().setFromPoints(activeSegment);
                            const line = new THREE.Line(geom, mat);
                            line.renderOrder = renderOrderVal;
                            group.add(line);
                            lineSegmentCount++;
                        }
                        activeSegment = [ptB];
                    }
                }
                if (activeSegment.length >= 2) {
                    const geom = new THREE.BufferGeometry().setFromPoints(activeSegment);
                    const line = new THREE.Line(geom, mat);
                    line.renderOrder = renderOrderVal;
                    group.add(line);
                    lineSegmentCount++;
                }
            } else {
                const pts = path.map(pt => getSurfacePoint(pt.t, pt.theta, 0.005, pt.rOffset || 0));
                const geom = new THREE.BufferGeometry().setFromPoints(pts);
                const line = new THREE.Line(geom, mat);
                line.renderOrder = renderOrderVal;
                group.add(line);
                lineSegmentCount++;
            }
        }

        return lineSegmentCount;
    } else {
        // Drilled holes
        const holePoints = [];
        
        const holeFreq = zone && zone.bigHoleFreq !== undefined ? zone.bigHoleFreq : 0;
        const lineFreq = zone && zone.bigLineFreq !== undefined ? zone.bigLineFreq : 1;
        const bigHoleScale = zone && zone.bigHoleScale !== undefined ? zone.bigHoleScale : 1.5;

        if (zone && zone.patternType === 'box-grid') {
            let pathIdx = 0;
            for (const path of paths) {
                let ptIdx = 0;
                for (const pt of path) {
                    if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                    
                    const isBigLine = (lineFreq > 0) && ((pathIdx + 1) % lineFreq === 0);
                    const isBigHole = isBigLine && (holeFreq > 0) && ((ptIdx + 1) % holeFreq === 0);
                    pt.scaleVal = isBigHole ? bigHoleScale : 1.0;
                    
                    holePoints.push(pt);
                    ptIdx++;
                }
                pathIdx++;
            }
        } else if (distMode === 'distance') {
            const stepSize = holeDistance;
            let pathIdx = 0;
            for (const path of paths) {
                const sampled = samplePathUniformly(path, stepSize);
                let ptIdx = 0;
                for (const pt of sampled) {
                    if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                    
                    const isBigLine = (lineFreq > 0) && ((pathIdx + 1) % lineFreq === 0);
                    const isBigHole = isBigLine && (holeFreq > 0) && ((ptIdx + 1) % holeFreq === 0);
                    pt.scaleVal = isBigHole ? bigHoleScale : 1.0;
                    
                    holePoints.push(pt);
                    ptIdx++;
                }
                pathIdx++;
            }
        } else {
            // Count-based (Hole Count per path)
            let pathIdx = 0;
            for (const path of paths) {
                const count = Math.max(1, Math.round(holeCount));
                const isBigLine = (lineFreq > 0) && ((pathIdx + 1) % lineFreq === 0);
                
                if (count === 1) {
                    const mid = Math.floor(path.length / 2);
                    const pt = path[mid];
                    if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                    
                    const isBigHole = isBigLine && (holeFreq > 0) && (1 % holeFreq === 0);
                    pt.scaleVal = isBigHole ? bigHoleScale : 1.0;
                    
                    holePoints.push(pt);
                } else {
                    const pts3d = path.map(p => getSurfacePoint(p.t, p.theta, 0, p.rOffset || 0));
                    let totalLength = 0;
                    const lengths = [];
                    for (let i = 0; i < path.length - 1; i++) {
                        const len = pts3d[i].distanceTo(pts3d[i + 1]);
                        totalLength += len;
                        lengths.push(totalLength);
                    }

                    const firstPt = path[0];
                    if (!zone || isPointInZone(firstPt.t, firstPt.theta, zone)) {
                        const isBigHole = isBigLine && (holeFreq > 0) && (1 % holeFreq === 0);
                        firstPt.scaleVal = isBigHole ? bigHoleScale : 1.0;
                        holePoints.push(firstPt);
                    }

                    for (let k = 1; k < count; k++) {
                        const targetDist = (k / (count - 1)) * totalLength;
                        let segIdx = 0;
                        while (segIdx < lengths.length && lengths[segIdx] < targetDist) {
                            segIdx++;
                        }

                        const prevDist = segIdx === 0 ? 0 : lengths[segIdx - 1];
                        const nextDist = lengths[segIdx];
                        const segLength = nextDist - prevDist;
                        const alpha = segLength > 0.0001 ? (targetDist - prevDist) / segLength : 0;

                        const pA = path[segIdx];
                        const pB = path[segIdx + 1];
                        if (!pB) continue;

                        const t = pA.t + alpha * (pB.t - pA.t);

                        let thetaA = pA.theta;
                        let thetaB = pB.theta;
                        if (Math.abs(thetaB - thetaA) > Math.PI) {
                            if (thetaB > thetaA) thetaA += Math.PI * 2;
                            else thetaB += Math.PI * 2;
                        }
                        let theta = thetaA + alpha * (thetaB - thetaA);
                        theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                        const rOffset = (pA.rOffset || 0) + alpha * ((pB.rOffset || 0) - (pA.rOffset || 0));

                        const pt = { t, theta, rOffset };
                        if (zone && !isPointInZone(pt.t, pt.theta, zone)) continue;
                        
                        const isBigHole = isBigLine && (holeFreq > 0) && ((k + 1) % holeFreq === 0);
                        pt.scaleVal = isBigHole ? bigHoleScale : 1.0;
                        
                        holePoints.push(pt);
                    }
                }
                pathIdx++;
            }
        }

        if (holePoints.length === 0) return 0;

        const actualHoleSize = holeSize !== undefined ? holeSize : 0.03;

        let circleGeom;
        if (zone && zone.holeShape === 'wobbly') {
            const shape = new THREE.Shape();
            const segments = 48;
            const amp = zone.holeWobbleAmp !== undefined ? zone.holeWobbleAmp : 0.15;
            const freq = zone.holeWobbleFreq !== undefined ? zone.holeWobbleFreq : 5;
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * Math.PI * 2;
                const r = actualHoleSize * (1.0 + amp * Math.cos(freq * phi));
                const x = r * Math.cos(phi);
                const y = r * Math.sin(phi);
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            }
            shape.closePath();
            circleGeom = new THREE.ShapeGeometry(shape);
        } else if (zone && zone.holeShape === 'star') {
            const shape = new THREE.Shape();
            const segments = 60;
            const amp = zone.holeWobbleAmp !== undefined ? zone.holeWobbleAmp : 0.15;
            const freq = zone.holeWobbleFreq !== undefined ? zone.holeWobbleFreq : 5;
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * Math.PI * 2;
                const r = actualHoleSize * (1.0 + amp * starWave(phi, freq));
                const x = r * Math.cos(phi);
                const y = r * Math.sin(phi);
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            }
            shape.closePath();
            circleGeom = new THREE.ShapeGeometry(shape);
        } else {
            circleGeom = new THREE.CircleGeometry(actualHoleSize, 14);
        }
        
        const color = new THREE.Color(colorHex);
        const circleMat = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        circleMat.userData = { originalOpacity: opacity };

        const instancedMesh = new THREE.InstancedMesh(circleGeom, circleMat, holePoints.length);
        instancedMesh.renderOrder = renderOrderVal;

        let idx = 0;
        const upVector = new THREE.Vector3(0, 0, 1);

        for (const pt of holePoints) {
            const pos = getSurfacePoint(pt.t, pt.theta, 0.002, pt.rOffset || 0);
            const norm = getSurfaceNormal(pt.t, pt.theta);

            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(upVector, norm);

            const sVal = pt.scaleVal !== undefined ? pt.scaleVal : 1.0;
            const scale = new THREE.Vector3(sVal, sVal, sVal);
            const matrix = new THREE.Matrix4();
            matrix.compose(pos, quaternion, scale);

            instancedMesh.setMatrixAt(idx++, matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);

        return holePoints.length;
    }
}

// Generates nested concentric outlines scaling inwards for local shape masks
function generateConcentricLoops(zone) {
    const localShapes = ['circle', 'square', 'circular-patch', 'square-patch', 'fish', 'star', 'flower', 'heart', 'triangle'];
    if (!localShapes.includes(zone.type)) return [];

    const N = 100;
    const basePts = [];

    if (zone.type === 'circle' || zone.type === 'circular-patch') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            basePts.push({ u: Math.cos(psi), v: Math.sin(psi) });
        }
    } else if (zone.type === 'square' || zone.type === 'square-patch') {
        const sqVerts = [
            { u: -1.0, v: 1.0 },
            { u: 1.0, v: 1.0 },
            { u: 1.0, v: -1.0 },
            { u: -1.0, v: -1.0 },
            { u: -1.0, v: 1.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 4 * alpha;
            const idx = Math.min(3, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = sqVerts[idx];
            const pB = sqVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'star') {
        const starVerts = [];
        for (let i = 0; i < 10; i++) {
            const angle = i * Math.PI / 5 - Math.PI / 2;
            const r = (i % 2 === 0) ? 1.0 : 0.4;
            starVerts.push({ u: r * Math.cos(angle), v: r * Math.sin(angle) });
        }
        starVerts.push(starVerts[0]);
        
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 10 * alpha;
            const idx = Math.min(9, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = starVerts[idx];
            const pB = starVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'triangle') {
        const triVerts = [
            { u: 0, v: 1.0 },
            { u: -0.866, v: -0.5 },
            { u: 0.866, v: -0.5 },
            { u: 0, v: 1.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 3 * alpha;
            const idx = Math.min(2, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = triVerts[idx];
            const pB = triVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    } else if (zone.type === 'heart') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            const u = 0.85 * Math.pow(Math.sin(psi), 3);
            const v = 0.05 + 0.06 * (13 * Math.cos(psi) - 5 * Math.cos(2*psi) - 2 * Math.cos(3*psi) - Math.cos(4*psi));
            basePts.push({ u, v });
        }
    } else if (zone.type === 'flower') {
        for (let i = 0; i <= N; i++) {
            const psi = (i / N) * Math.PI * 2;
            const r = 0.7 + 0.3 * Math.cos(6 * psi);
            basePts.push({ u: r * Math.cos(psi), v: r * Math.sin(psi) });
        }
    } else if (zone.type === 'fish') {
        const fishVerts = [
            { u: -0.7, v: 0.0 },
            { u: -0.5, v: 0.12 },
            { u: -0.2, v: 0.22 },
            { u: 0.1,  v: 0.18 },
            { u: 0.35, v: 0.08 },
            { u: 0.7,  v: 0.45 },
            { u: 0.6,  v: 0.0 },
            { u: 0.7,  v: -0.45 },
            { u: 0.35, v: -0.08 },
            { u: 0.1,  v: -0.18 },
            { u: -0.2, v: -0.22 },
            { u: -0.5, v: -0.12 },
            { u: -0.7, v: 0.0 }
        ];
        for (let i = 0; i <= N; i++) {
            const alpha = i / N;
            const totalLength = 12 * alpha;
            const idx = Math.min(11, Math.floor(totalLength));
            const segAlpha = totalLength - idx;
            const pA = fishVerts[idx];
            const pB = fishVerts[idx + 1];
            basePts.push({
                u: pA.u + segAlpha * (pB.u - pA.u),
                v: pA.v + segAlpha * (pB.v - pA.v)
            });
        }
    }

    const spacing = 1.0 / zone.density;
    const R = Math.max(0.005, zone.radius || 0.15);

    const loops = [];
    const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;

    for (let p = 0; p < patchCount; p++) {
        const offsetTheta = (p / patchCount) * Math.PI * 2;
        let currentTheta = zone.centerTheta + offsetTheta;
        currentTheta = ((currentTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

        let currentRadius = R;
        while (currentRadius > 0.002) {
            const scale = currentRadius / R;
            const loopPath = [];

            for (const pt of basePts) {
                const rx = pt.u * R * scale;
                const ry = pt.v * R * scale;

                const phi = -(zone.shapeRotation || 0) * Math.PI / 180;
                const dx = rx * Math.cos(phi) - ry * Math.sin(phi);
                const dy = rx * Math.sin(phi) + ry * Math.cos(phi);

                const t = zone.centerT + dy / getGourdHeight();
                const r = getGourdRadius(t);
                let theta = currentTheta + dx / r;
                theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                loopPath.push({ t, theta });
            }

            loopPath.centerTheta = currentTheta;
            loops.push(loopPath);
            currentRadius -= spacing;
        }
    }

    return loops;
}

// Parses SVG text, samples path points, and conformally projects coordinates onto the 3D gourd surface
export function getSvgPaths(zone) {
    if (!zone || !zone.customSvgText) return [];
    
    const paths = [];
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(zone.customSvgText, "image/svg+xml");
        const svgEl = xmlDoc.documentElement;
        if (!svgEl) return [];

        let w = 100, h = 100;
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.split(/\s+/).filter(Boolean);
            if (parts.length === 4) {
                w = parseFloat(parts[2]);
                h = parseFloat(parts[3]);
            }
        } else {
            const widthAttr = svgEl.getAttribute('width');
            const heightAttr = svgEl.getAttribute('height');
            if (widthAttr) w = parseFloat(widthAttr);
            if (heightAttr) h = parseFloat(heightAttr);
        }

        const hiddenContainer = document.createElement('div');
        hiddenContainer.style.position = 'absolute';
        hiddenContainer.style.width = '0px';
        hiddenContainer.style.height = '0px';
        hiddenContainer.style.overflow = 'hidden';
        hiddenContainer.style.visibility = 'hidden';
        hiddenContainer.innerHTML = zone.customSvgText;
        document.body.appendChild(hiddenContainer);

        const svgDomEl = hiddenContainer.querySelector('svg');
        if (svgDomEl) {
            const pathEls = svgDomEl.querySelectorAll('path');
            
            const cx = w / 2;
            const cy = h / 2;
            const radius = Math.max(0.005, zone.radius || 0.15);
            const shapeRotRad = (zone.shapeRotation || 0) * Math.PI / 180;
            
            // Fixed sample resolution step (0.02 cm) to keep curves clean
            const stepSize = 0.02;
            const svgToCm = radius / (w / 2);
            const stepSizeInSvgPixels = stepSize / Math.max(0.0001, svgToCm);

            const patchCount = zone.patchCount !== undefined ? zone.patchCount : 1;

            for (const pathEl of pathEls) {
                const len = pathEl.getTotalLength();
                if (len <= 0) continue;

                const steps = Math.max(15, Math.round(len / stepSizeInSvgPixels));
                
                for (let p = 0; p < patchCount; p++) {
                    const offsetTheta = (p / patchCount) * Math.PI * 2;
                    let currentTheta = zone.centerTheta + offsetTheta;
                    currentTheta = ((currentTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                    const segment = [];
                    for (let i = 0; i <= steps; i++) {
                        const dist = (i / steps) * len;
                        const svgPt = pathEl.getPointAtLength(dist);
                        
                        const u = (svgPt.x - cx) / (w / 2);
                        const v = -(svgPt.y - cy) / (h / 2); // Invert Y axis

                        const rx = u * radius;
                        const ry = v * radius;

                        const dx = rx * Math.cos(shapeRotRad) - ry * Math.sin(shapeRotRad);
                        const dy = rx * Math.sin(shapeRotRad) + ry * Math.cos(shapeRotRad);

                        const dt = dy / getGourdHeight();
                        const t = zone.centerT + dt;
                        if (t < 0.01 || t > 0.99) continue;

                        const rGourd = getGourdRadius(t);
                        const dTheta = dx / rGourd;
                        let thetaPt = currentTheta + dTheta;
                        thetaPt = ((thetaPt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

                        segment.push({ t, theta: thetaPt, rOffset: 0 });
                    }
                    if (segment.length >= 2) {
                        paths.push(segment);
                    }
                }
            }
        }
        document.body.removeChild(hiddenContainer);
    } catch (err) {
        console.error("Error parsing SVG vector paths", err);
    }
    return paths;
}

export function generateSwirlPaths(zone) {
    const paths = [];
    const patchCount = zone.patchCount !== undefined ? zone.patchCount : 3;
    const size = zone.radius !== undefined ? zone.radius : 0.2;
    const turns = zone.swirlFreq !== undefined ? zone.swirlFreq : 2.5;
    const connected = zone.swirlConnected !== false;
    const centerT = zone.centerT !== undefined ? zone.centerT : 0.5;
    const centerTheta = zone.centerTheta !== undefined ? zone.centerTheta : 0.0;
    const shapeRotation = zone.shapeRotation !== undefined ? zone.shapeRotation : 0;
    const rotRad = (shapeRotation * Math.PI) / 180;
    
    const rowsCount = zone.swirlRows !== undefined ? zone.swirlRows : 1;
    const rowSpacing = zone.swirlRowSpacing !== undefined ? zone.swirlRowSpacing : 0.15;
    
    const maxPhi = turns * 2 * Math.PI;
    
    for (let r = 0; r < rowsCount; r++) {
        // Distribute row heights centered around centerT
        const t_c = centerT + (r - (rowsCount - 1) / 2) * rowSpacing;
        
        // Stagger rotation offset on odd rows to create interlocking mesh pattern
        const stagger = (r % 2 === 0) ? 0 : (Math.PI / patchCount);
        
        const spiralsInRow = [];
        for (let p = 0; p < patchCount; p++) {
            const offsetTheta = (p / patchCount) * Math.PI * 2;
            const theta_c = centerTheta + offsetTheta + stagger;
            const windDir = ((p + r) % 2 === 0) ? 1 : -1;
            
            const pts = [];
            for (let i = 0; i <= 60; i++) {
                const phi = (i / 60) * maxPhi;
                const rVal = (i / 60) * size;
                
                const angle = windDir * phi + rotRad;
                const t = Math.max(0.001, Math.min(0.999, t_c + rVal * Math.sin(angle)));
                let theta = theta_c + rVal * Math.cos(angle);
                theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                
                pts.push({ t, theta });
            }
            spiralsInRow.push(pts);
        }
        
        if (connected) {
            for (let p = 0; p < patchCount; p += 2) {
                if (p + 1 < patchCount) {
                    const spiralA = spiralsInRow[p];
                    const spiralB = spiralsInRow[p + 1];
                    const reversedB = [...spiralB].reverse();
                    const combined = [...spiralA, ...reversedB];
                    paths.push(combined);
                } else {
                    paths.push(spiralsInRow[p]);
                }
            }
        } else {
            for (let p = 0; p < patchCount; p++) {
                paths.push(spiralsInRow[p]);
            }
        }
    }
    
    return paths;
}

export function generateWeavePaths(zone, verDensityVal) {
    const horPaths = [];
    const verPaths = [];
    const density = zone.density || 1.0;
    const vDensity = verDensityVal || density;
    
    const H = Math.round(density * 10);
    const V = Math.round(vDensity * 8);
    
    const horCount = zone.weaveHorCount !== undefined ? zone.weaveHorCount : 5;
    const verCount = zone.weaveVerCount !== undefined ? zone.weaveVerCount : 5;
    
    for (let i = 0; i < H; i++) {
        const t_min = i / H;
        const t_max = (i + 1) / H;
        const t_w = t_max - t_min;
        
        for (let j = 0; j < V; j++) {
            const theta_min = j * (2 * Math.PI) / V;
            const theta_max = (j + 1) * (2 * Math.PI) / V;
            const theta_w = theta_max - theta_min;
            
            const isHorizontal = (i + j) % 2 === 0;
            
            if (isHorizontal) {
                // Horizontal lines inside this cell
                for (let k = 0; k < horCount; k++) {
                    const t = t_min + ((k + 0.5) / horCount) * t_w;
                    const segment = [];
                    const steps = 15;
                    for (let s = 0; s <= steps; s++) {
                        let theta = theta_min + (s / steps) * theta_w;
                        theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                        segment.push({ t, theta, rOffset: 0 });
                    }
                    horPaths.push(segment);
                }
            } else {
                // Vertical lines inside this cell
                for (let k = 0; k < verCount; k++) {
                    let theta = theta_min + ((k + 0.5) / verCount) * theta_w;
                    theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                    const segment = [];
                    const steps = 15;
                    for (let s = 0; s <= steps; s++) {
                        const t = t_min + (s / steps) * t_w;
                        segment.push({ t, theta, rOffset: 0 });
                    }
                    verPaths.push(segment);
                }
            }
        }
    }
    
    return { horPaths, verPaths };
}

export function generateWeave2Paths(zone, verDensityVal) {
    const horPaths = [];
    const verPaths = [];
    const density = zone.density || 1.0;
    const vDensity = verDensityVal || density;
    
    // Virtual cylindrical dimensions to map to square cells
    const R_avg = 0.15;
    const H_gourd = 0.35;
    
    const V = Math.round(vDensity * 8);
    const horCount = zone.weaveHorCount !== undefined ? zone.weaveHorCount : 5;
    const verCount = zone.weaveVerCount !== undefined ? zone.weaveVerCount : 5;
    
    // Checkerboard diagonal step size based on horizontal cell width
    const c = (2 * Math.PI / V) * R_avg;
    
    // Bounds of coverage in un-wrapped cylindrical coords
    const x_min = -Math.PI * R_avg;
    const x_max = Math.PI * R_avg;
    const y_min = -0.1 * H_gourd;
    const y_max = 1.1 * H_gourd;
    
    const d1_min = x_min + y_min;
    const d1_max = x_max + y_max;
    const d2_min = x_min - y_max;
    const d2_max = x_max - y_min;
    
    const i_min = Math.floor(d1_min / c) - 1;
    const i_max = Math.floor(d1_max / c) + 1;
    const j_min = Math.floor(d2_min / c) - 1;
    const j_max = Math.floor(d2_max / c) + 1;
    
    // Helper to safely add a path segment with seam-splitting
    const addSegment = (ptsList, targetArray) => {
        let currentSegment = [];
        for (const pt of ptsList) {
            if (currentSegment.length > 0) {
                const prev = currentSegment[currentSegment.length - 1];
                if (Math.abs(pt.theta - prev.theta) > Math.PI) {
                    if (currentSegment.length >= 2) {
                        targetArray.push(currentSegment);
                    }
                    currentSegment = [];
                }
            }
            currentSegment.push(pt);
        }
        if (currentSegment.length >= 2) {
            targetArray.push(currentSegment);
        }
    };
    
    for (let i = i_min; i <= i_max; i++) {
        for (let j = j_min; j <= j_max; j++) {
            const isHorizontal = (i + j) % 2 === 0;
            
            if (isHorizontal) {
                // Diagonal ascending lines `/` (constant d2)
                for (let k = 0; k < horCount; k++) {
                    const d2 = (j + (k + 0.5) / horCount) * c;
                    const ptsList = [];
                    const steps = 15;
                    for (let s = 0; s <= steps; s++) {
                        const d1 = (i + s / steps) * c;
                        
                        // Convert back to cylindrical coords
                        const x = (d1 + d2) / 2;
                        const y = (d1 - d2) / 2;
                        
                        // Check domain
                        if (x < x_min || x > x_max || y < y_min || y > y_max) continue;
                        
                        const t = Math.max(0.001, Math.min(0.999, y / H_gourd));
                        let theta = x / R_avg;
                        theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                        
                        ptsList.push({ t, theta, rOffset: 0 });
                    }
                    if (ptsList.length >= 2) {
                        addSegment(ptsList, horPaths);
                    }
                }
            } else {
                // Diagonal descending lines `\` (constant d1)
                for (let k = 0; k < verCount; k++) {
                    const d1 = (i + (k + 0.5) / verCount) * c;
                    const ptsList = [];
                    const steps = 15;
                    for (let s = 0; s <= steps; s++) {
                        const d2 = (j + s / steps) * c;
                        
                        // Convert back to cylindrical coords
                        const x = (d1 + d2) / 2;
                        const y = (d1 - d2) / 2;
                        
                        // Check domain
                        if (x < x_min || x > x_max || y < y_min || y > y_max) continue;
                        
                        const t = Math.max(0.001, Math.min(0.999, y / H_gourd));
                        let theta = x / R_avg;
                        theta = ((theta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
                        
                        ptsList.push({ t, theta, rOffset: 0 });
                    }
                    if (ptsList.length >= 2) {
                        addSegment(ptsList, verPaths);
                    }
                }
            }
        }
    }
    
    return { horPaths, verPaths };
}

export function generateGeoTrianglePaths(zone, verDensityVal) {
    const verPaths = []; // vertical hatch + vertical boundaries
    const diagPaths = []; // diagonal hatch + diagonal boundaries
    
    const density = zone.density || 1.0;
    const vDensity = verDensityVal || density;
    
    const H = Math.round(density * 10);
    const V = Math.round(vDensity * 8);
    
    const verLineCount = zone.weaveHorCount !== undefined ? zone.weaveHorCount : 5;
    const diagLineCount = zone.weaveVerCount !== undefined ? zone.weaveVerCount : 5;
    
    for (let i = 0; i < H; i++) {
        const x_min = i / H;
        const x_max = (i + 1) / H;
        const x_w = x_max - x_min;
        
        for (let j = 0; j < V; j++) {
            const y_min = j / V;
            const y_max = (j + 1) / V;
            const y_h = y_max - y_min;
            
            const isEven = (i + j) % 2 === 0;
            
            // 1. Draw boundary lines:
            // - Vertical boundary on the left of each cell: x = x_min
            const leftBoundary = [];
            const N_pts = 10;
            for (let k = 0; k <= N_pts; k++) {
                const y_val = y_min + (k / N_pts) * y_h;
                leftBoundary.push({
                    t: y_val,
                    theta: x_min * 2 * Math.PI - Math.PI
                });
            }
            verPaths.push(leftBoundary);
            
            // - Diagonal boundary of the cell
            const diagBoundary = [];
            for (let k = 0; k <= N_pts; k++) {
                const f = k / N_pts;
                const x_val = x_min + f * x_w;
                const y_val = isEven ? (y_max - f * y_h) : (y_min + f * y_h);
                diagBoundary.push({
                    t: y_val,
                    theta: x_val * 2 * Math.PI - Math.PI
                });
            }
            diagPaths.push(diagBoundary);
            
            // 2. Draw hatch lines inside:
            if (isEven) {
                // Bottom-left triangle (u + v < 1): vertical lines
                for (let k = 1; k <= verLineCount; k++) {
                    const u = k / (verLineCount + 1);
                    const x_val = x_min + u * x_w;
                    const y_limit = y_min + (1 - u) * y_h;
                    
                    const line = [];
                    for (let step = 0; step <= N_pts; step++) {
                        const y_val = y_min + (step / N_pts) * (y_limit - y_min);
                        line.push({
                            t: y_val,
                            theta: x_val * 2 * Math.PI - Math.PI
                        });
                    }
                    verPaths.push(line);
                }
                
                // Top-right triangle (u + v >= 1): diagonal lines parallel to u + v = 1
                for (let k = 1; k <= diagLineCount; k++) {
                    const f = k / (diagLineCount + 1);
                    const line = [];
                    for (let step = 0; step <= N_pts; step++) {
                        const s = step / N_pts;
                        const u = f + s * (1 - f);
                        const v = 1 + f - u;
                        
                        const x_val = x_min + u * x_w;
                        const y_val = y_min + v * y_h;
                        line.push({
                            t: y_val,
                            theta: x_val * 2 * Math.PI - Math.PI
                        });
                    }
                    diagPaths.push(line);
                }
            } else {
                // Top-left triangle (u <= v): vertical lines
                for (let k = 1; k <= verLineCount; k++) {
                    const u = k / (verLineCount + 1);
                    const x_val = x_min + u * x_w;
                    const y_start = y_min + u * y_h;
                    
                    const line = [];
                    for (let step = 0; step <= N_pts; step++) {
                        const y_val = y_start + (step / N_pts) * (y_max - y_start);
                        line.push({
                            t: y_val,
                            theta: x_val * 2 * Math.PI - Math.PI
                        });
                    }
                    verPaths.push(line);
                }
                
                // Bottom-right triangle (u > v): diagonal lines parallel to u = v (i.e. u - v = C)
                for (let k = 1; k <= diagLineCount; k++) {
                    const f = k / (diagLineCount + 1);
                    const line = [];
                    for (let step = 0; step <= N_pts; step++) {
                        const s = step / N_pts;
                        const u = f + s * (1 - f);
                        const v = u - f;
                        
                        const x_val = x_min + u * x_w;
                        const y_val = y_min + v * y_h;
                        line.push({
                            t: y_val,
                            theta: x_val * 2 * Math.PI - Math.PI
                        });
                    }
                    diagPaths.push(line);
                }
            }
        }
    }
    
    return { horPaths: verPaths, verPaths: diagPaths };
}

export function generateFlowPaths(zone) {
    const paths = [];
    const scale = zone.flowScale !== undefined ? zone.flowScale : 2.0;
    const freq = zone.flowFreq !== undefined ? zone.flowFreq : 3.0;
    const count = zone.flowCount !== undefined ? zone.flowCount : 25;
    const length = zone.flowLength !== undefined ? zone.flowLength : 40;
    const baseAngle = (zone.flowBaseAngle !== undefined ? zone.flowBaseAngle : 0.0) * Math.PI / 180;
    
    const rng = seededRandom(zone.scatterSeed !== undefined ? zone.scatterSeed : 42);
    
    // 1. Generate Obstacles
    const obstacles = [];
    const numObstacles = 8 + Math.round(rng() * 6);
    for (let k = 0; k < numObstacles; k++) {
        const t_c = 0.1 + rng() * 0.8;
        const theta_c = -Math.PI + rng() * 2 * Math.PI;
        const radius_c = 0.03 + rng() * 0.04;
        obstacles.push({ t: t_c, theta: theta_c, r: radius_c });
    }
    zone._obstacles = obstacles;
    
    const H_seeds = Math.ceil(Math.sqrt(count * 1.5));
    const V_seeds = Math.ceil(count / H_seeds);
    const allPoints3D = [];
    
    const minLineDist = Math.max(0.12, 0.50 - (count / 50.0) * 0.38);
    
    for (let i = 0; i < H_seeds; i++) {
        const theta0 = -Math.PI + (i / H_seeds) * 2 * Math.PI + (rng() - 0.5) * 0.1;
        for (let j = 0; j < V_seeds; j++) {
            const t0 = 0.05 + (j / V_seeds) * 0.9 + (rng() - 0.5) * 0.03;
            
            const dt = 0.015;
            const dtheta = 0.045;
            
            const integrate = (dir) => {
                let t = t0;
                let theta = theta0;
                const pts = [];
                
                for (let step = 0; step < length; step++) {
                    const pos3d = getSurfacePoint(t, theta, 0.002, 0);
                    let tooClose = false;
                    for (const p3d of allPoints3D) {
                        if (pos3d.distanceTo(p3d) < minLineDist) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (tooClose && step > 0) break;
                    
                    pts.push({ t, theta });
                    
                    const alpha0 = baseAngle + scale * (
                        Math.sin(freq * t * Math.PI + 2 * theta) + 
                        Math.cos(freq * 0.7 * t * Math.PI - 3 * theta)
                    );
                    let vx = Math.cos(alpha0);
                    let vy = Math.sin(alpha0);
                    
                    for (const obs of obstacles) {
                        let dTheta = theta - obs.theta;
                        if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
                        if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
                        
                        const dist = Math.sqrt((t - obs.t)*(t - obs.t) + dTheta*dTheta);
                        const influenceR = obs.r * 1.8;
                        
                        if (dist < influenceR) {
                            const nx = (t - obs.t) / dist;
                            const ny = dTheta / dist;
                            
                            let tx = -ny;
                            let ty = nx;
                            if (vx * tx + vy * ty < 0) {
                                tx = -tx;
                                ty = -ty;
                            }
                            
                            const f = Math.max(0, Math.min(1, (influenceR - dist) / (influenceR - obs.r)));
                            vx = (1 - f) * vx + f * tx;
                            vy = (1 - f) * vy + f * ty;
                            
                            if (dist < obs.r + 0.005) {
                                t += nx * 0.005 * dir;
                                theta += ny * 0.015 * dir;
                            }
                        }
                    }
                    
                    const len = Math.sqrt(vx*vx + vy*vy);
                    vx /= (len || 1);
                    vy /= (len || 1);
                    
                    t += dt * vx * dir;
                    theta += dtheta * vy * dir;
                    
                    if (theta > Math.PI) theta -= 2 * Math.PI;
                    if (theta < -Math.PI) theta += 2 * Math.PI;
                    
                    if (t < 0 || t > 1) break;
                }
                return pts;
            };
            
            const pathPtsFwd = integrate(1);
            const pathPtsBwd = integrate(-1);
            pathPtsBwd.reverse();
            
            const fullPath = [...pathPtsBwd, ...pathPtsFwd];
            if (fullPath.length >= 2) {
                paths.push(fullPath);
                for (let step = 0; step < fullPath.length; step += 3) {
                    const pt = fullPath[step];
                    allPoints3D.push(getSurfacePoint(pt.t, pt.theta, 0.002, 0));
                }
            }
        }
    }
    
    return paths;
}

export function generateFlowDots(zone, paths) {
    const dots = [];
    const rng = seededRandom((zone.scatterSeed !== undefined ? zone.scatterSeed : 42) + 1234);
    
    const dotCount = zone.flowDotCount !== undefined ? zone.flowDotCount : 80;
    const baseDotSize = zone.flowDotSize !== undefined ? zone.flowDotSize : 0.03;
    
    const obstacles = zone._obstacles || [];
    for (const obs of obstacles) {
        if (isPointInZone(obs.t, obs.theta, zone)) {
            const sizeCm = baseDotSize * (3.0 + rng() * 3.0);
            dots.push({
                t: obs.t,
                theta: obs.theta,
                rOffset: 0,
                customHoleSize: sizeCm,
                customHoleShape: 'round',
                customColor: zone.color
            });
        }
    }
    
    let beadAttempts = 0;
    let beadPlaced = 0;
    const targetBeads = Math.round(dotCount * 0.4);
    
    if (paths.length > 0) {
        while (beadPlaced < targetBeads && beadAttempts < 500) {
            beadAttempts++;
            const pathIdx = Math.floor(rng() * paths.length);
            const path = paths[pathIdx];
            if (path.length > 4) {
                const ptIdx = Math.floor(2 + rng() * (path.length - 4));
                const pt = path[ptIdx];
                
                if (isPointInZone(pt.t, pt.theta, zone)) {
                    const pos = getSurfacePoint(pt.t, pt.theta, 0.002, 0);
                    let tooClose = false;
                    for (const dot of dots) {
                        const dotPos = getSurfacePoint(dot.t, dot.theta, 0.002, 0);
                        if (pos.distanceTo(dotPos) < 0.35) {
                            tooClose = true;
                            break;
                        }
                    }
                    
                    if (!tooClose) {
                        const size = baseDotSize * (0.8 + rng() * 0.4);
                        dots.push({
                            t: pt.t,
                            theta: pt.theta,
                            rOffset: 0,
                            customHoleSize: size,
                            customHoleShape: 'round',
                            customColor: zone.color
                        });
                        beadPlaced++;
                    }
                }
            }
        }
    }
    
    const targetGaps = dotCount - beadPlaced;
    let gapAttempts = 0;
    let gapPlaced = 0;
    
    const pathPoints3D = [];
    for (const path of paths) {
        for (let step = 0; step < path.length; step += 3) {
            const pt = path[step];
            pathPoints3D.push(getSurfacePoint(pt.t, pt.theta, 0.002, 0));
        }
    }
    
    const minDotDist = Math.max(0.20, baseDotSize * 6.0 - (dotCount / 300.0) * 0.15);
    const minLineDotDist = Math.max(0.25, baseDotSize * 4.0);
    
    while (gapPlaced < targetGaps && gapAttempts < targetGaps * 250) {
        gapAttempts++;
        const t = rng();
        const theta = rng() * Math.PI * 2 - Math.PI;
        
        if (isPointInZone(t, theta, zone)) {
            const pos = getSurfacePoint(t, theta, 0.002, 0);
            
            let tooCloseToLine = false;
            for (const p3d of pathPoints3D) {
                if (pos.distanceTo(p3d) < minLineDotDist) {
                    tooCloseToLine = true;
                    break;
                }
            }
            if (tooCloseToLine) continue;
            
            let tooCloseToDot = false;
            for (const dot of dots) {
                const dotPos = getSurfacePoint(dot.t, dot.theta, 0.002, 0);
                if (pos.distanceTo(dotPos) < minDotDist) {
                    tooCloseToDot = true;
                    break;
                }
            }
            
            if (!tooCloseToDot) {
                const size = baseDotSize * (0.8 + rng() * 1.5);
                dots.push({
                    t,
                    theta,
                    rOffset: 0,
                    customHoleSize: size,
                    customHoleShape: 'round',
                    customColor: zone.color
                });
                gapPlaced++;
            }
        }
    }
    
    return dots;
}

function renderScatterLayer(group, points, colorHex, opacity, zone) {
    if (points.length === 0) return 0;
    
    // Group points by shape AND color: e.g. "round_#ff0000"
    const groups = {};
    
    for (const pt of points) {
        const sh = pt.customHoleShape || 'round';
        const col = pt.customColor || colorHex;
        const key = `${sh}_${col}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push(pt);
    }
    
    let totalRendered = 0;
    const upVector = new THREE.Vector3(0, 0, 1);
    
    for (const [key, pts] of Object.entries(groups)) {
        if (pts.length === 0) continue;
        
        const parts = key.split('_');
        const shapeName = parts[0];
        const ptColor = parts.slice(1).join('_');
        
        const color = new THREE.Color(ptColor);
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity,
            depthTest: true,
            depthWrite: false
        });
        mat.userData = { originalOpacity: opacity };
        
        let geom;
        if (shapeName === 'round') {
            geom = new THREE.CircleGeometry(1.0, 14);
        } else {
            const shape = new THREE.Shape();
            const segments = 60;
            const amp = pts[0].customHoleWobbleAmp !== undefined ? pts[0].customHoleWobbleAmp : 0.15;
            const freq = pts[0].customHoleWobbleFreq !== undefined ? pts[0].customHoleWobbleFreq : 5;
            
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * Math.PI * 2;
                const r = shapeName === 'star' ?
                    (1.0 + amp * starWave(phi, freq)) :
                    (1.0 + amp * Math.cos(freq * phi));
                const x = r * Math.cos(phi);
                const y = r * Math.sin(phi);
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            }
            shape.closePath();
            geom = new THREE.ShapeGeometry(shape);
        }
        
        const instancedMesh = new THREE.InstancedMesh(geom, mat, pts.length);
        instancedMesh.renderOrder = zone.renderOrder || 5;
        
        let idx = 0;
        for (const pt of pts) {
            const pos = getSurfacePoint(pt.t, pt.theta, 0.002, pt.rOffset || 0);
            const norm = getSurfaceNormal(pt.t, pt.theta);
            
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(upVector, norm);
            
            const radius = (pt.customHoleSize || 0.03) * 0.5;
            const scale = new THREE.Vector3(radius, radius, radius);
            
            const matrix = new THREE.Matrix4();
            matrix.compose(pos, quaternion, scale);
            instancedMesh.setMatrixAt(idx++, matrix);
        }
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        group.add(instancedMesh);
        totalRendered += pts.length;
    }
    
    return totalRendered;
}

// Rebuilds pattern inside a parent THREE.Group (handles lines and instanced holes)
export function updatePatternGroup(group, state) {
    // Clear old children
    while (group.children.length > 0) {
        const child = group.children[0];
        child.geometry?.dispose();
        child.material?.dispose();
        group.remove(child);
    }

    // Apply rotation around central Y axis
    group.rotation.y = state.patRotation * Math.PI / 180;

    group.visible = state.patternVisible;
    if (!state.patternVisible || !state.patternZones || state.patternZones.length === 0) {
        state.patternCount = 0;
        state.patternCountType = 'Lines';
        return 0;
    }

    let totalCount = 0;
    let hasHoles = false;
    let hasLines = false;

    // Render each pattern zone individually
    for (const zone of state.patternZones) {
        if (zone.style === 'off' || zone.visible === false) continue;

        if (zone.type === 'custom-image' && zone.customSvgText) {
            const svgPaths = getSvgPaths(zone);
            const renderLines = zone.style === 'lines' || zone.style === 'both';
            const renderHoles = zone.style === 'holes' || zone.style === 'both';
            if (renderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, svgPaths, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            if (renderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, svgPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            continue;
        }
        if (zone.fillType === 'concentric' && ['circle', 'square', 'circular-patch', 'square-patch', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
            const concentricLoops = generateConcentricLoops(zone);
            const validLoops = concentricLoops.map(loop => {
                return loop.filter(pt => pt.t >= 0 && pt.t <= 1);
            }).filter(loop => loop.length >= 2);

            const renderLines = zone.style === 'lines' || zone.style === 'both';
            const renderHoles = zone.style === 'holes' || zone.style === 'both';
            if (renderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, validLoops, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            if (renderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, validLoops, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            continue;
        }

        const direction = zone.direction || 'both';

        const patLayout = zone.patternType || 'grid';
        const renderLines = zone.style === 'lines' || zone.style === 'both';
        const renderHoles = zone.style === 'holes' || zone.style === 'both';

        if (patLayout === 'swirls') {
            let swirlPaths = generateSwirlPaths(zone);
            if (zone.type !== 'full') {
                const clipped = [];
                for (const path of swirlPaths) {
                    clipped.push(...clipPathToZone(path, zone));
                }
                swirlPaths = clipped;
            }
            if (renderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, swirlPaths, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            if (renderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, swirlPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            continue;
        }

        if (patLayout === 'scatter') {
            const numGroups = zone.scatterSizeGroupsCount !== undefined ? zone.scatterSizeGroupsCount : 3;
            const groupsToProcess = [];
            for (let i = 1; i <= numGroups; i++) {
                groupsToProcess.push({
                    index: i,
                    qty: zone['scatterQty' + i] !== undefined ? zone['scatterQty' + i] : 30,
                    size: zone['scatterSize' + i] !== undefined ? zone['scatterSize' + i] : 0.05,
                    shape: zone['scatterShape' + i] || 'round',
                    color: zone['scatterColor' + i] || '#D4A843'
                });
            }
            // Sort descending by size to place largest holes first for Poisson packing
            groupsToProcess.sort((a, b) => b.size - a.size);
            
            const rng = seededRandom(zone.scatterSeed !== undefined ? zone.scatterSeed : 42);
            const pts = [];
            const placed = []; // array of { pos, maxRadius, pt }
            
            for (const gp of groupsToProcess) {
                let placedCount = 0;
                let attempts = 0;
                const targetCount = gp.qty;
                const baseRadius = gp.size * 0.5;
                const isMixed = gp.shape === 'mix';
                
                while (placedCount < targetCount && attempts < targetCount * 300) {
                    attempts++;
                    const t = rng();
                    const theta = rng() * Math.PI * 2 - Math.PI;
                    
                    if (isPointInZone(t, theta, zone)) {
                        let shape = gp.shape;
                        let wobbleFreq = zone.holeWobbleFreq || 5;
                        let wobbleAmp = zone.holeWobbleAmp || 0.15;
                        
                        if (isMixed) {
                            const r = rng();
                            if (r < 0.33) {
                                shape = 'round';
                                wobbleAmp = 0;
                            } else if (r < 0.66) {
                                shape = 'wobbly';
                                wobbleFreq = Math.round(3 + rng() * 5);
                                wobbleAmp = 0.10 + rng() * 0.15;
                            } else {
                                shape = 'star';
                                wobbleFreq = Math.round(5 + rng() * 4);
                                wobbleAmp = 0.15 + rng() * 0.20;
                            }
                        } else {
                            wobbleFreq = zone.holeWobbleFreq || 5;
                            wobbleAmp = zone.holeWobbleAmp || 0.15;
                            if (shape === 'round') {
                                wobbleAmp = 0;
                            }
                        }
                        
                        const maxRadius = baseRadius * (1.0 + (shape === 'round' ? 0.0 : wobbleAmp));
                        const pos = getSurfacePoint(t, theta, 0.002, 0);
                        
                        // Collision check with 0.01cm safety margin
                        let hasCollision = false;
                        for (const p of placed) {
                            if (pos.distanceTo(p.pos) < (maxRadius + p.maxRadius + 0.01)) {
                                hasCollision = true;
                                break;
                            }
                        }
                        
                        if (!hasCollision) {
                            const pt = {
                                t,
                                theta,
                                rOffset: 0,
                                customHoleSize: gp.size,
                                customHoleShape: shape,
                                customHoleWobbleFreq: wobbleFreq,
                                customHoleWobbleAmp: wobbleAmp,
                                customColor: gp.color
                            };
                            placed.push({ pos, maxRadius, pt });
                            pts.push(pt);
                            placedCount++;
                        }
                    }
                }
            }
            
            hasHoles = true;
            const count = renderScatterLayer(group, pts, zone.color, zone.opacity, zone);
            totalCount += count;
            
            continue;
        }

        if (patLayout === 'flow') {
            let flowPaths = generateFlowPaths(zone);
            
            if (zone.type !== 'full') {
                const clipped = [];
                for (const path of flowPaths) {
                    clipped.push(...clipPathToZone(path, zone));
                }
                flowPaths = clipped;
            }
            
            const gapDots = generateFlowDots(zone, flowPaths);
            
            const renderLines = zone.style === 'lines' || zone.style === 'both';
            const renderHoles = zone.style === 'holes' || zone.style === 'both';
            
            if (renderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, flowPaths, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            
            if (renderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, flowPaths, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += count;
            }
            
            if (gapDots.length > 0) {
                hasHoles = true;
                const count = renderScatterLayer(group, gapDots, zone.color, zone.opacity, zone);
                totalCount += count;
            }
            
            continue;
        }

        if (patLayout === 'weave' || patLayout === 'weave2' || patLayout === 'geo-triangle') {
            const verDensityVal = zone.verDensity !== undefined ? zone.verDensity : zone.density;
            let res;
            if (patLayout === 'weave') {
                res = generateWeavePaths(zone, verDensityVal);
            } else if (patLayout === 'weave2') {
                res = generateWeave2Paths(zone, verDensityVal);
            } else {
                res = generateGeoTrianglePaths(zone, verDensityVal);
            }
            
            let horPaths = res.horPaths;
            let verPaths = res.verPaths;
            
            if (zone.type !== 'full') {
                const clippedHor = [];
                for (const path of horPaths) {
                    clippedHor.push(...clipPathToZone(path, zone));
                }
                horPaths = clippedHor;
                
                const clippedVer = [];
                for (const path of verPaths) {
                    clippedVer.push(...clipPathToZone(path, zone));
                }
                verPaths = clippedVer;
            }
            
            // Render horizontal paths
            const horStyle = zone.weaveHorStyle || 'both';
            const horColor = zone.weaveHorColor || zone.color;
            const horRenderLines = horStyle === 'lines' || horStyle === 'both';
            const horRenderHoles = horStyle === 'holes' || horStyle === 'both';
            
            const horZone = {
                ...zone,
                style: horStyle,
                color: horColor,
                holeSize: zone.weaveHorHoleSize !== undefined ? zone.weaveHorHoleSize : zone.holeSize,
                dashSpacing: zone.weaveHorDashSpacing !== undefined ? zone.weaveHorDashSpacing : zone.dashSpacing,
                holeShape: zone.weaveHorHoleShape !== undefined ? zone.weaveHorHoleShape : zone.holeShape,
                holeWobbleFreq: zone.weaveHorHoleWobbleFreq !== undefined ? zone.weaveHorHoleWobbleFreq : zone.holeWobbleFreq,
                holeWobbleAmp: zone.weaveHorHoleWobbleAmp !== undefined ? zone.weaveHorHoleWobbleAmp : zone.holeWobbleAmp,
                bigHoleFreq: zone.weaveHorBigHoleFreq !== undefined ? zone.weaveHorBigHoleFreq : zone.bigHoleFreq,
                bigLineFreq: zone.weaveHorBigLineFreq !== undefined ? zone.weaveHorBigLineFreq : zone.bigLineFreq,
                bigHoleScale: zone.weaveHorBigHoleScale !== undefined ? zone.weaveHorBigHoleScale : zone.bigHoleScale,
                distMode: zone.weaveHorDistMode !== undefined ? zone.weaveHorDistMode : zone.distMode,
                holeCount: zone.weaveHorHoleCount !== undefined ? zone.weaveHorHoleCount : zone.holeCount,
                holeDistance: zone.weaveHorHoleDistance !== undefined ? zone.weaveHorHoleDistance : zone.holeDistance
            };
            
            if (horRenderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, horPaths, 'lines', horColor, zone.opacity,
                    horZone.holeSize, horZone.distMode, horZone.holeCount, horZone.holeDistance,
                    horZone.dashSpacing, horZone
                );
                totalCount += count;
            }
            if (horRenderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, horPaths, 'holes', horColor, zone.opacity,
                    horZone.holeSize, horZone.distMode, horZone.holeCount, horZone.holeDistance,
                    horZone.dashSpacing, horZone
                );
                totalCount += count;
            }
            
            // Render vertical paths
            const verStyle = zone.weaveVerStyle || 'both';
            const verColor = zone.weaveVerColor || zone.color;
            const verRenderLines = verStyle === 'lines' || verStyle === 'both';
            const verRenderHoles = verStyle === 'holes' || verStyle === 'both';
            
            const verZone = {
                ...zone,
                style: verStyle,
                color: verColor,
                holeSize: zone.weaveVerHoleSize !== undefined ? zone.weaveVerHoleSize : zone.holeSize,
                dashSpacing: zone.weaveVerDashSpacing !== undefined ? zone.weaveVerDashSpacing : zone.dashSpacing,
                holeShape: zone.weaveVerHoleShape !== undefined ? zone.weaveVerHoleShape : zone.holeShape,
                holeWobbleFreq: zone.weaveVerHoleWobbleFreq !== undefined ? zone.weaveVerHoleWobbleFreq : zone.holeWobbleFreq,
                holeWobbleAmp: zone.weaveVerHoleWobbleAmp !== undefined ? zone.weaveVerHoleWobbleAmp : zone.holeWobbleAmp,
                bigHoleFreq: zone.weaveVerBigHoleFreq !== undefined ? zone.weaveVerBigHoleFreq : zone.bigHoleFreq,
                bigLineFreq: zone.weaveVerBigLineFreq !== undefined ? zone.weaveVerBigLineFreq : zone.bigLineFreq,
                bigHoleScale: zone.weaveVerBigHoleScale !== undefined ? zone.weaveVerBigHoleScale : zone.bigHoleScale,
                distMode: zone.weaveVerDistMode !== undefined ? zone.weaveVerDistMode : zone.distMode,
                holeCount: zone.weaveVerHoleCount !== undefined ? zone.weaveVerHoleCount : zone.holeCount,
                holeDistance: zone.weaveVerHoleDistance !== undefined ? zone.weaveVerHoleDistance : zone.holeDistance
            };
            
            if (verRenderLines) {
                hasLines = true;
                const count = renderPatternLayer(
                    group, verPaths, 'lines', verColor, zone.opacity,
                    verZone.holeSize, verZone.distMode, verZone.holeCount, verZone.holeDistance,
                    verZone.dashSpacing, verZone
                );
                totalCount += count;
            }
            if (verRenderHoles) {
                hasHoles = true;
                const count = renderPatternLayer(
                    group, verPaths, 'holes', verColor, zone.opacity,
                    verZone.holeSize, verZone.distMode, verZone.holeCount, verZone.holeDistance,
                    verZone.dashSpacing, verZone
                );
                totalCount += count;
            }
        }

        if (renderLines) {
            hasLines = true;
            const horPathsLines = generateHorizontalPaths(patLayout, zone.density, state.patTilt, zone, false);
            const verDensityVal = zone.verDensity !== undefined ? zone.verDensity : zone.density;
            const verPathsLines = generateVerticalPaths(patLayout, verDensityVal, state.patTilt, zone.leanAngle || 0, zone, false);
            
            if (direction === 'both' || direction === 'horizontal') {
                const clippedHor = [];
                for (const path of horPathsLines) {
                    clippedHor.push(...clipPathToZone(path, zone));
                }
                const countHor = renderPatternLayer(
                    group, clippedHor, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countHor;
            }

            if (direction === 'both' || direction === 'vertical') {
                const clippedVer = [];
                for (const path of verPathsLines) {
                    clippedVer.push(...clipPathToZone(path, zone));
                }
                const countVer = renderPatternLayer(
                    group, clippedVer, 'lines', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countVer;
            }
        }
        
        if (renderHoles) {
            hasHoles = true;
            const horPathsHoles = generateHorizontalPaths(patLayout, zone.density, state.patTilt, zone, true);
            const verDensityVal = zone.verDensity !== undefined ? zone.verDensity : zone.density;
            const verPathsHoles = generateVerticalPaths(patLayout, verDensityVal, state.patTilt, zone.leanAngle || 0, zone, true);

            if (direction === 'both' || direction === 'horizontal') {
                const countHor = renderPatternLayer(
                    group, horPathsHoles, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countHor;
            }

            if (direction === 'both' || direction === 'vertical') {
                const countVer = renderPatternLayer(
                    group, verPathsHoles, 'holes', zone.color, zone.opacity,
                    zone.holeSize, zone.distMode, zone.holeCount, zone.holeDistance,
                    zone.dashSpacing, zone
                );
                totalCount += countVer;
            }
        }
    }

    state.patternCount = totalCount;
    if (hasHoles && hasLines) {
        state.patternCountType = 'Items';
    } else if (hasHoles) {
        state.patternCountType = 'Holes';
    } else {
        state.patternCountType = 'Lines';
    }

    return totalCount;
}

// Applies a subtle glow pulse to pattern elements in the animation loop
export function animatePatternPulse(group, opacity, elapsed) {
    if (!group.visible || group.children.length === 0) return;
    const pulse = 0.85 + 0.15 * Math.sin(elapsed * 1.5);
    group.children.forEach(child => {
        if (child.material) {
            const orig = (child.material.userData && child.material.userData.originalOpacity !== undefined)
                ? child.material.userData.originalOpacity
                : 1.0;
            child.material.opacity = orig * pulse;
        }
    });
}

window.appPatternHelpers = {
    generateHorizontalPaths,
    generateVerticalPaths,
    generateConcentricLoops,
    clipPathToZone
};
