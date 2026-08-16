import { state, pushUndoState, performUndo, performRedo, addPatternZone, removePatternZone, duplicatePatternZone, movePatternZoneUp, movePatternZoneDown, addCarveTextItem, removeCarveTextItem, duplicateCarveTextItem, moveCarveTextItemUp, moveCarveTextItemDown } from './state.js';
import { calculateMeasurements, updateMeasureLines } from './measure.js';
import { updatePatternGroup, updatePatternGroupImmediate, getSvgPaths, isPointInZone, DOODLE_PRESETS } from './pattern.js';
import { updateCarveGroup } from './carve.js';
import * as THREE from 'three';
import { getGourdRadius, createGourdGeometry } from './gourd.js';

// Toast notifications helper
export function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const el = document.createElement('div');
    el.className = 'toast-msg' + (type !== 'info' ? ' ' + type : '');
    el.textContent = msg;
    container.appendChild(el);
    
    // Animate in
    requestAnimationFrame(() => el.classList.add('show'));
    
    // Animate out
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 2800);
}

export function applyGourdTexture(gourdMesh, dataURL, scale = 1.0, rotation = 0) {
    if (!gourdMesh) return;
    state.textureDataURL = dataURL;
    state.textureScale = scale;
    state.textureRotation = rotation;
    
    if (window.refreshPatternGroup) {
        window.refreshPatternGroup();
    }
}

// Row template for ranges and number sync inputs
function sliderRow(label, id, min, max, step, value, unit = '') {
    return `<div class="control-row">
        <label class="control-label" for="${id}">${id.startsWith('rot') ? label + ' Axis' : label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <input type="number" id="${id}-num" min="${min}" max="${max}" step="${step}" value="${parseFloat(value).toFixed(2)}">
        <span class="control-unit">${unit}</span>
    </div>`;
}

function isDarkColor(hex) {
    const color = hex.replace('#', '');
    if (color.length !== 6) return false;
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 135;
}

// Helper to convert hex string to THREE.Color
function setMeshColor(gourdMesh, hex) {
    if (gourdMesh) {
        state.materialColor = hex;
        if (gourdMesh.material.map && gourdMesh.material.map.userData && gourdMesh.material.map.userData.isPatternTexture) {
            gourdMesh.material.color.set(0xffffff);
        } else {
            gourdMesh.material.color.set(hex);
        }
        if (window.refreshPatternGroup) {
            window.refreshPatternGroup();
        }
    }
}

// Builds panel HTML content based on the active tab and current model state
function getPanelHTML(tab, gourdMesh, carveGroup, measureGroup) {
    if (!gourdMesh) return '';
    
    if (tab === 'shape') {
        const isPhotoSet = !!state.gourdPhotoGuide;
        const photoOpacityProx = Math.round((state.gourdPhotoOpacity || 0.4) * 100);
        const hasNeck = state.gourdHasNeck !== false;
        
        const neckPos = state.gourdNeckPosition !== undefined ? state.gourdNeckPosition : 0.55;
        const H = state.gourdHeight || 30.0;
        const defaultNeckHeight = (1.0 - neckPos) * H;
        const neckHVal = state.gourdNeckHeight !== undefined ? state.gourdNeckHeight : defaultNeckHeight;
        
        return `
            <div class="panel-section-title">Photo Guide Scanner</div>
            <div class="control-row" style="margin-bottom: 8px; flex-direction: column; align-items: stretch; gap: 8px;">
                <label class="btn-primary" style="display: block; text-align: center; cursor: pointer; padding: 6px 12px; margin-bottom: 0; font-size: 11px;">
                    <i class="fas fa-camera"></i> Upload Gourd Photo
                    <input type="file" id="gourd-photo-upload" accept="image/*" style="display: none;">
                </label>
                ${isPhotoSet ? `
                    <button id="btn-remove-photo-guide" class="btn-secondary" style="border-color: rgba(235, 94, 85, 0.4); color: #eb5e55; font-size: 11px; padding: 6px 12px;">
                        <i class="fas fa-trash-alt"></i> Remove Photo Guide
                    </button>
                ` : ''}
            </div>
            
            ${isPhotoSet ? `
                ${sliderRow('Photo Opacity', 'gourd-photoOpacity', 0, 100, 1, photoOpacityProx, '%')}
                ${sliderRow('Photo Scale', 'gourd-photoScale', 0.5, 2.5, 0.05, state.gourdPhotoScale || 1.0)}
                ${sliderRow('Photo X Offset', 'gourd-photoX', -200, 200, 1, state.gourdPhotoX || 0, 'px')}
                ${sliderRow('Photo Y Offset', 'gourd-photoY', -200, 200, 1, state.gourdPhotoY || 0, 'px')}
                <p style="font-size: 10px; color: var(--color-tx-m); line-height: 1.4; margin-top: 6px; font-style: italic;">
                    💡 Switch to the <b>Front View</b> using the viewport options to align the 3D outline with your physical gourd's photo!
                </p>
            ` : ''}
                      <div class="panel-section-title">Main Dimensions</div>
            <div class="control-row" style="margin-bottom: 10px;">
                <label class="control-label" style="width: 50%;">Has Middle Neck?</label>
                <input type="checkbox" id="gourd-hasNeck" ${hasNeck ? 'checked' : ''} style="cursor: pointer; width: auto; flex: none;">
            </div>
            ${sliderRow('Gourd Height', 'gourd-height', 10.0, 60.0, 0.5, state.gourdHeight || 30.0, 'cm')}
            ${sliderRow('Base Width', 'gourd-baseRadius', 1.0, 10.0, 0.1, state.gourdBaseRadius || 3.5, 'cm')}
            ${sliderRow('Rim Width', 'gourd-rimRadius', 1.0, 10.0, 0.1, state.gourdRimRadius || 2.7, 'cm')}
            
            <div class="panel-section-title">Bulb Curvature</div>
            ${sliderRow('Bulb Width', 'gourd-bulbRadius', 3.0, 20.0, 0.1, state.gourdBulbRadius || 9.0, 'cm')}
            ${sliderRow('Bulb Height', 'gourd-bulbPosition', 0.1, 0.4, 0.01, state.gourdBulbPosition || 0.25)}
            ${sliderRow('Bulb Roundness', 'gourd-bulbRoundness', 0.5, 4.0, 0.05, state.gourdBulbRoundness || 1.0)}

            ${hasNeck ? `
                <div class="panel-section-title">Neck Curvature</div>
                ${sliderRow('Neck Width', 'gourd-neckRadius', 1.0, 10.0, 0.1, state.gourdNeckRadius || 3.8, 'cm')}
                ${sliderRow('Neck Junction', 'gourd-neckPosition', 0.4, 0.75, 0.01, state.gourdNeckPosition || 0.55)}
                ${sliderRow('Neck Height', 'gourd-neckHeight', 2.0, 40.0, 0.1, neckHVal, 'cm')}
                ${sliderRow('Neck Roundness', 'gourd-neckRoundness', 0.5, 3.0, 0.05, state.gourdNeckRoundness || 1.0)}

                <div class="panel-section-title">Upper Neck Curvature</div>
                ${sliderRow('Upper Neck Width', 'gourd-upperNeckWidth', 1.0, 12.0, 0.1, state.gourdUpperNeckWidth || 3.24, 'cm')}
                ${sliderRow('Upper Neck Height', 'gourd-upperNeckPosition', 0.6, 0.95, 0.01, state.gourdUpperNeckPosition || 0.78)}
            ` : ''}

            <div class="panel-section-title">Uneven Shape (Bending)</div>
            ${sliderRow('Lateral Bend (X)', 'gourd-bendX', -5.0, 5.0, 0.1, state.gourdBendX || 0.0, 'cm')}
            ${sliderRow('Lateral Bend (Z)', 'gourd-bendZ', -5.0, 5.0, 0.1, state.gourdBendZ || 0.0, 'cm')}
        `;
    }
    
    if (tab === 'pattern') {
        const zoneCards = state.patternZones.map((zone, idx) => {
            const s = 1.0 / zone.density;
            const densityProx = Math.max(0, Math.min(100, Math.round(100 * (3.0 - s) / 2.96)));
            const verS = 1.0 / (zone.verDensity !== undefined ? zone.verDensity : zone.density);
            const verDensityProx = Math.max(0, Math.min(100, Math.round(100 * (3.0 - verS) / 2.96)));
            const dashProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.dashSpacing) / 0.30)));
            const holeDistProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.holeDistance) / 0.298)));
            const holeCountProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeCount - 1) / 799)));

            const isLocalShape = ['circle', 'square', 'circular-patch', 'square-patch', 'fish', 'star', 'flower', 'heart', 'triangle', 'custom-image'].includes(zone.type);
            
            let fillTypeSelect = '';
            if (isLocalShape && zone.type !== 'custom-image') {
                fillTypeSelect = `
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Fill Type</label>
                        <select class="zone-fill-type-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="grid" ${zone.fillType === 'grid' ? 'selected' : ''}>Grid / Crosshatch</option>
                            <option value="concentric" ${zone.fillType === 'concentric' ? 'selected' : ''}>Concentric Outlines</option>
                        </select>
                    </div>
                `;
            }
            
            let orientationSelect = '';
            if ((!isLocalShape || zone.fillType !== 'concentric') && zone.type !== 'custom-image') {
                orientationSelect = `
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Orientation</label>
                        <select class="zone-direction-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="both" ${zone.direction === 'both' ? 'selected' : ''}>Both Directions</option>
                            <option value="horizontal" ${zone.direction === 'horizontal' ? 'selected' : ''}>Horizontal Only</option>
                            <option value="vertical" ${zone.direction === 'vertical' ? 'selected' : ''}>Vertical Only</option>
                        </select>
                    </div>
                `;
            }

            let patternTypeSelector = '';
            if ((!isLocalShape || zone.fillType !== 'concentric') && zone.type !== 'custom-image') {
                patternTypeSelector = `
                    <div class="control-row" style="margin-bottom: 8px; flex-direction: column; align-items: flex-start;">
                        <label class="control-label" style="margin-bottom: 6px;">Pattern Layout</label>
                        <div class="btn-grid-options" style="width: 100%; margin-bottom: 0; grid-template-columns: repeat(3, 1fr);">
                            <button class="option-btn ${zone.patternType === 'grid' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="grid" style="padding: 4px; font-size: 10px;">Grid</button>
                            <button class="option-btn ${zone.patternType === 'spiral' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="spiral" style="padding: 4px; font-size: 10px;">Spiral</button>
                            <button class="option-btn ${zone.patternType === 'flower' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="flower" style="padding: 4px; font-size: 10px;">Flower</button>
                            <button class="option-btn ${zone.patternType === 'star' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="star" style="padding: 4px; font-size: 10px;">Star</button>
                            <button class="option-btn ${zone.patternType === 'organic' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="organic" style="padding: 4px; font-size: 10px;">Organic</button>
                            <button class="option-btn ${zone.patternType === 'box-grid' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="box-grid" style="padding: 4px; font-size: 10px;">Box Grid</button>
                            <button class="option-btn ${zone.patternType === 'swirls' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="swirls" style="padding: 4px; font-size: 10px;">Swirls</button>
                            <button class="option-btn ${zone.patternType === 'weave' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="weave" style="padding: 4px; font-size: 10px;">Basket Weave</button>
                            <button class="option-btn ${zone.patternType === 'weave2' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="weave2" style="padding: 4px; font-size: 10px;">Diamond Weave</button>
                            <button class="option-btn ${zone.patternType === 'scatter' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="scatter" style="padding: 4px; font-size: 10px;">Scatter</button>
                            <button class="option-btn ${zone.patternType === 'geo-triangle' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="geo-triangle" style="padding: 4px; font-size: 10px;">Geo-Triangle</button>
                            <button class="option-btn ${zone.patternType === 'flow' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="flow" style="padding: 4px; font-size: 10px;">Flow</button>
                            <button class="option-btn ${zone.patternType === 'ribbons' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="ribbons" style="padding: 4px; font-size: 10px;">Ribbons</button>
                            <button class="option-btn ${zone.patternType === 'doodle-flow' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-flow" style="padding: 4px; font-size: 10px;">Org Flow</button>
                            <button class="option-btn ${zone.patternType === 'doodle-maze' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-maze" style="padding: 4px; font-size: 10px;">Maze</button>
                            <button class="option-btn ${zone.patternType === 'doodle-zebra' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-zebra" style="padding: 4px; font-size: 10px;">Zebra Waves</button>
                            <button class="option-btn ${zone.patternType === 'doodle-coral' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-coral" style="padding: 4px; font-size: 10px;">Coral Reef</button>
                            <button class="option-btn ${zone.patternType === 'doodle-weave' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-weave" style="padding: 4px; font-size: 10px;">Org Weave</button>
                            <button class="option-btn ${zone.patternType === 'doodle-confet' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="doodle-confet" style="padding: 4px; font-size: 10px;">Dot & Dash</button>
                        </div>
                    </div>
                `;
            }

            let boundsSliders = '';
            const hideDuplicateBounds = zone.patternType === 'swirls' && ['circular-patch', 'square-patch', 'circle', 'square', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type);
            
            if (!hideDuplicateBounds) {
                if (zone.type === 'hor-band') {
                    boundsSliders = `
                        ${sliderRow('Height Min', `pat-zone-tMin-${zone.id}`, 0.0, 1.0, 0.01, zone.tMin)}
                        ${sliderRow('Height Max', `pat-zone-tMax-${zone.id}`, 0.0, 1.0, 0.01, zone.tMax)}
                    `;
                } else if (zone.type === 'ver-strip') {
                    boundsSliders = `
                        ${sliderRow('Angle Min', `pat-zone-thetaMin-${zone.id}`, -180, 180, 1, Math.round(zone.thetaMin * 180 / Math.PI), '°')}
                        ${sliderRow('Angle Max', `pat-zone-thetaMax-${zone.id}`, -180, 180, 1, Math.round(zone.thetaMax * 180 / Math.PI), '°')}
                    `;
                } else if (zone.type === 'diagonal-stripe') {
                    boundsSliders = `
                        ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                        ${sliderRow('Stripe Width', `pat-zone-width-${zone.id}`, 0.02, 0.5, 0.01, zone.width, 'cm')}
                        ${sliderRow('Slant Angle', `pat-zone-slantAngle-${zone.id}`, -90, 90, 1, zone.slantAngle, '°')}
                    `;
                } else if (zone.type === 'diagonal-frame') {
                    boundsSliders = `
                        ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                        ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                        ${sliderRow('Stripe Width', `pat-zone-width-${zone.id}`, 0.02, 0.5, 0.01, zone.width, 'cm')}
                        ${sliderRow('Slant Angle', `pat-zone-slantAngle-${zone.id}`, -90, 90, 1, zone.slantAngle, '°')}
                    `;
                } else if (zone.type === 'circular-patch') {
                    boundsSliders = `
                        ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                        ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                        ${sliderRow('Patch Radius', `pat-zone-radius-${zone.id}`, 0.02, 0.5, 0.01, zone.radius, 'cm')}
                    `;
                } else if (zone.type === 'square-patch' || zone.type === 'square') {
                    boundsSliders = `
                        ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                        ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                        ${sliderRow('Patch Size', `pat-zone-radius-${zone.id}`, 0.02, 0.5, 0.01, zone.radius, 'cm')}
                        ${sliderRow('Rotation', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                    `;
                } else if (['circle', 'custom-image', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
                    boundsSliders = `
                        ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                        ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                        ${sliderRow('Shape Size', `pat-zone-radius-${zone.id}`, 0.02, 0.6, 0.01, zone.radius, 'cm')}
                        ${sliderRow('Rotation', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                    `;
                }
            }

            let scatterGroupsHTML = '';
            if (zone.patternType === 'scatter') {
                const numGroups = zone.scatterSizeGroupsCount || 3;
                for (let i = 1; i <= numGroups; i++) {
                    const sh = zone['scatterShape' + i] || 'round';
                    const sz = zone['scatterSize' + i] !== undefined ? zone['scatterSize' + i] : 0.05;
                    const qty = zone['scatterQty' + i] !== undefined ? zone['scatterQty' + i] : 30;
                    const col = zone['scatterColor' + i] || '#D4A843';
                    
                    scatterGroupsHTML += `
                        <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                            <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">SIZE GROUP ${i}</div>
                            
                            <div class="control-row" style="margin-bottom: 0;">
                                <label class="control-label" style="width: 45%;">Hole Shape</label>
                                <select class="zone-scatter-group-select" data-zone-id="${zone.id}" data-param="scatterShape${i}" style="flex: 1; font-size: 11px; padding: 2px;">
                                    <option value="round" ${sh === 'round' ? 'selected' : ''}>Round Hole</option>
                                    <option value="wobbly" ${sh === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                                    <option value="star" ${sh === 'star' ? 'selected' : ''}>Star Shape</option>
                                    <option value="mix" ${sh === 'mix' ? 'selected' : ''}>Mixed Shapes</option>
                                </select>
                            </div>
                            
                            ${sliderRow('Hole Size', `pat-zone-scatterSize${i}-${zone.id}`, 0.01, 0.15, 0.005, sz, 'cm')}
                            ${sliderRow('Hole Quantity', `pat-zone-scatterQty${i}-${zone.id}`, 5, 200, 5, qty)}
                            
                            <div class="control-row" style="margin-bottom: 0;">
                                <label class="control-label" style="width: 45%;">Color</label>
                                <input type="color" class="zone-scatter-group-color" data-zone-id="${zone.id}" data-param="scatterColor${i}" value="${col}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                            </div>
                        </div>
                    `;
                }
            }

            let styleControls = '';
            const leanAngleVal = zone.leanAngle !== undefined ? zone.leanAngle : 0.0;
            const direction = zone.direction || 'both';
            const hasVertical = direction === 'both' || direction === 'vertical';
            const showLean = hasVertical && (!isLocalShape || zone.fillType !== 'concentric');

            const isDoodle = zone.patternType && zone.patternType.startsWith('doodle-');

            if (zone.patternType === 'grid' || zone.patternType === 'weave' || zone.patternType === 'weave2' || zone.patternType === 'scatter' || zone.patternType === 'geo-triangle' || zone.patternType === 'flow' || zone.patternType === 'ribbons') {
                styleControls = '';
            } else if (zone.style === 'lines') {
                styleControls = `
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'horizontal') ? sliderRow(zone.patternType === 'box-grid' ? 'Box Grid Spacing' : 'Horizontal Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx) : ''}
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'vertical') && zone.patternType !== 'spiral' ? sliderRow('Vertical Spacing', `pat-zone-verDensity-${zone.id}`, 0, 100, 1, verDensityProx) : ''}
                    ${['flower', 'star', 'organic'].includes(zone.patternType) ? sliderRow('Wave Depth', `pat-zone-flowerDepth-${zone.id}`, 0.005, 0.08, 0.001, zone.flowerDepth || 0.02) : ''}
                    ${zone.type !== 'custom-image' ? sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx) : ''}
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Horizontal Skew', `pat-zone-tiltSkew-${zone.id}`, -45, 45, 1, zone.tiltSkew || 0, '°') : ''}
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Vertical Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, zone.leanAngle || 0, '°') : ''}
                    <div class="control-row" style="margin-bottom: 10px;">
                        <label class="control-label">Line Color</label>
                        <input type="color" class="zone-color-input" data-zone-id="${zone.id}" value="${zone.color}">
                        <span class="color-hex-text">${zone.color.toUpperCase()}</span>
                    </div>
                `;
            } else if (zone.style === 'holes') {
                const showWobble = zone.holeShape === 'wobbly' || zone.holeShape === 'star';
                const wobbleAmpProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeWobbleAmp || 0) / 0.4)));

                styleControls = `
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'horizontal') ? sliderRow(zone.patternType === 'box-grid' ? 'Box Grid Spacing' : 'Horizontal Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx) : ''}
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'vertical') && zone.patternType !== 'spiral' ? sliderRow('Vertical Spacing', `pat-zone-verDensity-${zone.id}`, 0, 100, 1, verDensityProx) : ''}
                    ${zone.patternType === 'box-grid' ? sliderRow('Holes per Box', `pat-zone-patchCount-${zone.id}`, 1, 9, 1, zone.patchCount || 1) : ''}
                    ${['flower', 'star', 'organic'].includes(zone.patternType) ? sliderRow('Wave Depth', `pat-zone-flowerDepth-${zone.id}`, 0.005, 0.08, 0.001, zone.flowerDepth || 0.02) : ''}
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Horizontal Skew', `pat-zone-tiltSkew-${zone.id}`, -45, 45, 1, zone.tiltSkew || 0, '°') : ''}
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Vertical Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, zone.leanAngle || 0, '°') : ''}
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Hole Shape</label>
                        <select class="zone-hole-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="round" ${(zone.holeShape || 'round') === 'round' ? 'selected' : ''}>Round Hole</option>
                            <option value="wobbly" ${zone.holeShape === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                            <option value="star" ${zone.holeShape === 'star' ? 'selected' : ''}>Star Shape</option>
                        </select>
                    </div>
                    ${sliderRow('Hole Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.12, 0.005, zone.holeSize !== undefined ? zone.holeSize : 0.03, 'cm')}
                    ${showWobble ? `
                        ${sliderRow(zone.holeShape === 'star' ? 'Star Points' : 'Wobble Waves', `pat-zone-holeWobbleFreq-${zone.id}`, 3, 12, 1, zone.holeWobbleFreq || 5)}
                        ${sliderRow(zone.holeShape === 'star' ? 'Star Point Depth' : 'Wobble Depth', `pat-zone-holeWobbleAmp-${zone.id}`, 0, 100, 1, wobbleAmpProx)}
                    ` : ''}
                    ${sliderRow('Big Hole Frequency', `pat-zone-bigHoleFreq-${zone.id}`, 0, 10, 1, zone.bigHoleFreq || 0)}
                    ${(zone.bigHoleFreq || 0) > 0 ? sliderRow('Big Line Frequency', `pat-zone-bigLineFreq-${zone.id}`, 1, 5, 1, zone.bigLineFreq || 1) : ''}
                    ${(zone.bigHoleFreq || 0) > 0 ? sliderRow('Big Hole Scale', `pat-zone-bigHoleScale-${zone.id}`, 1.1, 3.0, 0.1, zone.bigHoleScale || 1.5, 'x') : ''}
                    <div class="control-row" style="margin-bottom: 10px;">
                        <label class="control-label">Hole Color</label>
                        <input type="color" class="zone-color-input" data-zone-id="${zone.id}" value="${zone.color}">
                        <span class="color-hex-text">${zone.color.toUpperCase()}</span>
                    </div>
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 50%;">Draughts (Checkerboard)</label>
                        <input type="checkbox" class="zone-draft-checkbox" data-zone-id="${zone.id}" ${zone.draftMode ? 'checked' : ''} style="cursor: pointer; width: auto; flex: none;">
                    </div>
                    ${zone.patternType === 'box-grid' ? '' : `
                        <div class="control-row" style="margin-bottom: 8px;">
                            <label class="control-label">Layout Mode</label>
                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: 1fr 1fr;">
                                <button class="option-btn ${zone.distMode === 'count' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="count" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Count</button>
                                <button class="option-btn ${zone.distMode === 'distance' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="distance" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Distance</button>
                            </div>
                        </div>
                        ${zone.distMode === 'count' ? `
                            ${sliderRow('Hole Count', `pat-zone-holeCount-${zone.id}`, 0, 100, 1, holeCountProx)}
                        ` : `
                            ${sliderRow('Hole Spacing', `pat-zone-holeDistance-${zone.id}`, 0, 100, 1, holeDistProx)}
                        `}
                    `}
                `;
            } else if (zone.style === 'both') {
                const showWobble = zone.holeShape === 'wobbly' || zone.holeShape === 'star';
                const wobbleAmpProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeWobbleAmp || 0) / 0.4)));

                styleControls = `
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'horizontal') ? sliderRow(zone.patternType === 'box-grid' ? 'Box Grid Spacing' : 'Horizontal Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx) : ''}
                    ${!isDoodle && zone.type !== 'custom-image' && (direction === 'both' || direction === 'vertical') && zone.patternType !== 'spiral' ? sliderRow('Vertical Spacing', `pat-zone-verDensity-${zone.id}`, 0, 100, 1, verDensityProx) : ''}
                    ${zone.patternType === 'box-grid' ? sliderRow('Holes per Box', `pat-zone-patchCount-${zone.id}`, 1, 9, 1, zone.patchCount || 1) : ''}
                    ${['flower', 'star', 'organic'].includes(zone.patternType) ? sliderRow('Wave Depth', `pat-zone-flowerDepth-${zone.id}`, 0.005, 0.08, 0.001, zone.flowerDepth || 0.02) : ''}
                    ${zone.type !== 'custom-image' ? sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx) : ''}
                    
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Horizontal Skew', `pat-zone-tiltSkew-${zone.id}`, -45, 45, 1, zone.tiltSkew || 0, '°') : ''}
                    ${!isDoodle && zone.type !== 'custom-image' ? sliderRow('Vertical Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, zone.leanAngle || 0, '°') : ''}
                    
                    <div class="control-row" style="margin-bottom: 10px;">
                        <label class="control-label">Line Color</label>
                        <input type="color" class="zone-color-input" data-zone-id="${zone.id}" value="${zone.color}">
                        <span class="color-hex-text">${zone.color.toUpperCase()}</span>
                    </div>

                    <div style="border-top: 1px solid var(--color-bg-border); margin: 12px 0 8px 0; padding-top: 8px; font-weight: 600; font-size: 11px; color: var(--color-tx-h);">Hole Configuration</div>
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Hole Shape</label>
                        <select class="zone-hole-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="round" ${(zone.holeShape || 'round') === 'round' ? 'selected' : ''}>Round Hole</option>
                            <option value="wobbly" ${zone.holeShape === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                            <option value="star" ${zone.holeShape === 'star' ? 'selected' : ''}>Star Shape</option>
                        </select>
                    </div>
                    ${sliderRow('Hole Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.12, 0.005, zone.holeSize !== undefined ? zone.holeSize : 0.03, 'cm')}
                    ${showWobble ? `
                        ${sliderRow(zone.holeShape === 'star' ? 'Star Points' : 'Wobble Waves', `pat-zone-holeWobbleFreq-${zone.id}`, 3, 12, 1, zone.holeWobbleFreq || 5)}
                        ${sliderRow(zone.holeShape === 'star' ? 'Star Point Depth' : 'Wobble Depth', `pat-zone-holeWobbleAmp-${zone.id}`, 0, 100, 1, wobbleAmpProx)}
                    ` : ''}
                    ${sliderRow('Big Hole Frequency', `pat-zone-bigHoleFreq-${zone.id}`, 0, 10, 1, zone.bigHoleFreq || 0)}
                    ${(zone.bigHoleFreq || 0) > 0 ? sliderRow('Big Line Frequency', `pat-zone-bigLineFreq-${zone.id}`, 1, 5, 1, zone.bigLineFreq || 1) : ''}
                    ${(zone.bigHoleFreq || 0) > 0 ? sliderRow('Big Hole Scale', `pat-zone-bigHoleScale-${zone.id}`, 1.1, 3.0, 0.1, zone.bigHoleScale || 1.5, 'x') : ''}
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 50%;">Draughts (Checkerboard)</label>
                        <input type="checkbox" class="zone-draft-checkbox" data-zone-id="${zone.id}" ${zone.draftMode ? 'checked' : ''} style="cursor: pointer; width: auto; flex: none;">
                    </div>
                    ${zone.patternType === 'box-grid' ? '' : `
                        <div class="control-row" style="margin-bottom: 8px;">
                            <label class="control-label">Layout Mode</label>
                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: 1fr 1fr;">
                                <button class="option-btn ${zone.distMode === 'count' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="count" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Count</button>
                                <button class="option-btn ${zone.distMode === 'distance' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="distance" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Distance</button>
                            </div>
                        </div>
                        ${zone.distMode === 'count' ? `
                            ${sliderRow('Hole Count', `pat-zone-holeCount-${zone.id}`, 0, 100, 1, holeCountProx)}
                        ` : `
                            ${sliderRow('Hole Spacing', `pat-zone-holeDistance-${zone.id}`, 0, 100, 1, holeDistProx)}
                        `}
                    `}
                `;
            } else {
                styleControls = `<p style="color: var(--color-tx-m); font-size: 11px; margin-bottom: 8px; font-style: italic;">Layer disabled</p>`;
            }

            const isActive = zone.id === state.activeZoneId;
            const isHidden = zone.visible === false;

            let cardBody = '';
            if (isActive) {
                if (zone.type === 'custom-image') {
                    cardBody = `
                        <div class="zone-card-body">
                            <div class="control-row" style="margin-bottom: 8px;">
                                <label class="control-label" style="width: 35%;">Layer Shape</label>
                                <select class="zone-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                                    <option value="full" ${zone.type === 'full' ? 'selected' : ''}>Full Gourd</option>
                                    <option value="hor-band" ${zone.type === 'hor-band' ? 'selected' : ''}>Horizontal Band</option>
                                    <option value="ver-strip" ${zone.type === 'ver-strip' ? 'selected' : ''}>Vertical Strip</option>
                                    <option value="diagonal-stripe" ${zone.type === 'diagonal-stripe' ? 'selected' : ''}>Diagonal Stripe</option>
                                    <option value="diagonal-frame" ${zone.type === 'diagonal-frame' ? 'selected' : ''}>Diagonal Frame</option>
                                    <option value="circular-patch" ${zone.type === 'circular-patch' ? 'selected' : ''}>Circular Patch</option>
                                    <option value="square-patch" ${zone.type === 'square-patch' ? 'selected' : ''}>Square Patch</option>
                                    <option value="custom-image" ${zone.type === 'custom-image' ? 'selected' : ''}>Custom Image (SVG/PNG)</option>
                                </select>
                            </div>
                            <div class="control-row" style="margin-bottom: 8px;">
                                <label class="control-label" style="width: 35%;">Upload Image</label>
                                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                    <input type="file" class="zone-custom-image-file" data-zone-id="${zone.id}" accept="image/png, image/jpeg, image/svg+xml" style="font-size: 11px; padding: 2px 0; width: 100%;">
                                    <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                                        <button class="option-btn btn-load-sample-svg" data-zone-id="${zone.id}" style="padding: 2px 6px; font-size: 9px; margin: 0; width: auto; flex: none; line-height: 1.2;">Load Sample SVG</button>
                                        ${zone.customImageDataUrl ? `
                                            <span style="font-size: 10px; color: #4CAF50; font-weight: 500;">✓ Loaded</span>
                                        ` : `
                                            <span style="font-size: 10px; color: var(--color-tx-m); font-style: italic;">PNG or SVG</span>
                                        `}
                                    </div>
                                </div>
                            </div>
                            
                            ${zone.customImageDataUrl ? `
                                <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px; margin-bottom: 12px; width: 100%;">
                                    <img src="${zone.customImageDataUrl}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover; border: 1px solid var(--color-bdr);">
                                    <button class="btn-secondary btn-clear-custom-image" data-zone-id="${zone.id}" style="margin: 0; padding: 4px 10px; font-size: 10px; height: auto; min-height: 0; flex: none; width: auto; line-height: 1.2;">Clear Image</button>
                                </div>
                            ` : ''}

                            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">IMAGE PLACEMENT</div>
                                ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                                ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                                ${sliderRow('Image Size', `pat-zone-radius-${zone.id}`, 0.02, 0.6, 0.01, zone.radius, 'cm')}
                                ${sliderRow('Rotation', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                                ${sliderRow('Repeat Count', `pat-zone-patchCount-${zone.id}`, 1, 12, 1, zone.patchCount || 1)}
                                ${sliderRow('Aspect Width', `pat-zone-widthScale-${zone.id}`, 0.2, 3.0, 0.05, zone.widthScale !== undefined ? zone.widthScale : 1.0)}
                                ${sliderRow('Aspect Height', `pat-zone-heightScale-${zone.id}`, 0.2, 3.0, 0.05, zone.heightScale !== undefined ? zone.heightScale : 1.0)}
                                ${sliderRow('Skew X', `pat-zone-skewX-${zone.id}`, -1.5, 1.5, 0.05, zone.skewX !== undefined ? zone.skewX : 0.0)}
                                ${sliderRow('Skew Y', `pat-zone-skewY-${zone.id}`, -1.5, 1.5, 0.05, zone.skewY !== undefined ? zone.skewY : 0.0)}
                            </div>

                            <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 8px;">
                                <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">STYLE & DETAILS</div>
                                <div class="control-row" style="margin-bottom: 0;">
                                    <label class="control-label" style="width: 45%;">Render Style</label>
                                    <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="style" style="flex: 1; font-size: 11px; padding: 2px;">
                                        <option value="lines" ${zone.style === 'lines' ? 'selected' : ''}>Lines</option>
                                        <option value="holes" ${(zone.style || 'holes') === 'holes' ? 'selected' : ''}>Holes</option>
                                        <option value="both" ${zone.style === 'both' ? 'selected' : ''}>Both</option>
                                    </select>
                                </div>
                                <div class="control-row" style="margin-bottom: 0;">
                                    <label class="control-label" style="width: 45%;">Color</label>
                                    <input type="color" class="zone-color-picker-input" data-zone-id="${zone.id}" data-param="color" value="${zone.color || '#D4A843'}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                                </div>
                                ${sliderRow(zone.style === 'holes' ? 'Hole Size' : 'Line Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.10, 0.005, zone.holeSize || 0.03, 'cm')}
                                ${sliderRow('Opacity', `pat-zone-opacity-${zone.id}`, 0.1, 1, 0.05, zone.opacity)}
                            </div>
                        </div>
                    `;
                } else {
                    cardBody = `
                        <div class="zone-card-body">
                            <div class="control-row" style="margin-bottom: 8px;">
                                <label class="control-label" style="width: 35%;">Layer Shape</label>
                                <select class="zone-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                                    <option value="full" ${zone.type === 'full' ? 'selected' : ''}>Full Gourd</option>
                                    <option value="hor-band" ${zone.type === 'hor-band' ? 'selected' : ''}>Horizontal Band</option>
                                    <option value="ver-strip" ${zone.type === 'ver-strip' ? 'selected' : ''}>Vertical Strip</option>
                                    <option value="diagonal-stripe" ${zone.type === 'diagonal-stripe' ? 'selected' : ''}>Diagonal Stripe</option>
                                    <option value="diagonal-frame" ${zone.type === 'diagonal-frame' ? 'selected' : ''}>Diagonal Frame</option>
                                    <option value="circular-patch" ${zone.type === 'circular-patch' ? 'selected' : ''}>Circular Patch</option>
                                    <option value="square-patch" ${zone.type === 'square-patch' ? 'selected' : ''}>Square Patch</option>
                                    <option value="custom-image" ${zone.type === 'custom-image' ? 'selected' : ''}>Custom Image (SVG/PNG)</option>
                                </select>
                            </div>
                            
                            ${zone.type === 'custom-image' ? `
                                <div class="control-row" style="margin-bottom: 8px;">
                                    <label class="control-label" style="width: 35%;">Upload Mask</label>
                                    <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                                        <input type="file" class="zone-custom-image-file" data-zone-id="${zone.id}" accept="image/png, image/jpeg, image/svg+xml" style="font-size: 11px; padding: 2px 0;">
                                        <div style="display: flex; gap: 6px; align-items: center; margin-top: 2px;">
                                            <button class="option-btn btn-load-sample-svg" data-zone-id="${zone.id}" style="padding: 2px 6px; font-size: 9px; margin: 0; width: auto; flex: none; line-height: 1.2;">Load Sample SVG</button>
                                            ${zone.customImageDataUrl ? `
                                                <span style="font-size: 10px; color: #4CAF50; font-weight: 500;">✓ Loaded</span>
                                            ` : `
                                                <span style="font-size: 10px; color: var(--color-tx-m); font-style: italic;">PNG or SVG</span>
                                            `}
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            ${zone.type !== 'full' ? `
                                <div class="control-row" style="margin-bottom: 8px;">
                                    <label class="control-label" style="width: 50%;">Clip Background?</label>
                                    <input type="checkbox" class="zone-clip-bg-checkbox" data-zone-id="${zone.id}" ${zone.clipBackground !== false ? 'checked' : ''} style="cursor: pointer; width: auto; flex: none;">
                                </div>
                            ` : ''}
                            ${(!['full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'diagonal-frame'].includes(zone.type) && zone.patternType !== 'swirls') ? `
                                ${sliderRow('Repeating Count', `pat-zone-patchCount-${zone.id}`, 1, 12, 1, zone.patchCount || 1)}
                            ` : ''}
                            
                            ${zone.patternType === 'swirls' ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 8px;">Swirl Configuration</div>
                                    
                                    <div class="control-row" style="margin-bottom: 8px;">
                                        <label class="control-label" style="width: 50%;">Connected Swirls</label>
                                        <input type="checkbox" class="zone-swirl-connected-checkbox" data-zone-id="${zone.id}" ${zone.swirlConnected ? 'checked' : ''} style="cursor: pointer; width: auto; flex: none;">
                                    </div>
                                    ${sliderRow('Swirl Tightness', `pat-zone-swirlFreq-${zone.id}`, 1.0, 5.0, 0.25, zone.swirlFreq || 2.5, 'turns')}
                                    ${sliderRow('Swirl Size', `pat-zone-radius-${zone.id}`, 0.02, 0.5, 0.01, zone.radius !== undefined ? zone.radius : 0.2, 'cm')}
                                    ${sliderRow('Repeating Count', `pat-zone-patchCount-${zone.id}`, 1, 36, 1, zone.patchCount !== undefined ? zone.patchCount : 3)}
                                    ${sliderRow('Swirl Rows', `pat-zone-swirlRows-${zone.id}`, 1, 10, 1, zone.swirlRows !== undefined ? zone.swirlRows : 1)}
                                    ${(zone.swirlRows || 1) > 1 ? sliderRow('Row Spacing', `pat-zone-swirlRowSpacing-${zone.id}`, 0.05, 0.40, 0.01, zone.swirlRowSpacing !== undefined ? zone.swirlRowSpacing : 0.15, 'cm') : ''}
                                    ${sliderRow('Height Offset', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT !== undefined ? zone.centerT : 0.5)}
                                    ${sliderRow('Rotation Offset', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round((zone.centerTheta !== undefined ? zone.centerTheta : 0.0) * 180 / Math.PI), '°')}
                                    ${sliderRow('Rotation Angle', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                                </div>
                            ` : ''}
                            
                            ${(zone.patternType === 'grid' || zone.patternType === 'weave' || zone.patternType === 'weave2' || zone.patternType === 'geo-triangle') ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 4px;">
                                        ${zone.patternType === 'grid' ? 'Grid Layout Configuration' : (zone.patternType === 'geo-triangle' ? 'Geo-Triangle Configuration' : (zone.patternType === 'weave2' ? 'Diamond Weave Configuration' : 'Basket Weave Configuration'))}
                                    </div>
                                    ${sliderRow('Horizontal Cell Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx)}
                                    ${sliderRow('Vertical Cell Spacing', `pat-zone-verDensity-${zone.id}`, 0, 100, 1, verDensityProx)}
                                    ${sliderRow('Horizontal Skew', `pat-zone-tiltSkew-${zone.id}`, -45, 45, 1, zone.tiltSkew || 0, '°')}
                                    ${sliderRow('Vertical Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, zone.leanAngle || 0, '°')}
                                    ${zone.patternType !== 'grid' ? `
                                        ${sliderRow(zone.patternType === 'geo-triangle' ? 'Vertical Hatch Lines' : (zone.patternType === 'weave2' ? 'Diamond Horiz. Count' : 'Weave Horiz. Count'), `pat-zone-weaveHorCount-${zone.id}`, 1, 10, 1, zone.weaveHorCount !== undefined ? zone.weaveHorCount : 5)}
                                        ${sliderRow(zone.patternType === 'geo-triangle' ? 'Diagonal Hatch Lines' : (zone.patternType === 'weave2' ? 'Diamond Vert. Count' : 'Weave Vert. Count'), `pat-zone-weaveVerCount-${zone.id}`, 1, 10, 1, zone.weaveVerCount !== undefined ? zone.weaveVerCount : 5)}
                                    ` : ''}
                                    
                                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">
                                            ${zone.patternType === 'grid' ? 'HORIZONTAL GRID LINES' : (zone.patternType === 'geo-triangle' ? 'VERTICAL LINES' : 'HORIZONTAL / ASCENDING')}
                                        </div>
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Style</label>
                                            <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveHorStyle" style="flex: 1; font-size: 11px; padding: 2px;">
                                                <option value="both" ${zone.weaveHorStyle === 'both' ? 'selected' : ''}>Both</option>
                                                <option value="lines" ${zone.weaveHorStyle === 'lines' ? 'selected' : ''}>Lines</option>
                                                <option value="holes" ${zone.weaveHorStyle === 'holes' ? 'selected' : ''}>Holes</option>
                                                <option value="off" ${zone.weaveHorStyle === 'off' ? 'selected' : ''}>Off</option>
                                            </select>
                                        </div>
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Color</label>
                                            <input type="color" class="zone-weave-color-input" data-zone-id="${zone.id}" data-param="weaveHorColor" value="${zone.weaveHorColor || '#D4A843'}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                                        </div>
                                        
                                        ${(zone.weaveHorStyle === 'holes' || zone.weaveHorStyle === 'both') ? `
                                            <div class="control-row" style="margin-bottom: 0;">
                                                <label class="control-label" style="width: 45%;">Hole Shape</label>
                                                <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveHorHoleShape" style="flex: 1; font-size: 11px; padding: 2px;">
                                                    <option value="round" ${(zone.weaveHorHoleShape || 'round') === 'round' ? 'selected' : ''}>Round Hole</option>
                                                    <option value="wobbly" ${zone.weaveHorHoleShape === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                                                    <option value="star" ${zone.weaveHorHoleShape === 'star' ? 'selected' : ''}>Star Shape</option>
                                                </select>
                                            </div>
                                            ${sliderRow('Hole Size', `pat-zone-weaveHorHoleSize-${zone.id}`, 0.01, 0.10, 0.005, zone.weaveHorHoleSize !== undefined ? zone.weaveHorHoleSize : 0.03, 'cm')}
                                            ${['wobbly', 'star'].includes(zone.weaveHorHoleShape) ? `
                                                ${sliderRow(zone.weaveHorHoleShape === 'star' ? 'Star Points' : 'Wobble Waves', `pat-zone-weaveHorHoleWobbleFreq-${zone.id}`, 3, 12, 1, zone.weaveHorHoleWobbleFreq !== undefined ? zone.weaveHorHoleWobbleFreq : 5)}
                                                ${sliderRow(zone.weaveHorHoleShape === 'star' ? 'Star Point Depth' : 'Wobble Depth', `pat-zone-weaveHorHoleWobbleAmp-${zone.id}`, 0, 100, 1, zone.weaveHorHoleWobbleAmp !== undefined ? zone.weaveHorHoleWobbleAmp : 0)}
                                            ` : ''}
                                            ${sliderRow('Big Hole Freq.', `pat-zone-weaveHorBigHoleFreq-${zone.id}`, 0, 10, 1, zone.weaveHorBigHoleFreq !== undefined ? zone.weaveHorBigHoleFreq : 0)}
                                            ${(zone.weaveHorBigHoleFreq || 0) > 0 ? sliderRow('Big Line Freq.', `pat-zone-weaveHorBigLineFreq-${zone.id}`, 1, 5, 1, zone.weaveHorBigLineFreq !== undefined ? zone.weaveHorBigLineFreq : 1) : ''}
                                            ${(zone.weaveHorBigHoleFreq || 0) > 0 ? sliderRow('Big Hole Scale', `pat-zone-weaveHorBigHoleScale-${zone.id}`, 1.1, 3.0, 0.1, zone.weaveHorBigHoleScale !== undefined ? zone.weaveHorBigHoleScale : 1.5, 'x') : ''}
                                        ` : ''}
                                        
                                        ${(zone.weaveHorStyle === 'holes' || zone.weaveHorStyle === 'both') ? `
                                            <div class="control-row" style="margin-bottom: 0;">
                                                <label class="control-label" style="width: 45%;">Hole Spacing Mode</label>
                                                <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveHorDistMode" style="flex: 1; font-size: 11px; padding: 2px;">
                                                    <option value="count" ${(zone.weaveHorDistMode || 'count') === 'count' ? 'selected' : ''}>Hole Count</option>
                                                    <option value="distance" ${zone.weaveHorDistMode === 'distance' ? 'selected' : ''}>Hole Distance</option>
                                                </select>
                                            </div>
                                            ${(zone.weaveHorDistMode || 'count') === 'count' ? 
                                                sliderRow('Hole Count', `pat-zone-weaveHorHoleCount-${zone.id}`, 1, 800, 1, zone.weaveHorHoleCount !== undefined ? zone.weaveHorHoleCount : 30) :
                                                sliderRow('Hole Distance', `pat-zone-weaveHorHoleDistance-${zone.id}`, 0, 100, 1, zone.weaveHorHoleDistance !== undefined ? Math.round(100 * (0.30 - zone.weaveHorHoleDistance) / 0.298) : 80)
                                            }
                                        ` : ''}
                                        
                                        ${sliderRow('Dash Gap', `pat-zone-weaveHorDashSpacing-${zone.id}`, 0, 100, 1, zone.weaveHorDashSpacing !== undefined ? zone.weaveHorDashSpacing : 0)}
                                    </div>
                                    
                                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">
                                            ${zone.patternType === 'grid' ? 'VERTICAL GRID LINES' : (zone.patternType === 'geo-triangle' ? 'DIAGONAL LINES' : 'VERTICAL / DESCENDING')}
                                        </div>
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Style</label>
                                            <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveVerStyle" style="flex: 1; font-size: 11px; padding: 2px;">
                                                <option value="both" ${zone.weaveVerStyle === 'both' ? 'selected' : ''}>Both</option>
                                                <option value="lines" ${zone.weaveVerStyle === 'lines' ? 'selected' : ''}>Lines</option>
                                                <option value="holes" ${zone.weaveVerStyle === 'holes' ? 'selected' : ''}>Holes</option>
                                                <option value="off" ${zone.weaveVerStyle === 'off' ? 'selected' : ''}>Off</option>
                                            </select>
                                        </div>
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Color</label>
                                            <input type="color" class="zone-weave-color-input" data-zone-id="${zone.id}" data-param="weaveVerColor" value="${zone.weaveVerColor || '#D4A843'}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                                        </div>
                                        
                                        ${(zone.weaveVerStyle === 'holes' || zone.weaveVerStyle === 'both') ? `
                                            <div class="control-row" style="margin-bottom: 0;">
                                                <label class="control-label" style="width: 45%;">Hole Shape</label>
                                                <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveVerHoleShape" style="flex: 1; font-size: 11px; padding: 2px;">
                                                    <option value="round" ${(zone.weaveVerHoleShape || 'round') === 'round' ? 'selected' : ''}>Round Hole</option>
                                                    <option value="wobbly" ${zone.weaveVerHoleShape === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                                                    <option value="star" ${zone.weaveVerHoleShape === 'star' ? 'selected' : ''}>Star Shape</option>
                                                </select>
                                            </div>
                                            ${sliderRow('Hole Size', `pat-zone-weaveVerHoleSize-${zone.id}`, 0.01, 0.10, 0.005, zone.weaveVerHoleSize !== undefined ? zone.weaveVerHoleSize : 0.03, 'cm')}
                                            ${['wobbly', 'star'].includes(zone.weaveVerHoleShape) ? `
                                                ${sliderRow(zone.weaveVerHoleShape === 'star' ? 'Star Points' : 'Wobble Waves', `pat-zone-weaveVerHoleWobbleFreq-${zone.id}`, 3, 12, 1, zone.weaveVerHoleWobbleFreq !== undefined ? zone.weaveVerHoleWobbleFreq : 5)}
                                                ${sliderRow(zone.weaveVerHoleShape === 'star' ? 'Star Point Depth' : 'Wobble Depth', `pat-zone-weaveVerHoleWobbleAmp-${zone.id}`, 0, 100, 1, zone.weaveVerHoleWobbleAmp !== undefined ? zone.weaveVerHoleWobbleAmp : 0)}
                                            ` : ''}
                                            ${sliderRow('Big Hole Freq.', `pat-zone-weaveVerBigHoleFreq-${zone.id}`, 0, 10, 1, zone.weaveVerBigHoleFreq !== undefined ? zone.weaveVerBigHoleFreq : 0)}
                                            ${(zone.weaveVerBigHoleFreq || 0) > 0 ? sliderRow('Big Line Freq.', `pat-zone-weaveVerBigLineFreq-${zone.id}`, 1, 5, 1, zone.weaveVerBigLineFreq !== undefined ? zone.weaveVerBigLineFreq : 1) : ''}
                                            ${(zone.weaveVerBigHoleFreq || 0) > 0 ? sliderRow('Big Hole Scale', `pat-zone-weaveVerBigHoleScale-${zone.id}`, 1.1, 3.0, 0.1, zone.weaveVerBigHoleScale !== undefined ? zone.weaveVerBigHoleScale : 1.5, 'x') : ''}
                                        ` : ''}
                                        
                                        ${(zone.weaveVerStyle === 'holes' || zone.weaveVerStyle === 'both') ? `
                                            <div class="control-row" style="margin-bottom: 0;">
                                                <label class="control-label" style="width: 45%;">Hole Spacing Mode</label>
                                                <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="weaveVerDistMode" style="flex: 1; font-size: 11px; padding: 2px;">
                                                    <option value="count" ${(zone.weaveVerDistMode || 'count') === 'count' ? 'selected' : ''}>Hole Count</option>
                                                    <option value="distance" ${zone.weaveVerDistMode === 'distance' ? 'selected' : ''}>Hole Distance</option>
                                                </select>
                                            </div>
                                            ${(zone.weaveVerDistMode || 'count') === 'count' ? 
                                                sliderRow('Hole Count', `pat-zone-weaveVerHoleCount-${zone.id}`, 1, 800, 1, zone.weaveVerHoleCount !== undefined ? zone.weaveVerHoleCount : 30) :
                                                sliderRow('Hole Distance', `pat-zone-weaveVerHoleDistance-${zone.id}`, 0, 100, 1, zone.weaveVerHoleDistance !== undefined ? Math.round(100 * (0.30 - zone.weaveVerHoleDistance) / 0.298) : 80)
                                            }
                                        ` : ''}
                                        
                                        ${sliderRow('Dash Gap', `pat-zone-weaveVerDashSpacing-${zone.id}`, 0, 100, 1, zone.weaveVerDashSpacing !== undefined ? zone.weaveVerDashSpacing : 0)}
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${zone.patternType === 'scatter' ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 4px;">Scatter Configuration (Stars)</div>
                                    ${sliderRow('Size Categories', `pat-zone-scatterSizeGroupsCount-${zone.id}`, 1, 5, 1, zone.scatterSizeGroupsCount || 3)}
                                    ${sliderRow('Random Seed', `pat-zone-scatterSeed-${zone.id}`, 1, 100, 1, zone.scatterSeed !== undefined ? zone.scatterSeed : 42)}
                                    
                                    ${scatterGroupsHTML}
                                </div>
                            ` : ''}
                            
                            ${zone.patternType === 'flow' ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 4px;">Organic Flow Configuration</div>
                                    ${sliderRow('Flow Turbulence', `pat-zone-flowScale-${zone.id}`, 0.0, 5.0, 0.1, zone.flowScale !== undefined ? zone.flowScale : 2.0)}
                                    ${sliderRow('Flow Wave Frequency', `pat-zone-flowFreq-${zone.id}`, 0.5, 8.0, 0.1, zone.flowFreq !== undefined ? zone.flowFreq : 3.0)}
                                    ${sliderRow('Stream Quantity', `pat-zone-flowCount-${zone.id}`, 5, 50, 1, zone.flowCount !== undefined ? zone.flowCount : 25)}
                                    ${sliderRow('Stream Length', `pat-zone-flowLength-${zone.id}`, 10, 100, 5, zone.flowLength !== undefined ? zone.flowLength : 40)}
                                    ${sliderRow('Flow Angle Offset', `pat-zone-flowBaseAngle-${zone.id}`, -180, 180, 5, zone.flowBaseAngle !== undefined ? zone.flowBaseAngle : 0, '°')}
                                    ${sliderRow('Random Seed', `pat-zone-scatterSeed-${zone.id}`, 1, 100, 1, zone.scatterSeed !== undefined ? zone.scatterSeed : 42)}
                                    
                                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">SCATTERED GAP DOTS</div>
                                        ${sliderRow('Dot Quantity', `pat-zone-flowDotCount-${zone.id}`, 0, 300, 5, zone.flowDotCount !== undefined ? zone.flowDotCount : 80)}
                                        ${sliderRow('Dot Size', `pat-zone-flowDotSize-${zone.id}`, 0.01, 0.10, 0.005, zone.flowDotSize !== undefined ? zone.flowDotSize : 0.03, 'cm')}
                                    </div>
                                    
                                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">STREAM CHANNELS</div>
                                        ${sliderRow('Hole Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.10, 0.005, zone.holeSize !== undefined ? zone.holeSize : 0.03, 'cm')}
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Style</label>
                                            <select class="zone-weave-style-select" data-zone-id="${zone.id}" data-param="style" style="flex: 1; font-size: 11px; padding: 2px;">
                                                <option value="lines" ${zone.style === 'lines' ? 'selected' : ''}>Lines</option>
                                                <option value="holes" ${zone.style === 'holes' ? 'selected' : ''}>Holes</option>
                                                <option value="both" ${zone.style === 'both' ? 'selected' : ''}>Both</option>
                                                <option value="off" ${zone.style === 'off' ? 'selected' : ''}>Off</option>
                                            </select>
                                        </div>
                                        <div class="control-row" style="margin-bottom: 8px;">
                                            <label class="control-label">Layout Mode</label>
                                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: 1fr 1fr;">
                                                <button class="option-btn ${zone.distMode === 'count' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="count" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Count</button>
                                                <button class="option-btn ${zone.distMode === 'distance' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="distance" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Distance</button>
                                            </div>
                                        </div>
                                        ${zone.distMode === 'count' ? `
                                            ${sliderRow('Hole Count', `pat-zone-holeCount-${zone.id}`, 0, 100, 1, holeCountProx)}
                                        ` : `
                                            ${sliderRow('Hole Spacing', `pat-zone-holeDistance-${zone.id}`, 0, 100, 1, holeDistProx)}
                                        `}
                                        ${sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx)}
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Color</label>
                                            <input type="color" class="zone-scatter-color-input" data-zone-id="${zone.id}" value="${zone.color || '#D4A843'}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${zone.patternType === 'ribbons' ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 4px;">Noodle Ribbon Configuration</div>
                                    ${sliderRow('Ribbon Quantity', `pat-zone-ribbonCount-${zone.id}`, 2, 20, 1, zone.ribbonCount !== undefined ? zone.ribbonCount : 8)}
                                    ${sliderRow('Lines Per Ribbon', `pat-zone-ribbonLines-${zone.id}`, 1, 9, 1, zone.ribbonLines !== undefined ? zone.ribbonLines : 5)}
                                    ${sliderRow('Line Spacing', `pat-zone-ribbonSpacing-${zone.id}`, 0.004, 0.030, 0.001, zone.ribbonSpacing !== undefined ? zone.ribbonSpacing : 0.012, 'cm')}
                                    ${sliderRow('Ribbon Waviness', `pat-zone-ribbonAmp-${zone.id}`, 0.0, 0.40, 0.01, zone.ribbonAmp !== undefined ? zone.ribbonAmp : 0.15)}
                                    ${sliderRow('Wave Frequency', `pat-zone-ribbonFreq-${zone.id}`, 1.0, 6.0, 0.1, zone.ribbonFreq !== undefined ? zone.ribbonFreq : 2.0)}
                                    ${sliderRow('Random Seed', `pat-zone-scatterSeed-${zone.id}`, 1, 100, 1, zone.scatterSeed !== undefined ? zone.scatterSeed : 42)}
                                    
                                    <div class="control-row" style="margin-bottom: 0;">
                                        <label class="control-label" style="width: 45%;">Direction</label>
                                        <select class="zone-ribbon-direction-select" data-zone-id="${zone.id}" style="flex: 1; font-size: 11px; padding: 2px;">
                                            <option value="both" ${zone.ribbonDirection === 'both' ? 'selected' : ''}>Both Directions</option>
                                            <option value="horizontal" ${zone.ribbonDirection === 'horizontal' ? 'selected' : ''}>Horizontal Only</option>
                                            <option value="vertical" ${zone.ribbonDirection === 'vertical' ? 'selected' : ''}>Vertical Only</option>
                                        </select>
                                    </div>
                                    
                                    <div style="border-top: 1px solid rgba(255,255,255,0.06); padding-top: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <div style="font-size: 10px; font-weight: 600; color: var(--color-tx-d);">RIBBON STYLE</div>
                                        <div class="control-row" style="margin-bottom: 8px;">
                                            <label class="control-label">Layout Mode</label>
                                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: 1fr 1fr;">
                                                <button class="option-btn ${zone.distMode === 'count' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="count" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Count</button>
                                                <button class="option-btn ${zone.distMode === 'distance' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="distance" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Distance</button>
                                            </div>
                                        </div>
                                        ${zone.distMode === 'count' ? `
                                            ${sliderRow('Hole Count', `pat-zone-holeCount-${zone.id}`, 0, 100, 1, holeCountProx)}
                                        ` : `
                                            ${sliderRow('Hole Spacing', `pat-zone-holeDistance-${zone.id}`, 0, 100, 1, holeDistProx)}
                                        `}
                                        ${sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx)}
                                        <div class="control-row" style="margin-bottom: 0;">
                                            <label class="control-label" style="width: 45%;">Color</label>
                                            <input type="color" class="zone-scatter-color-input" data-zone-id="${zone.id}" value="${zone.color || '#D4A843'}" style="width: 40px; height: 20px; border: none; cursor: pointer; padding: 0;">
                                        </div>
                                    </div>
                                </div>
                            ` : ''}
                            
                            ${zone.patternType && zone.patternType.startsWith('doodle-') ? `
                                <div style="border: 1px solid rgba(255,255,255,0.08); padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.15); margin-bottom: 12px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--color-tx-m); margin-bottom: 4px;">
                                        ${zone.patternType === 'doodle-flow' ? 'Org Flow Layout Configuration' :
                                          zone.patternType === 'doodle-maze' ? 'Maze Layout Configuration' :
                                          zone.patternType === 'doodle-zebra' ? 'Zebra Waves Layout Configuration' :
                                          zone.patternType === 'doodle-coral' ? 'Coral Reef Layout Configuration' :
                                          zone.patternType === 'doodle-weave' ? 'Organic Weave Layout Configuration' :
                                          zone.patternType === 'doodle-confet' ? 'Dot & Dash Layout Configuration' : 'Doodle Layout Configuration'}
                                    </div>
                                    ${sliderRow('Random Seed', `pat-zone-doodleSeed-${zone.id}`, 0, 9999, 1, zone.doodleSeed !== undefined ? zone.doodleSeed : 42)}
                                    ${sliderRow('Curl Factor', `pat-zone-doodleCurl-${zone.id}`, 0.0, 4.0, 0.05, zone.doodleCurl !== undefined ? zone.doodleCurl : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.curl || 2.0))}
                                    ${sliderRow('Noise Frequency', `pat-zone-doodleFreq-${zone.id}`, 0.5, 5.0, 0.05, zone.doodleFreq !== undefined ? zone.doodleFreq : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.freq || 1.7))}
                                    ${sliderRow('Line Spacing', `pat-zone-doodleGap-${zone.id}`, 0.35, 2.6, 0.05, zone.doodleGap !== undefined ? zone.doodleGap : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.gap || 1.05))}
                                    ${sliderRow('Lines Count', `pat-zone-doodleCount-${zone.id}`, 100, 1500, 50, zone.doodleCount !== undefined ? zone.doodleCount : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.count || 800))}
                                    ${sliderRow('Line Length', `pat-zone-doodleLen-${zone.id}`, 10, 250, 5, zone.doodleLen !== undefined ? zone.doodleLen : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.len || 70))}
                                    ${sliderRow('Dots Count', `pat-zone-doodleDots-${zone.id}`, 0, 400, 10, zone.doodleDots !== undefined ? zone.doodleDots : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.dots || 80))}
                                    ${sliderRow('Dashed Factor', `pat-zone-doodleDash-${zone.id}`, 0.0, 0.85, 0.05, zone.doodleDash !== undefined ? zone.doodleDash : (DOODLE_PRESETS[zone.patternType.replace('doodle-', '')]?.dash || 0.18))}
                                </div>
                            ` : ''}
                            
                            ${fillTypeSelect}
                            ${orientationSelect}
                            ${patternTypeSelector}
                            ${boundsSliders}
                            
                            ${!['grid', 'weave', 'weave2', 'geo-triangle'].includes(zone.patternType) ? `
                                <div class="btn-grid-options" style="grid-template-columns: repeat(4, 1fr); margin-top: 10px; margin-bottom: 8px;">
                                    <button class="option-btn ${zone.style === 'lines' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="lines">Lines</button>
                                    <button class="option-btn ${zone.style === 'holes' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="holes">Holes</button>
                                    <button class="option-btn ${zone.style === 'both' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="both">Both</button>
                                    <button class="option-btn ${zone.style === 'off' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="off">Off</button>
                                </div>
                            ` : ''}
                            
                            ${styleControls}
                            
                            ${(zone.style !== 'off' || ['grid', 'weave', 'weave2', 'geo-triangle'].includes(zone.patternType)) ? sliderRow('Opacity', `pat-zone-opacity-${zone.id}`, 0.1, 1, 0.05, zone.opacity) : ''}
                        </div>
                    `;
                }
            }

            return `
                <div class="zone-card ${isActive ? 'active' : ''}" id="zone-card-${zone.id}" style="${isHidden ? 'opacity: 0.65;' : ''}">
                    <div class="zone-card-header" style="cursor: pointer;">
                        <div class="zone-card-header-main" style="display: flex; align-items: center; flex: 1;">
                            <span style="margin-right: 8px; font-size: 10px; color: var(--color-tx-m); display: flex; align-items: center;">
                                <i class="fas ${isActive ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
                            </span>
                            <input type="text" class="zone-name-input" data-zone-id="${zone.id}" value="${zone.name}" style="color: ${zone.color}; font-weight: ${isActive ? '600' : 'normal'};">
                        </div>
                        <div class="zone-card-actions">
                            <button class="zone-action-btn btn-move-up-zone" data-zone-id="${zone.id}" title="Move Up" ${idx === 0 ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>▲</button>
                            <button class="zone-action-btn btn-move-down-zone" data-zone-id="${zone.id}" title="Move Down" ${idx === state.patternZones.length - 1 ? 'disabled style="opacity: 0.35; cursor: not-allowed;"' : ''}>▼</button>
                            <button class="zone-action-btn btn-toggle-vis" data-zone-id="${zone.id}" title="${isHidden ? 'Show Layer' : 'Hide Layer'}">
                                <i class="fas ${isHidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button class="zone-action-btn btn-duplicate-zone" data-zone-id="${zone.id}" title="Duplicate Layer">Copy</button>
                            <button class="zone-action-btn delete btn-delete-zone" data-zone-id="${zone.id}" title="Delete Layer">Delete</button>
                        </div>
                    </div>
                    ${cardBody}
                </div>
            `;
        }).join('');

        return `
            <div class="panel-section-title">Pattern Alignment</div>
            ${sliderRow('Rotation (Y)', 'pat-rotation', 0, 360, 1, state.patRotation, '°')}
            ${sliderRow('Slant (Tilt)', 'pat-tilt', 0, 45, 1, state.patTilt, '°')}
            
            <div class="panel-section-title">Move Mask Behavior</div>
            <div class="btn-grid-options" style="grid-template-columns: 1fr 1fr; margin-bottom: 12px;">
                <button class="option-btn ${state.positionToolMode === 'shape' ? 'active' : ''}" data-pos-mode="shape">Move Shape</button>
                <button class="option-btn ${state.positionToolMode === 'camera' ? 'active' : ''}" data-pos-mode="camera">Rotate View</button>
            </div>
            
            <div class="panel-section-title" style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; margin-bottom: 12px;">
                <span>Pattern Layers</span>
                <button id="btn-add-zone" class="zone-action-btn" style="border-color: var(--color-acc); color: var(--color-acc); background: rgba(212, 168, 67, 0.05); padding: 4px 10px;">+ Add Layer</button>
            </div>
            
            <div class="zone-cards-list">
                ${zoneCards}
            </div>
            
            <div class="control-row" style="justify-content: space-between; margin-top: 14px; border-top: 1px solid var(--color-bdr); padding-top: 12px;">
                <label class="control-label">Display overlay</label>
                <label class="toggle">
                    <input type="checkbox" id="pat-visible" ${state.patternVisible ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        `;
    }
    
    if (tab === 'material') {
        const colorHex = '#' + gourdMesh.material.color.getHexString();
        return `
            <div class="panel-section-title">surface finish</div>
            <div class="control-row">
                <label class="control-label">Base Color</label>
                <input type="color" id="mat-color" value="${colorHex}">
                <span class="color-hex-text">${colorHex.toUpperCase()}</span>
            </div>
            ${sliderRow('Roughness', 'mat-rough', 0, 1, 0.01, gourdMesh.material.roughness)}
            ${sliderRow('Metalness', 'mat-metal', 0, 1, 0.01, gourdMesh.material.metalness)}
            ${sliderRow('Opacity', 'mat-opacity', 0.1, 1, 0.05, gourdMesh.material.opacity)}
            
            <div class="panel-section-title">surface texture pattern</div>
            <div class="control-row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
                <label class="control-label" style="margin-bottom: 2px;">Upload Pattern Image</label>
                <input type="file" id="mat-texture-file" accept="image/*" style="font-size: 11px; padding: 2px 0; width: 100%;">
                ${state.textureDataURL ? `
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px; width: 100%;">
                        <img src="${state.textureDataURL}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover; border: 1px solid var(--color-bdr);">
                        <button id="btn-clear-texture" class="btn-secondary" style="margin: 0; padding: 4px 10px; font-size: 10px; height: auto; min-height: 0;">Clear Texture</button>
                    </div>
                ` : ''}
            </div>
            ${state.textureDataURL ? `
                ${sliderRow('Texture Scale', 'mat-texture-scale', 0.1, 8.0, 0.1, state.textureScale || 1.0)}
                ${sliderRow('Texture Rotation', 'mat-texture-rotation', 0, 360, 1, state.textureRotation || 0, '°')}
            ` : ''}

            <div class="panel-section-title">rendering modes</div>
            <div class="control-row" style="justify-content: space-between;">
                <label class="control-label">Wireframe Mesh</label>
                <label class="toggle">
                    <input type="checkbox" id="mat-wire" ${gourdMesh.material.wireframe ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="control-row" style="justify-content: space-between;">
                <label class="control-label">Flat Shading</label>
                <label class="toggle">
                    <input type="checkbox" id="mat-flat" ${gourdMesh.material.flatShading ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
            <button id="btn-reset-material" class="btn-secondary">Reset Material</button>
        `;
    }
    
    if (tab === 'measure') {
        const measurements = calculateMeasurements(gourdMesh.scale.x, gourdMesh.scale.y);
        return `
            <div class="panel-section-title">gourd dimensions</div>
            <div class="stats-list">
                <div class="stat-item"><span class="stat-item-label">Total Height</span><span class="stat-item-val">${measurements.height.toFixed(2)} cm</span></div>
                <div class="stat-item"><span class="stat-item-label">Max Diameter</span><span class="stat-item-val">${measurements.maxDiameter.toFixed(2)} cm</span></div>
                <div class="stat-item"><span class="stat-item-label">Widest Section</span><span class="stat-item-val">${measurements.maxDiameterAt}% Height</span></div>
                <div class="stat-item"><span class="stat-item-label">Neck Diameter</span><span class="stat-item-val">${measurements.neckDiameter.toFixed(2)} cm</span></div>
                <div class="stat-item"><span class="stat-item-label">Base Diameter</span><span class="stat-item-val">${measurements.baseDiameter.toFixed(2)} cm</span></div>
            </div>
            <div class="panel-section-title">calculated volume</div>
            <div class="stats-list">
                <div class="stat-item"><span class="stat-item-label">Fluid Volume</span><span class="stat-item-val highlight">${measurements.volume.toFixed(2)} cm³</span></div>
                <div class="stat-item"><span class="stat-item-label">Surface Area</span><span class="stat-item-val highlight">${measurements.surfaceArea.toFixed(2)} cm²</span></div>
            </div>
            <div class="panel-section-title">visualization helpers</div>
            <div class="control-row" style="justify-content: space-between;">
                <label class="control-label" style="width: 150px;">Show Dimension Lines</label>
                <label class="toggle">
                    <input type="checkbox" id="measure-lines-vis" ${measureGroup.visible ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        `;
    }
    
    if (tab === 'carve') {
        const textItems = state.carveTextItems || [];
        const activeTextItem = textItems.length > 0
            ? (textItems.find(it => it.id === state.activeCarveTextId) || null)
            : null;

        const fontOptions = [
            { label: 'Cinzel Decorative (Classical Ornate)', value: 'Cinzel Decorative' },
            { label: 'Playfair Display (Editorial Serif)', value: 'Playfair Display' },
            { label: 'Cinzel (Roman Monumental)', value: 'Cinzel' },
            { label: 'Great Vibes (Calligraphy Script)', value: 'Great Vibes' },
            { label: 'Dancing Script (Casual Cursive)', value: 'Dancing Script' },
            { label: 'Pacifico (Brush Script)', value: 'Pacifico' },
            { label: 'MedievalSharp (Gothic Script)', value: 'MedievalSharp' },
            { label: 'UnifrakturCook (Fraktur Blackletter)', value: 'UnifrakturCook' },
            { label: 'Rye (Vintage Woodcut / Wild West)', value: 'Rye' },
            { label: 'Lobster (Bold Vintage Display)', value: 'Lobster' },
            { label: 'Montserrat (Geometric Modern)', value: 'Montserrat' },
            { label: 'Outfit (Clean Studio Sans)', value: 'Outfit' },
            { label: 'Space Mono (Craft Monospace)', value: 'Space Mono' }
        ];

        const craftColorSwatches = [
            { name: 'Dark Walnut', hex: '#3A1E08' },
            { name: 'Ebony Char', hex: '#1A110B' },
            { name: 'Burnt Mahogany', hex: '#5C2C16' },
            { name: 'Terracotta', hex: '#A0522D' },
            { name: 'Metallic Gold', hex: '#D4AF37' },
            { name: 'Copper Bronze', hex: '#C87533' },
            { name: 'Ivory Cream', hex: '#F5EFE6' },
            { name: 'Pure White', hex: '#FFFFFF' },
            { name: 'Crimson Wood', hex: '#8B1E1E' },
            { name: 'Turquoise', hex: '#1E7B85' },
            { name: 'Royal Indigo', hex: '#2E3A87' },
            { name: 'Forest Emerald', hex: '#235C32' }
        ];

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div class="panel-section-title" style="margin: 0;">Lettering & Words (${textItems.length})</div>
                <button id="btn-add-carve-text" class="btn-secondary" style="padding: 4px 10px; font-size: 11px; border-color: var(--color-acc-d); color: var(--color-tx-h);">
                    <i class="fas fa-plus" style="margin-right: 4px;"></i> Add Word
                </button>
            </div>

            ${textItems.length === 0 ? `
                <div style="text-align: center; padding: 24px 14px; background: rgba(0,0,0,0.16); border: 1px dashed rgba(255,255,255,0.12); border-radius: 6px; color: var(--color-tx-d); margin-bottom: 12px;">
                    <i class="fas fa-font" style="font-size: 24px; color: var(--color-acc-m); display: block; margin-bottom: 8px;"></i>
                    <p style="margin: 0 0 6px 0; font-size: 12px; color: var(--color-tx-h); font-weight: 600;">No Words on Gourd</p>
                    <p style="margin: 0 0 12px 0; font-size: 11px; line-height: 1.4;">Click below to add a word, title, or quote to the gourd.</p>
                    <button id="btn-add-carve-text-empty" class="btn-primary" style="padding: 6px 14px; font-size: 11px;">
                        <i class="fas fa-plus" style="margin-right: 5px;"></i> Add First Word
                    </button>
                </div>
            ` : `
                <div class="zone-cards-list" style="max-height: 140px; overflow-y: auto; margin-bottom: 12px; display: flex; flex-direction: column; gap: 4px;">
                    ${textItems.map((item, idx) => {
                        const isSelected = item.id === state.activeCarveTextId;
                        return `
                            <div class="zone-card ${isSelected ? 'active' : ''}" data-carve-text-id="${item.id}" style="padding: 6px 8px; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: ${isSelected ? 'rgba(212, 168, 67, 0.15)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isSelected ? 'var(--color-acc-m)' : 'rgba(255,255,255,0.06)'};">
                                <div style="display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">
                                    <button class="btn-icon-subtle btn-carve-text-vis" data-text-id="${item.id}" title="Toggle Visibility" style="color: ${item.visible !== false ? 'var(--color-tx-m)' : 'var(--color-tx-d)'}; padding: 2px;">
                                        <i class="fas ${item.visible !== false ? 'fa-eye' : 'fa-eye-slash'}"></i>
                                    </button>
                                    <span style="width: 10px; height: 10px; border-radius: 50%; background: ${item.carveColor || '#3A1E08'}; display: inline-block; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.3);"></span>
                                    <span style="font-size: 11px; font-weight: ${isSelected ? '600' : 'normal'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: ${isSelected ? 'var(--color-tx-h)' : 'var(--color-tx-m)'};">
                                        ${item.text || item.name || 'Untitled Text'}
                                    </span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 4px;">
                                    <button class="btn-icon-subtle btn-carve-text-dup" data-text-id="${item.id}" title="Duplicate" style="padding: 2px 4px; font-size: 10px;">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                    <button class="btn-icon-subtle btn-carve-text-del" data-text-id="${item.id}" title="Delete" style="padding: 2px 4px; font-size: 10px; color: var(--color-err);">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${activeTextItem ? `
                    <div style="border: 1px solid rgba(255,255,255,0.08); padding: 12px; border-radius: 6px; background: rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px;">
                        <div class="panel-section-title" style="margin-top: 0; display: flex; justify-content: space-between; align-items: center;">
                            <span>Adjust Word: "${activeTextItem.text || 'Text'}"</span>
                        </div>
                        
                        <div class="control-row" style="flex-direction: column; align-items: stretch; gap: 4px; margin-bottom: 4px;">
                            <label class="control-label" style="width: 100%;">Carving Text</label>
                            <textarea class="carve-text-input" data-text-id="${activeTextItem.id}" rows="2" style="width: 100%; background: var(--color-bg-d); border: 1px solid var(--color-bdr); border-radius: 4px; color: var(--color-tx-h); padding: 6px 8px; font-size: 12px; resize: vertical; font-family: inherit;">${activeTextItem.text !== undefined ? activeTextItem.text : 'KIBUYU'}</textarea>
                        </div>

                        <div class="control-row" style="margin-bottom: 4px;">
                            <label class="control-label">Font Family</label>
                            <select class="carve-text-font-family" data-text-id="${activeTextItem.id}" style="flex: 1; font-size: 11px; padding: 4px;">
                                ${fontOptions.map(opt => `
                                    <option value="${opt.value}" ${activeTextItem.fontFamily === opt.value ? 'selected' : ''} style="font-family: '${opt.value}', serif;">
                                        ${opt.label}
                                    </option>
                                `).join('')}
                            </select>
                        </div>

                        <div class="control-row" style="margin-bottom: 4px;">
                            <label class="control-label">Text Style</label>
                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: repeat(3, 1fr);">
                                <button class="option-btn ${activeTextItem.fontWeight === 'bold' ? 'active' : ''}" data-text-id="${activeTextItem.id}" data-text-prop="fontWeight" data-text-val="${activeTextItem.fontWeight === 'bold' ? 'normal' : 'bold'}" style="padding: 4px 6px; font-size: 10px;">
                                    <i class="fas fa-bold"></i>
                                </button>
                                <button class="option-btn ${activeTextItem.fontStyle === 'italic' ? 'active' : ''}" data-text-id="${activeTextItem.id}" data-text-prop="fontStyle" data-text-val="${activeTextItem.fontStyle === 'italic' ? 'normal' : 'italic'}" style="padding: 4px 6px; font-size: 10px;">
                                    <i class="fas fa-italic"></i>
                                </button>
                                <button class="option-btn ${activeTextItem.textCase === 'uppercase' ? 'active' : ''}" data-text-id="${activeTextItem.id}" data-text-prop="textCase" data-text-val="${activeTextItem.textCase === 'uppercase' ? 'none' : 'uppercase'}" style="padding: 4px 6px; font-size: 9px; font-weight: 700;">
                                    CAPS
                                </button>
                            </div>
                        </div>

                        ${sliderRow('Font Size', `carve-text-fontSize-${activeTextItem.id}`, 0.02, 0.25, 0.005, activeTextItem.fontSize !== undefined ? activeTextItem.fontSize : 0.08)}
                        ${sliderRow('Letter Spacing', `carve-text-letterSpacing-${activeTextItem.id}`, -0.01, 0.08, 0.002, activeTextItem.letterSpacing !== undefined ? activeTextItem.letterSpacing : 0.02)}
                        ${sliderRow('Line Spacing', `carve-text-lineHeight-${activeTextItem.id}`, 0.8, 2.5, 0.05, activeTextItem.lineHeight !== undefined ? activeTextItem.lineHeight : 1.2)}

                        <div class="panel-section-title" style="margin-top: 6px;">Placement on Gourd</div>
                        ${sliderRow('Height (t)', `carve-text-centerT-${activeTextItem.id}`, 0.05, 0.95, 0.01, activeTextItem.centerT !== undefined ? activeTextItem.centerT : 0.5)}
                        ${sliderRow('Rotation (Around)', `carve-text-centerTheta-${activeTextItem.id}`, -180, 180, 1, Math.round((activeTextItem.centerTheta || (Math.PI / 2)) * 180 / Math.PI), '°')}
                        ${sliderRow('Tilt Angle', `carve-text-rotation-${activeTextItem.id}`, -180, 180, 1, activeTextItem.rotation || 0, '°')}

                        <div class="panel-section-title" style="margin-top: 6px;">Curvature & Gourd Fitting</div>
                        <div class="control-row" style="margin-bottom: 4px;">
                            <label class="control-label">Wrap Mode</label>
                            <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-columns: 1fr 1fr;">
                                <button class="option-btn ${activeTextItem.wrapMode !== 'vertical' ? 'active' : ''}" data-text-id="${activeTextItem.id}" data-text-prop="wrapMode" data-text-val="horizontal" style="padding: 4px 6px; font-size: 9px;">Horizontal</button>
                                <button class="option-btn ${activeTextItem.wrapMode === 'vertical' ? 'active' : ''}" data-text-id="${activeTextItem.id}" data-text-prop="wrapMode" data-text-val="vertical" style="padding: 4px 6px; font-size: 9px;">Vertical</button>
                            </div>
                        </div>
                        ${sliderRow('Arch Bend Angle', `carve-text-archAngle-${activeTextItem.id}`, -180, 180, 2, activeTextItem.archAngle || 0, '°')}
                        ${sliderRow('Taper (Perspective)', `carve-text-taper-${activeTextItem.id}`, -0.8, 0.8, 0.02, activeTextItem.taper || 0)}
                        ${sliderRow('Slant (Skew)', `carve-text-slantAngle-${activeTextItem.id}`, -45, 45, 1, activeTextItem.slantAngle || 0, '°')}
                        ${sliderRow('Aspect Width', `carve-text-aspectWidth-${activeTextItem.id}`, 0.3, 2.5, 0.05, activeTextItem.aspectWidth !== undefined ? activeTextItem.aspectWidth : 1.0)}

                        <div class="panel-section-title" style="margin-top: 6px;">Carve Aesthetics & Color</div>
                        <div class="control-row" style="margin-bottom: 4px;">
                            <label class="control-label">Carve Style</label>
                            <select class="carve-text-style-select" data-text-id="${activeTextItem.id}" style="flex: 1; font-size: 11px; padding: 4px;">
                                <option value="solid" ${(activeTextItem.carveStyle === 'solid' || !activeTextItem.carveStyle) ? 'selected' : ''}>Solid Inlay Fill</option>
                                <option value="outline" ${activeTextItem.carveStyle === 'outline' ? 'selected' : ''}>Engraved Outline</option>
                                <option value="gold" ${activeTextItem.carveStyle === 'gold' ? 'selected' : ''}>Gold Metallic Foil</option>
                                <option value="hatch" ${activeTextItem.carveStyle === 'hatch' ? 'selected' : ''}>Hatched Woodcut Fill</option>
                                <option value="dots" ${activeTextItem.carveStyle === 'dots' ? 'selected' : ''}>Drilled Stipple Dots</option>
                            </select>
                        </div>

                        <div class="control-row" style="margin-bottom: 6px;">
                            <label class="control-label">Word Color</label>
                            <input type="color" class="carve-text-color-input" data-text-id="${activeTextItem.id}" value="${activeTextItem.carveColor || '#3A1E08'}" style="width: 44px; height: 24px; border: none; cursor: pointer; padding: 0; border-radius: 4px;">
                            <span class="color-hex-text">${(activeTextItem.carveColor || '#3A1E08').toUpperCase()}</span>
                        </div>

                        <!-- Craft Color Palette Preset Swatches -->
                        <div style="margin-bottom: 6px;">
                            <div style="font-size: 10px; color: var(--color-tx-d); margin-bottom: 4px;">Quick Color Presets:</div>
                            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                                ${craftColorSwatches.map(swatch => {
                                    const isCurrent = (activeTextItem.carveColor || '#3A1E08').toLowerCase() === swatch.hex.toLowerCase();
                                    return `
                                        <button class="carve-color-swatch" data-text-id="${activeTextItem.id}" data-color="${swatch.hex}" title="${swatch.name}" style="height: 22px; background: ${swatch.hex}; border: 1.5px solid ${isCurrent ? 'var(--color-acc-m)' : 'rgba(255,255,255,0.15)'}; border-radius: 3px; cursor: pointer; outline: none; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1.0)'">
                                        </button>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        ${sliderRow('Depth Offset', `carve-text-carveDepth-${activeTextItem.id}`, 0.001, 0.015, 0.001, activeTextItem.carveDepth !== undefined ? activeTextItem.carveDepth : 0.005, 'm')}

                        ${activeTextItem.carveStyle === 'hatch' ? `
                            ${sliderRow('Hatch Density', `carve-text-hatchDensity-${activeTextItem.id}`, 4, 30, 1, activeTextItem.hatchDensity || 12)}
                            ${sliderRow('Hatch Angle', `carve-text-hatchAngle-${activeTextItem.id}`, -90, 90, 5, activeTextItem.hatchAngle !== undefined ? activeTextItem.hatchAngle : 45, '°')}
                        ` : ''}

                        ${activeTextItem.carveStyle === 'dots' ? `
                            ${sliderRow('Dot Spacing', `carve-text-dotSpacing-${activeTextItem.id}`, 0.005, 0.06, 0.002, activeTextItem.dotSpacing || 0.02)}
                            ${sliderRow('Dot Size', `carve-text-dotSize-${activeTextItem.id}`, 0.005, 0.06, 0.002, activeTextItem.dotSize || 0.03)}
                        ` : ''}
                    </div>
                ` : ''}
            `}
            `;
    }
    
    return '';
}

// Refreshes the DOM elements of properties panel and hooks event controllers
export function renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    const parentContainer = document.getElementById('panel-content');
    const mobileContainer = document.getElementById('mobile-sheet-content');
    
    if (!parentContainer) return;
    
    const html = getPanelHTML(state.activeTab, gourdMesh, carveGroup, measureGroup);
    parentContainer.innerHTML = html;
    if (mobileContainer) mobileContainer.innerHTML = html;
    
    // Bind all form controllers inside the generated HTML
    wireFormControls(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);

    // Reactively refresh the mobile adjustments bar if it's currently open!
    if (state.activeMobileSection) {
        openMobileAdjustments(state.activeMobileSection, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, true);
    }

    // Refresh mobile layer indicators
    updateMobileLayerIndicators(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
}

export function updateMobileLayerIndicators(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    const container = document.getElementById('mobile-layer-indicators');
    if (!container) return;
    container.innerHTML = '';
    
    state.patternZones.forEach((zone, idx) => {
        const btn = document.createElement('button');
        btn.className = 'layer-indicator-btn';
        btn.style.borderColor = zone.color;
        if (zone.id === state.activeZoneId) {
            btn.classList.add('active');
            btn.style.backgroundColor = zone.color;
            btn.style.color = isDarkColor(zone.color) ? '#ffffff' : '#090706';
        } else {
            btn.style.color = zone.color;
            btn.style.backgroundColor = 'transparent';
        }
        btn.innerText = idx + 1;
        btn.title = zone.name || `Layer ${idx + 1}`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.activeZoneId = zone.id;
            openMobileAdjustments('pattern', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            // Re-render indicators to update active state
            updateMobileLayerIndicators(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
        
        container.appendChild(btn);
    });
}

// Binds handlers to form inputs and ensures number and range sync
function wireFormControls(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    // 1. Sync slider range inputs with number textboxes
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const parentRow = slider.closest('.control-row');
        const numberField = parentRow ? parentRow.querySelector('input[type="number"]') : document.getElementById(slider.id + '-num');
        if (!numberField) return;
        
        slider.addEventListener('input', () => {
            const stepStr = slider.step || '1';
            const decimals = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
            numberField.value = parseFloat(slider.value).toFixed(decimals);
            applyInputChanges(slider.id, slider.value, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
        
        numberField.addEventListener('input', () => {
            slider.value = numberField.value;
            applyInputChanges(slider.id, numberField.value, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
        
        // Push to undo stack only on 'change' to avoid clogging with drag increments
        slider.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
        numberField.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });
    
    // 2. Pattern Options (Per-Layer Pattern Layout Toggle Buttons)
    document.querySelectorAll('.option-btn[data-pat-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoneId = btn.dataset.zoneId;
            const patType = btn.dataset.patType;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.patternType = patType;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });
    
    // 3. Pattern Zone Management Buttons & Inputs
    document.querySelectorAll('#btn-add-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            const newZone = addPatternZone();
            if (newZone) {
                state.activeZoneId = newZone.id;
            }
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-delete-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            const deletedId = btn.dataset.zoneId;
            const wasActive = (state.activeZoneId === deletedId);
            removePatternZone(deletedId);
            if (wasActive) {
                state.activeZoneId = state.patternZones.length > 0 ? state.patternZones[0].id : null;
            }
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-move-up-zone').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndoState(gourdMesh);
            movePatternZoneUp(btn.dataset.zoneId);
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-move-down-zone').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndoState(gourdMesh);
            movePatternZoneDown(btn.dataset.zoneId);
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-duplicate-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            const copy = duplicatePatternZone(btn.dataset.zoneId);
            if (copy) {
                state.activeZoneId = copy.id;
            }
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-toggle-vis').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const zoneId = btn.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.visible = (zone.visible !== false) ? false : true;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-name-input').forEach(input => {
        input.addEventListener('change', () => {
            const zoneId = input.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.name = input.value;
                zone.isCustomNamed = true;
            }
        });
    });

    document.querySelectorAll('.zone-custom-image-file').forEach(input => {
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const zoneId = input.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                const applyDataUrl = (dataUrl) => {
                    pushUndoState(gourdMesh);
                    zone.customImageDataUrl = dataUrl;

                    // Invalidate the cache for this data url to reload it
                    if (window.appImageCache) {
                        delete window.appImageCache[zone.customImageDataUrl];
                    }

                    updatePatternGroup(patternGroup, state);
                    if (onUpdatePattern) onUpdatePattern();
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                };

                const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
                if (isSvg) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        let svgText = event.target.result;
                        try {
                            const parser = new DOMParser();
                            const xmlDoc = parser.parseFromString(svgText, "image/svg+xml");
                            const svgEl = xmlDoc.documentElement;
                            if (svgEl && svgEl.tagName.toLowerCase() === 'svg') {
                                let width = svgEl.getAttribute('width');
                                let height = svgEl.getAttribute('height');
                                const viewBox = svgEl.getAttribute('viewBox');

                                if ((!width || !height) && viewBox) {
                                    const parts = viewBox.split(/\s+/).filter(Boolean);
                                    if (parts.length === 4) {
                                        width = parts[2];
                                        height = parts[3];
                                    }
                                }
                                if (!width) width = '128';
                                if (!height) height = '128';

                                svgEl.setAttribute('width', width);
                                svgEl.setAttribute('height', height);

                                const serializer = new XMLSerializer();
                                svgText = serializer.serializeToString(svgEl);
                            }
                            zone.customSvgText = svgText;
                            const base64Svg = btoa(unescape(encodeURIComponent(svgText)));
                            applyDataUrl(`data:image/svg+xml;base64,${base64Svg}`);
                        } catch (err) {
                            console.error("Failed to parse SVG viewBox dimensions, falling back to base64", err);
                            zone.customSvgText = null;
                            const fallbackReader = new FileReader();
                            fallbackReader.onload = (ev) => applyDataUrl(ev.target.result);
                            fallbackReader.readAsDataURL(file);
                        }
                    };
                    reader.readAsText(file);
                } else {
                    zone.customSvgText = null;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        applyDataUrl(event.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            }
        });
    });

    document.querySelectorAll('.btn-load-sample-svg').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoneId = btn.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                fetch('/sample.svg')
                    .then(r => r.text())
                    .then(svgText => {
                        pushUndoState(gourdMesh);
                        zone.customSvgText = svgText;
                        
                        const base64Svg = btoa(unescape(encodeURIComponent(svgText)));
                        zone.customImageDataUrl = `data:image/svg+xml;base64,${base64Svg}`;
                        
                        if (window.appImageCache) {
                            delete window.appImageCache[zone.customImageDataUrl];
                        }
                        
                        updatePatternGroup(patternGroup, state);
                        if (onUpdatePattern) onUpdatePattern();
                        renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    })
                    .catch(err => {
                        console.error("Failed to load sample SVG", err);
                        showToast("Failed to load sample.svg", "error");
                    });
            }
        });
    });

    document.querySelectorAll('.btn-clear-custom-image').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            const zoneId = btn.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                zone.customImageDataUrl = null;
                zone.customSvgText = null;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                showToast("Image cleared.");
            }
        });
    });

    const shapeFriendlyNames = {
        'full': 'Full Gourd',
        'hor-band': 'Height Band',
        'ver-strip': 'Vertical Strip',
        'diagonal-stripe': 'Diagonal Stripe',
        'diagonal-frame': 'Diagonal Frame',
        'circular-patch': 'Circular Patch',
        'square-patch': 'Square Patch',
        'circle': 'Circle Frame',
        'square': 'Square Frame',
        'fish': 'Fish Silhouette',
        'star': '5-Point Star',
        'flower': 'Flower Rosette',
        'heart': 'Heart Shape',
        'triangle': 'Triangle Shape',
        'custom-image': 'Custom Image'
    };

    document.querySelectorAll('.zone-shape-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.type = select.value;
                if (!zone.isCustomNamed) {
                    const idx = state.patternZones.findIndex(z => z.id === zoneId) + 1;
                    zone.name = `${shapeFriendlyNames[zone.type]} ${idx}`;
                }
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-clip-bg-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const zoneId = cb.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.clipBackground = cb.checked;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-swirl-connected-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const zoneId = cb.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.swirlConnected = cb.checked;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });


    document.querySelectorAll('.zone-draft-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
            const zoneId = cb.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.draftMode = cb.checked;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-fill-type-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.fillType = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-hole-shape-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.holeShape = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });


    document.querySelectorAll('.zone-direction-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.direction = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
            }
        });
    });

    document.querySelectorAll('.option-btn[data-pat-zone-style]').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoneId = btn.dataset.zoneId;
            const style = btn.dataset.patZoneStyle;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.style = style;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.option-btn[data-pat-zone-dist-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoneId = btn.dataset.zoneId;
            const mode = btn.dataset.patZoneDistMode;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.distMode = mode;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-color-input').forEach(picker => {
        picker.addEventListener('input', () => {
            const zoneId = picker.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                state.activeZoneId = zoneId;
                zone.color = picker.value;
                const labelText = picker.nextElementSibling;
                if (labelText) labelText.textContent = zone.color.toUpperCase();
                updatePatternGroup(patternGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });

    document.querySelectorAll('.zone-color-picker-input').forEach(picker => {
        picker.addEventListener('input', () => {
            const zoneId = picker.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                state.activeZoneId = zoneId;
                zone.color = picker.value;
                updatePatternGroup(patternGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });

    document.querySelectorAll('.zone-weave-style-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const param = select.dataset.param;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone[param] = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
            }
        });
    });

    document.querySelectorAll('.zone-ribbon-direction-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.ribbonDirection = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
            }
        });
    });

    document.querySelectorAll('.zone-weave-color-input').forEach(picker => {
        picker.addEventListener('input', () => {
            const zoneId = picker.dataset.zoneId;
            const param = picker.dataset.param;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                state.activeZoneId = zoneId;
                zone[param] = picker.value;
                updatePatternGroup(patternGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });

    document.querySelectorAll('.zone-scatter-mix-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const zoneId = checkbox.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.scatterMixShapes = checkbox.checked;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-scatter-shape-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.holeShape = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-scatter-color-input').forEach(picker => {
        picker.addEventListener('input', () => {
            const zoneId = picker.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                state.activeZoneId = zoneId;
                zone.color = picker.value;
                updatePatternGroup(patternGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });

    document.querySelectorAll('.zone-scatter-group-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const param = select.dataset.param;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone[param] = select.value;
                updatePatternGroup(patternGroup, state);
                if (onUpdatePattern) onUpdatePattern();
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.zone-scatter-group-color').forEach(picker => {
        picker.addEventListener('input', () => {
            const zoneId = picker.dataset.zoneId;
            const param = picker.dataset.param;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                state.activeZoneId = zoneId;
                zone[param] = picker.value;
                updatePatternGroup(patternGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    });

    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('select, button, .zone-action-btn')) return;
            const zoneId = card.id.replace('zone-card-', '');
            if (state.activeZoneId !== zoneId) {
                pushUndoState(gourdMesh);
                state.activeZoneId = zoneId;
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });
    
    document.querySelectorAll('.option-btn[data-pos-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            state.positionToolMode = btn.dataset.posMode;
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    // 4. Pattern display toggle
    document.querySelectorAll('#pat-visible').forEach(patVis => {
        patVis.addEventListener('change', () => {
            state.patternVisible = patVis.checked;
            patternGroup.visible = state.patternVisible;
            document.querySelectorAll('#pat-visible').forEach(chk => {
                chk.checked = state.patternVisible;
            });
        });
    });
    
    // 5. Material color picker
    const matColorPicker = document.getElementById('mat-color');
    if (matColorPicker) {
        matColorPicker.addEventListener('input', () => {
            setMeshColor(gourdMesh, matColorPicker.value);
            const labelText = matColorPicker.nextElementSibling;
            if (labelText) labelText.textContent = matColorPicker.value.toUpperCase();
        });
        matColorPicker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    }
    
    // 6. Material rendering style checkboxes
    const matWire = document.getElementById('mat-wire');
    if (matWire) {
        matWire.addEventListener('change', () => {
            gourdMesh.material.wireframe = matWire.checked;
        });
    }
    
    const matFlat = document.getElementById('mat-flat');
    if (matFlat) {
        matFlat.addEventListener('change', () => {
            gourdMesh.material.flatShading = matFlat.checked;
            gourdMesh.material.needsUpdate = true;
        });
    }
    
    // 7. Reset Material Button
    const resetMatBtn = document.getElementById('btn-reset-material');
    if (resetMatBtn) {
        resetMatBtn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            
            gourdMesh.material.color.set(0xC4956A);
            gourdMesh.material.roughness = 0.82;
            gourdMesh.material.metalness = 0;
            gourdMesh.material.opacity = 1;
            gourdMesh.material.transparent = false;
            gourdMesh.material.wireframe = false;
            gourdMesh.material.flatShading = false;
            
            // Clear texture too!
            state.textureDataURL = null;
            state.textureScale = 1.0;
            state.textureRotation = 0;
            applyGourdTexture(gourdMesh, null);
            
            gourdMesh.material.needsUpdate = true;
            
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Material reset to default settings');
        });
    }

    // 7a. Custom Texture File Uploader & Clear
    const matTextureFileInput = document.getElementById('mat-texture-file');
    if (matTextureFileInput) {
        matTextureFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            pushUndoState(gourdMesh);
            
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    // Replicate Canvas Contrast Enhancement from index 3.html exactly!
                    const canvas = document.createElement('canvas');
                    const maxDim = 1024;
                    let cw = img.width;
                    let ch = img.height;
                    if (cw > maxDim || ch > maxDim) {
                        const r = Math.min(maxDim / cw, maxDim / ch);
                        cw = Math.round(cw * r);
                        ch = Math.round(ch * r);
                    }
                    canvas.width = cw;
                    canvas.height = ch;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, cw, ch);
                    
                    const imageData = ctx.getImageData(0, 0, cw, ch);
                    const d = imageData.data;
                    const contrast = 1.12;
                    const intercept = 128 * (1 - contrast);
                    for (let i = 0; i < d.length; i += 4) {
                        d[i] = Math.min(255, Math.max(0, d[i] * contrast + intercept));
                        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * contrast + intercept));
                        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * contrast + intercept));
                    }
                    ctx.putImageData(imageData, 0, 0);
                    
                    const dataURL = canvas.toDataURL('image/png');
                    state.textureDataURL = dataURL;
                    state.textureScale = 1.0;
                    state.textureRotation = 0;
                    
                    applyGourdTexture(gourdMesh, dataURL, state.textureScale, state.textureRotation);
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    showToast('Pattern texture applied!', 'success');
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    const matClearTexBtn = document.getElementById('btn-clear-texture');
    if (matClearTexBtn) {
        matClearTexBtn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            state.textureDataURL = null;
            state.textureScale = 1.0;
            state.textureRotation = 0;
            applyGourdTexture(gourdMesh, null);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Pattern texture cleared.');
        });
    }
    
    // 8. Reset Transform Button
    const resetTransBtn = document.getElementById('btn-reset-transform');
    if (resetTransBtn) {
        resetTransBtn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            
            gourdMesh.position.set(0, 0, 0);
            gourdMesh.rotation.set(0, 0, 0);
            gourdMesh.scale.set(1, 1, 1);
            
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            
            // Re-render measurement lines in case scale changed
            const unscaledMeas = calculateMeasurements(1.0, 1.0);
            updateMeasureLines(measureGroup, unscaledMeas);
            if (onUpdateMeasure) onUpdateMeasure();
            
            showToast('Transform reset to center coordinates');
        });
    }
    
    // 9. Measurement visualizer toggle
    const measureVis = document.getElementById('measure-lines-vis');
    if (measureVis) {
        measureVis.addEventListener('change', () => {
            measureGroup.visible = measureVis.checked;
        });
    }

    // 13. Add Text Carving Buttons
    const handleAddCarveText = () => {
        pushUndoState(gourdMesh);
        const newItem = addCarveTextItem();
        updateCarveGroup(carveGroup, state);
        renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        showToast('New lettering layer added', 'success');
    };

    const btnAddText = document.getElementById('btn-add-carve-text');
    if (btnAddText) {
        btnAddText.addEventListener('click', handleAddCarveText);
    }
    const btnAddTextEmpty = document.getElementById('btn-add-carve-text-empty');
    if (btnAddTextEmpty) {
        btnAddTextEmpty.addEventListener('click', handleAddCarveText);
    }

    // 14. Text Layer Selection & Actions
    document.querySelectorAll('.zone-card[data-carve-text-id]').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const clickedId = card.dataset.carveTextId;
            if (state.activeCarveTextId === clickedId) {
                state.activeCarveTextId = null; // Toggle/close panel
            } else {
                state.activeCarveTextId = clickedId;
            }
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-carve-text-vis').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = state.carveTextItems.find(it => it.id === btn.dataset.textId);
            if (item) {
                item.visible = item.visible === false ? true : false;
                updateCarveGroup(carveGroup, state);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.btn-carve-text-dup').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndoState(gourdMesh);
            duplicateCarveTextItem(btn.dataset.textId);
            updateCarveGroup(carveGroup, state);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Lettering duplicated', 'info');
        });
    });

    document.querySelectorAll('.btn-carve-text-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndoState(gourdMesh);
            removeCarveTextItem(btn.dataset.textId);
            updateCarveGroup(carveGroup, state);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Lettering removed', 'warn');
        });
    });

    // 15. Lettering Text & Font Inputs
    document.querySelectorAll('.carve-text-input').forEach(input => {
        input.addEventListener('input', () => {
            const item = state.carveTextItems.find(it => it.id === input.dataset.textId);
            if (item) {
                item.text = input.value;
                updateCarveGroup(carveGroup, state);
            }
        });
        input.addEventListener('change', () => {
            pushUndoState(gourdMesh);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.carve-text-font-family').forEach(sel => {
        const handleFontUpdate = () => {
            pushUndoState(gourdMesh);
            const item = state.carveTextItems.find(it => it.id === sel.dataset.textId);
            if (item) {
                item.fontFamily = sel.value;
                updateCarveGroup(carveGroup, state);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                if (document.fonts) {
                    document.fonts.load(`bold 90px "${item.fontFamily}"`).then(() => {
                        updateCarveGroup(carveGroup, state);
                    }).catch(() => {});
                }
            }
        };
        sel.addEventListener('change', handleFontUpdate);
        sel.addEventListener('input', handleFontUpdate);
    });

    document.querySelectorAll('button[data-text-prop]').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            const item = state.carveTextItems.find(it => it.id === btn.dataset.textId);
            if (item) {
                const prop = btn.dataset.textProp;
                item[prop] = btn.dataset.textVal;
                updateCarveGroup(carveGroup, state);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.carve-text-style-select').forEach(sel => {
        sel.addEventListener('change', () => {
            pushUndoState(gourdMesh);
            const item = state.carveTextItems.find(it => it.id === sel.dataset.textId);
            if (item) {
                item.carveStyle = sel.value;
                updateCarveGroup(carveGroup, state);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    document.querySelectorAll('.carve-text-color-input').forEach(picker => {
        picker.addEventListener('input', () => {
            const item = state.carveTextItems.find(it => it.id === picker.dataset.textId);
            if (item) {
                item.carveColor = picker.value;
                const labelText = picker.nextElementSibling;
                if (labelText) labelText.textContent = picker.value.toUpperCase();
                updateCarveGroup(carveGroup, state);
            }
        });
        picker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.carve-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            e.stopPropagation();
            pushUndoState(gourdMesh);
            const item = state.carveTextItems.find(it => it.id === swatch.dataset.textId);
            if (item) {
                item.carveColor = swatch.dataset.color;
                updateCarveGroup(carveGroup, state);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            }
        });
    });

    // Photo Guide Upload Events
    const photoUpload = document.getElementById('gourd-photo-upload');
    if (photoUpload) {
        photoUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    pushUndoState(gourdMesh);
                    state.gourdPhotoGuide = event.target.result;
                    updatePhotoGuideOverlay();
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    showToast('Gourd photo overlay loaded successfully', 'success');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    const btnRemovePhoto = document.getElementById('btn-remove-photo-guide');
    if (btnRemovePhoto) {
        btnRemovePhoto.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            state.gourdPhotoGuide = null;
            updatePhotoGuideOverlay();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Photo overlay guide removed', 'info');
        });
    }

    const hasNeckCheck = document.getElementById('gourd-hasNeck');
    if (hasNeckCheck) {
        hasNeckCheck.addEventListener('change', () => {
            pushUndoState(gourdMesh);
            state.gourdHasNeck = hasNeckCheck.checked;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    }


}

// Processes interactive form settings in real-time
function applyInputChanges(id, value, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    if (!gourdMesh) return;
    const valFloat = parseFloat(value);
    const deg2rad = Math.PI / 180;

    if (id.startsWith('gourd-')) {
        const param = id.replace('gourd-', '');
        if (param === 'height') {
            state.gourdHeight = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'baseRadius') {
            state.gourdBaseRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'bulbRadius') {
            state.gourdBulbRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'neckRadius') {
            state.gourdNeckRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'rimRadius') {
            state.gourdRimRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'bulbPosition') {
            state.gourdBulbPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'bulbRoundness') {
            state.gourdBulbRoundness = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'neckPosition') {
            state.gourdNeckPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'neckHeight') {
            state.gourdNeckHeight = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'neckRoundness') {
            state.gourdNeckRoundness = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'upperNeckWidth') {
            state.gourdUpperNeckWidth = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'upperNeckPosition') {
            state.gourdUpperNeckPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'bendX') {
            state.gourdBendX = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'bendZ') {
            state.gourdBendZ = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
        } else if (param === 'photoOpacity') {
            state.gourdPhotoOpacity = valFloat / 100.0;
            updatePhotoGuideOverlay();
        } else if (param === 'photoScale') {
            state.gourdPhotoScale = valFloat;
            updatePhotoGuideOverlay();
        } else if (param === 'photoX') {
            state.gourdPhotoX = valFloat;
            updatePhotoGuideOverlay();
        } else if (param === 'photoY') {
            state.gourdPhotoY = valFloat;
            updatePhotoGuideOverlay();
        }
        return;
    }

    if (id.startsWith('carve-text-')) {
        const parts = id.replace('carve-text-', '').split('-');
        const param = parts[0];
        const itemId = parts.slice(1).join('-');
        const item = state.carveTextItems.find(it => it.id === itemId);
        if (item) {
            if (param === 'centerTheta') {
                item.centerTheta = valFloat * Math.PI / 180;
            } else if (param === 'rotation' || param === 'archAngle' || param === 'slantAngle' || param === 'hatchAngle') {
                item[param] = valFloat;
            } else {
                item[param] = valFloat;
            }
            updateCarveGroup(carveGroup, state);
        }
        return;
    }
    
    if (id.startsWith('pat-zone-')) {
        const parts = id.split('-');
        const param = parts[2];
        const zoneId = parts.slice(3).join('-');
        state.activeZoneId = zoneId; // Set active selection when input sliders update
        const zone = state.patternZones.find(z => z.id === zoneId);
        if (zone) {
            if (param === 'density') {
                const s = 3.0 - (valFloat / 100.0) * 2.96;
                zone.density = 1.0 / s;
            } else if (param === 'verDensity') {
                const s = 3.0 - (valFloat / 100.0) * 2.96;
                zone.verDensity = 1.0 / s;
            } else if (param === 'dashSpacing') {
                zone.dashSpacing = 0.30 - (valFloat / 100.0) * 0.30;
            } else if (param === 'holeCount') {
                zone.holeCount = Math.round(1.0 + (valFloat / 100.0) * 799.0);
            } else if (param === 'holeDistance') {
                zone.holeDistance = 0.30 - (valFloat / 100.0) * 0.298;
            } else if (param === 'holeWobbleAmp') {
                zone.holeWobbleAmp = (valFloat / 100.0) * 0.4;
            } else if (param === 'holeWobbleFreq') {
                zone.holeWobbleFreq = Math.round(valFloat);
            } else if (param === 'patchCount') {
                zone.patchCount = Math.round(valFloat);
            } else if (param === 'weaveHorHoleWobbleAmp' || param === 'weaveVerHoleWobbleAmp') {
                zone[param] = (valFloat / 100.0) * 0.4;
            } else if (param === 'weaveHorDashSpacing' || param === 'weaveVerDashSpacing') {
                zone[param] = 0.30 - (valFloat / 100.0) * 0.30;
            } else if (param === 'weaveHorHoleDistance' || param === 'weaveVerHoleDistance') {
                zone[param] = 0.30 - (valFloat / 100.0) * 0.298;
            } else if (param === 'bigHoleFreq' || param === 'bigLineFreq' || param === 'swirlRows' || 
                       param === 'weaveHorCount' || param === 'weaveVerCount' ||
                       param === 'weaveHorBigHoleFreq' || param === 'weaveHorBigLineFreq' || param === 'weaveHorHoleWobbleFreq' || param === 'weaveHorHoleCount' ||
                       param === 'weaveVerBigHoleFreq' || param === 'weaveVerBigLineFreq' || param === 'weaveVerHoleWobbleFreq' || param === 'weaveVerHoleCount') {
                zone[param] = Math.round(valFloat);
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            } else if (param === 'scatterCount' || param === 'scatterSeed' || param === 'scatterSizeGroupsCount' ||
                       param === 'scatterQty1' || param === 'scatterQty2' || param === 'scatterQty3' || param === 'scatterQty4' || param === 'scatterQty5' ||
                       param === 'flowCount' || param === 'flowLength' || param === 'flowDotCount' ||
                       param === 'ribbonCount' || param === 'ribbonLines') {
                zone[param] = Math.round(valFloat);
                if (param === 'scatterSizeGroupsCount') {
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                }
            } else if (param === 'scatterMinSize' || param === 'scatterMaxSize' ||
                       param === 'scatterSize1' || param === 'scatterSize2' || param === 'scatterSize3' || param === 'scatterSize4' || param === 'scatterSize5' ||
                       param === 'flowScale' || param === 'flowFreq' || param === 'flowBaseAngle' || param === 'flowDotSize' ||
                       param === 'ribbonSpacing' || param === 'ribbonAmp' || param === 'ribbonFreq') {
                zone[param] = valFloat;
            } else if (param === 'thetaMin' || param === 'thetaMax' || param === 'centerTheta') {
                zone[param] = valFloat * Math.PI / 180;
            } else {
                zone[param] = valFloat;
            }
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
        }
        return;
    }
    
    switch (id) {
        // Position
        case 'pos-x': gourdMesh.position.x = valFloat; break;
        case 'pos-y': gourdMesh.position.y = valFloat; break;
        case 'pos-z': gourdMesh.position.z = valFloat; break;
        
        // Rotation
        case 'rot-x': gourdMesh.rotation.x = valFloat * deg2rad; break;
        case 'rot-y': gourdMesh.rotation.y = valFloat * deg2rad; break;
        case 'rot-z': gourdMesh.rotation.z = valFloat * deg2rad; break;
        
        // Scale
        case 'scale-u': 
            gourdMesh.scale.setScalar(valFloat);
            // Refresh measurement numbers inside badge overlay dynamically
            const badgeH = document.getElementById('badge-h');
            const badgeW = document.getElementById('badge-w');
            const unscaledMeas = calculateMeasurements(1.0, 1.0);
            if (badgeH) badgeH.textContent = (3.0 * valFloat).toFixed(2);
            if (badgeW) badgeW.textContent = (unscaledMeas.maxDiameter * valFloat).toFixed(2);
            if (onUpdateMeasure) onUpdateMeasure();
            break;
            
        // Pattern Parameters
        case 'pat-rotation':
            state.patRotation = valFloat;
            updatePatternGroup(patternGroup, state);
            break;
            
        case 'pat-tilt':
            state.patTilt = valFloat;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        case 'pat-hor-density':
            // Slider value (valFloat) is proximity percentage from 0 (Far) to 100 (Close).
            // At 0: Spacing = 3.0 cm. At 100: Spacing = 0.04 cm (almost touching).
            const horS = 3.0 - (valFloat / 100.0) * 2.96;
            state.patHorDensity = 1.0 / horS;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        case 'pat-hor-dash-spacing':
            // Slider value is proximity percentage. At 0: Spacing = 0.30 cm. At 100: Spacing = 0.00 cm.
            state.patHorDashSpacing = 0.30 - (valFloat / 100.0) * 0.30;
            updatePatternGroup(patternGroup, state);
            break;
            
        case 'pat-hor-opacity':
            state.patHorOpacity = valFloat;
            updatePatternGroup(patternGroup, state);
            break;

        case 'pat-hor-hole-size':
            state.patHorHoleSize = valFloat;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;

        case 'pat-hor-hole-spacing':
            state.patHorHoleSpacing = valFloat;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        case 'pat-hor-hole-count':
            // Slider value is proximity percentage. At 0: Count = 1. At 100: Count = 800 (touching).
            state.patHorHoleCount = Math.round(1.0 + (valFloat / 100.0) * 799.0);
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;

        case 'pat-hor-hole-distance':
            // Slider value is proximity percentage. At 0: Spacing = 0.30 cm. At 100: Spacing = 0.002 cm (touching).
            state.patHorHoleDistance = 0.30 - (valFloat / 100.0) * 0.298;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        case 'pat-ver-density':
            // Slider value is proximity percentage. At 0: Spacing = 3.0 cm. At 100: Spacing = 0.04 cm (almost touching).
            const verS = 3.0 - (valFloat / 100.0) * 2.96;
            state.patVerDensity = 1.0 / verS;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        case 'pat-ver-dash-spacing':
            // Slider value is proximity percentage. At 0: Spacing = 0.30 cm. At 100: Spacing = 0.00 cm.
            state.patVerDashSpacing = 0.30 - (valFloat / 100.0) * 0.30;
            updatePatternGroup(patternGroup, state);
            break;
            
        case 'pat-ver-opacity':
            state.patVerOpacity = valFloat;
            updatePatternGroup(patternGroup, state);
            break;

        case 'pat-ver-hole-size':
            state.patVerHoleSize = valFloat;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;

        case 'pat-ver-hole-count':
            // Slider value is proximity percentage. At 0: Count = 1. At 100: Count = 800 (touching).
            state.patVerHoleCount = Math.round(1.0 + (valFloat / 100.0) * 799.0);
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;

        case 'pat-ver-hole-distance':
            // Slider value is proximity percentage. At 0: Spacing = 0.30 cm. At 100: Spacing = 0.002 cm (touching).
            state.patVerHoleDistance = 0.30 - (valFloat / 100.0) * 0.298;
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            break;
            
        // Material Finish
        case 'mat-rough':
            gourdMesh.material.roughness = valFloat;
            break;
            
        case 'mat-metal':
            gourdMesh.material.metalness = valFloat;
            break;
            
        case 'mat-opacity':
            gourdMesh.material.transparent = valFloat < 1.0;
            gourdMesh.material.opacity = valFloat;
            break;

        case 'mat-texture-scale':
            state.textureScale = valFloat;
            if (gourdMesh.material.map) {
                gourdMesh.material.map.repeat.set(state.textureScale, state.textureScale * 0.85);
                gourdMesh.material.map.needsUpdate = true;
            }
            break;
            
        case 'mat-texture-rotation':
            state.textureRotation = valFloat;
            if (gourdMesh.material.map) {
                gourdMesh.material.map.offset.set(state.textureRotation / 360, 0);
                gourdMesh.material.map.needsUpdate = true;
            }
            break;
    }
}

// Sets the active tool state and manages styling indicators
const toolToTab = { select: null, measure: 'measure', pattern: 'pattern', position: 'pattern', transform: 'shape', shape: 'shape', carve: 'carve', camera: null };

export function selectTool(tool, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, controls) {
    state.currentTool = tool;
    
    // Highlight sidebar icon
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Auto switch tabs
    const targetTab = toolToTab[tool];
    if (targetTab) {
        state.activeTab = targetTab;
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === targetTab);
        });
        renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
    }
    
    // Tool-specific visual actions
    measureGroup.visible = (tool === 'measure');
    const measureVisCheckbox = document.getElementById('measure-lines-vis');
    if (measureVisCheckbox) measureVisCheckbox.checked = measureGroup.visible;
    
    const canvasEl = document.getElementById('viewport-canvas');
    if (tool === 'carve') {
        showToast('Lettering Carve Mode active — Customize words & typography on gourd', 'info');
        gourdMesh.material.emissive.set(0x2a1a08);
        gourdMesh.material.emissiveIntensity = 0.25;
        if (controls) controls.enabled = true;
        if (canvasEl) canvasEl.style.cursor = 'default';
    } else if (tool === 'position') {
        if (controls) controls.enabled = true;
        if (canvasEl) canvasEl.style.cursor = 'default';
        showToast('Position Mode active — Left click and drag on gourd to place active shape', 'warn');
        gourdMesh.material.emissive.set(0x0a1020);
        gourdMesh.material.emissiveIntensity = 0.15;
    } else {
        if (controls) controls.enabled = true;
        if (canvasEl) canvasEl.style.cursor = 'default';
        gourdMesh.material.emissive.set(0x000000);
        gourdMesh.material.emissiveIntensity = 0;
    }
    
    if (tool === 'camera') {
        showToast('Camera Preset Mode active — Select view directions from top left');
    }
}

// Registers global UI events like headers, view presets, menu panels
export function registerGlobalUIEvents(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, setCameraView, gridHelper, scene, camera, renderer) {
    // 1. Property panel Tab buttons
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.activeTab = tab.dataset.tab;
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });
    
    // 2. View Preset buttons (Front, Side, etc)
    document.querySelectorAll('.vp-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCameraView(btn.dataset.view);
        });
    });
    
    // 3. Take Snapshot button
    function generateSnapshotDefaultNotes() {
        let notes = "";
        
        // Camera angle details if OrbitControls is active
        const controls = window.appControls;
        if (controls && controls.object) {
            const cam = controls.object;
            const target = controls.target || new THREE.Vector3(0, 0, 0);
            const dir = new THREE.Vector3().subVectors(cam.position, target).normalize();
            
            // Calculate spherical polar coordinates (theta: azimuth, phi: polar)
            const polarRad = Math.acos(Math.max(-1, Math.min(1, dir.y)));
            const azimuthRad = Math.atan2(dir.x, dir.z);
            
            const polarDeg = Math.round(polarRad * (180 / Math.PI));
            const azimuthDeg = Math.round(azimuthRad * (180 / Math.PI));
            
            notes += `View Angle: Pitch ${90 - polarDeg}°, Yaw ${azimuthDeg}°\n`;
        }
        
        // Active design layers
        if (state && state.patternZones && state.patternZones.length > 0) {
            notes += "Active Layers:\n";
            state.patternZones.forEach((zone, idx) => {
                if (zone.style !== 'off') {
                    const name = zone.name || `Layer ${idx + 1}`;
                    const styleName = zone.style.charAt(0).toUpperCase() + zone.style.slice(1);
                    const patName = zone.patternType ? zone.patternType.replace('-', ' ') : 'default';
                    notes += `• ${name}: ${styleName} (${patName})\n`;
                }
            });
        }
        
        return notes;
    }

    function generateCompositeScreenshot(base64Image, noteText, callback) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const w = img.width;
            const h = img.height;
            
            // Create offscreen canvas with extra height at the bottom for the spec card
            const footerHeight = 160;
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h + footerHeight;
            
            const ctx = canvas.getContext('2d');
            
            // 1. Draw original WebGL screenshot
            ctx.drawImage(img, 0, 0);
            
            // 2. Draw footer card background
            ctx.fillStyle = "#1e1e24"; // Match modal content background
            ctx.fillRect(0, h, w, footerHeight);
            
            // 3. Draw border separator
            ctx.fillStyle = "#2a2a30";
            ctx.fillRect(0, h, w, 2);
            
            // 4. Draw Branding logo
            ctx.fillStyle = "#D4A843";
            ctx.font = "bold 18px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
            ctx.fillText("KIBUYU DESIGN STUDIO", 30, h + 35);
            
            // 5. Draw Note details (wrapped)
            ctx.fillStyle = "#e0e0e5";
            ctx.font = "12px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
            
            const lines = noteText.split('\n');
            let currentY = h + 60;
            const lineHeight = 18;
            
            for (const line of lines) {
                if (currentY > h + footerHeight - 12) break; // clip if overflowing
                ctx.fillText(line, 30, currentY);
                currentY += lineHeight;
            }
            
            // Right Column: Color Swatches
            const swatchesX = w - 240;
            ctx.fillStyle = "#a0a0a5";
            ctx.font = "bold 11px 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
            ctx.fillText("ACTIVE COLOR PALETTE", swatchesX, h + 32);
            
            if (state && state.patternZones) {
                const activeColors = [...new Set(
                    state.patternZones
                        .filter(zone => zone.style !== 'off')
                        .map(zone => zone.color)
                )];
                
                let swatchOffset = 0;
                activeColors.forEach(colorHex => {
                    const cx = swatchesX + swatchOffset * 36 + 12;
                    const cy = h + 65;
                    
                    // Draw circle swatch background
                    ctx.beginPath();
                    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
                    ctx.fillStyle = colorHex;
                    ctx.fill();
                    
                    // Draw circle border
                    ctx.beginPath();
                    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
                    ctx.lineWidth = 2.5;
                    ctx.strokeStyle = "#ffffff";
                    ctx.stroke();
                    
                    swatchOffset++;
                });
            }
            
            callback(canvas.toDataURL('image/png'));
        };
        img.crossOrigin = "anonymous";
        img.src = base64Image;
    }

    let currentSnapshotDataUrl = null;
    document.getElementById('btn-export')?.addEventListener('click', () => {
        // Temporarily hide helpers to make it a clean viewpoint screenshot
        const oldGridVis = gridHelper ? gridHelper.visible : true;
        if (gridHelper) gridHelper.visible = false;
        
        const oldMeasureVis = measureGroup ? measureGroup.visible : true;
        if (measureGroup) measureGroup.visible = false;
        
        // Re-render
        renderer.render(scene, camera);
        
        // Get snapshot data
        currentSnapshotDataUrl = renderer.domElement.toDataURL('image/png');
        
        // Restore helpers and re-render
        if (gridHelper) gridHelper.visible = oldGridVis;
        if (measureGroup) measureGroup.visible = oldMeasureVis;
        renderer.render(scene, camera);
        
        // Show snapshot preview modal
        const modal = document.getElementById('screenshot-modal');
        const img = document.getElementById('screenshot-preview-img');
        const notesInput = document.getElementById('screenshot-notes-input');
        if (modal && img) {
            img.src = currentSnapshotDataUrl;
            if (notesInput) {
                notesInput.value = generateSnapshotDefaultNotes();
            }
            modal.style.display = 'flex';
            const overlay = document.getElementById('mobile-hotspots-overlay');
            if (overlay) overlay.style.display = 'none';
        }
    });

    // Close screenshot modal events
    document.getElementById('btn-close-screenshot')?.addEventListener('click', () => {
        const modal = document.getElementById('screenshot-modal');
        if (modal) modal.style.display = 'none';
        const overlay = document.getElementById('mobile-hotspots-overlay');
        if (overlay) overlay.style.display = 'flex';
    });

    document.getElementById('screenshot-modal')?.addEventListener('click', (e) => {
        const modal = document.getElementById('screenshot-modal');
        if (e.target === modal && modal) {
            modal.style.display = 'none';
            const overlay = document.getElementById('mobile-hotspots-overlay');
            if (overlay) overlay.style.display = 'flex';
        }
    });

    // Download snapshot button
    document.getElementById('btn-download-screenshot')?.addEventListener('click', () => {
        if (!currentSnapshotDataUrl) return;
        const notesText = document.getElementById('screenshot-notes-input')?.value || "";
        
        generateCompositeScreenshot(currentSnapshotDataUrl, notesText, (compositeUrl) => {
            const link = document.createElement('a');
            link.download = `kibuyu-custom-design-${Date.now()}.png`;
            link.href = compositeUrl;
            link.click();
            showToast('Snapshot saved with design details & color palette!', 'success');
        });
    });

    // Copy to clipboard button
    document.getElementById('btn-copy-screenshot')?.addEventListener('click', async () => {
        if (!currentSnapshotDataUrl) return;
        const notesText = document.getElementById('screenshot-notes-input')?.value || "";
        
        generateCompositeScreenshot(currentSnapshotDataUrl, notesText, async (compositeUrl) => {
            try {
                const response = await fetch(compositeUrl);
                const blob = await response.blob();
                await navigator.clipboard.write([
                    new ClipboardItem({
                        'image/png': blob
                    })
                ]);
                showToast('Snapshot with design details copied to clipboard!', 'success');
            } catch (err) {
                console.error('Failed to copy image to clipboard:', err);
                showToast('Failed to copy to clipboard. Please save image instead.', 'error');
            }
        });
    });
    
    // 4. Undo and Redo Button bindings
    document.getElementById('btn-undo')?.addEventListener('click', () => {
        const restored = performUndo(gourdMesh, () => {
            updatePatternGroup(patternGroup, state);
            updateCarveGroup(carveGroup, state);
            
            const unscaledMeas = calculateMeasurements(1.0, 1.0);
            updateMeasureLines(measureGroup, unscaledMeas);
            
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
            updatePhotoGuideOverlay();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
        if (restored) {
            showToast('Undo completed', 'warn');
        } else {
            showToast('No actions to undo');
        }
    });
    
    document.getElementById('btn-redo')?.addEventListener('click', () => {
        const restored = performRedo(gourdMesh, () => {
            updatePatternGroup(patternGroup, state);
            updateCarveGroup(carveGroup, state);
            
            const unscaledMeas = calculateMeasurements(1.0, 1.0);
            updateMeasureLines(measureGroup, unscaledMeas);
            
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
            updatePhotoGuideOverlay();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
        if (restored) {
            showToast('Redo completed', 'warn');
        } else {
            showToast('No actions to redo');
        }
    });
    
    // 5. Toolbars (Left buttons and Mobile nav buttons)
    document.querySelectorAll('.tool-btn, .mobile-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            const controls = window.appControls; // Hook OrbitControls reference globally
            selectTool(tool, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, controls);
            
            // Sync mobile button selection with desktop buttons
            document.querySelectorAll('.tool-btn, .mobile-nav-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.tool === tool);
            });
        });
    });
    
    // 6. View Header Dropdown Menu wireframe
    const viewMenuBtn = document.getElementById('menu-view-btn');
    const viewDropdown = document.getElementById('view-dropdown');
    
    if (viewMenuBtn && viewDropdown) {
        viewMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = viewMenuBtn.getBoundingClientRect();
            viewDropdown.style.left = `${rect.left}px`;
            viewDropdown.style.top = `${rect.bottom + 4}px`;
            
            const isVisible = viewDropdown.style.display === 'block';
            viewDropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        window.addEventListener('click', () => {
            viewDropdown.style.display = 'none';
        });
        
        // Dropdown Items actions
        viewDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = item.dataset.viewAction;
                if (action.startsWith('camera-')) {
                    setCameraView(action.split('-')[1]);
                } else if (action === 'toggle-grid') {
                    state.gridVisible = !state.gridVisible;
                    gridHelper.visible = state.gridVisible;
                    item.classList.toggle('checked', state.gridVisible);
                    showToast(state.gridVisible ? 'Grid enabled' : 'Grid hidden');
                } else if (action === 'toggle-patterns') {
                    state.patternVisible = !state.patternVisible;
                    patternGroup.visible = state.patternVisible;
                    item.classList.toggle('checked', state.patternVisible);
                    showToast(state.patternVisible ? 'Patterns visible' : 'Patterns hidden');
                }
                viewDropdown.style.display = 'none';
            });
        });
    }
    
    // 7. File Header Dropdown Menu and File Import/Export logic
    const fileMenuBtn = document.getElementById('menu-file-btn');
    const fileDropdown = document.getElementById('file-dropdown');
    
    if (fileMenuBtn && fileDropdown) {
        fileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = fileMenuBtn.getBoundingClientRect();
            fileDropdown.style.left = `${rect.left}px`;
            fileDropdown.style.top = `${rect.bottom + 4}px`;
            
            const isVisible = fileDropdown.style.display === 'block';
            fileDropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        window.addEventListener('click', () => {
            fileDropdown.style.display = 'none';
        });
    }

    const projectNameInput = document.getElementById('project-name-input');
    if (projectNameInput) {
        projectNameInput.addEventListener('change', () => {
            let name = projectNameInput.value.trim().replace(/[^a-zA-Z0-9\-_]/g, '');
            if (!name) name = 'gourd-project';
            projectNameInput.value = name;
            state.projectName = name;
            showToast(`Project renamed to: ${name}`, 'success');
        });
        state.projectName = projectNameInput.value;
    }

    function downloadJson(data, filename) {
        const str = JSON.stringify(data, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + '.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // Save Project
    const btnSaveProject = document.getElementById('menu-save-project');
    if (btnSaveProject) {
        btnSaveProject.addEventListener('click', () => {
            const shapeParams = {
                gourdHeight: state.gourdHeight,
                gourdBaseRadius: state.gourdBaseRadius,
                gourdBulbRadius: state.gourdBulbRadius,
                gourdNeckRadius: state.gourdNeckRadius,
                gourdRimRadius: state.gourdRimRadius,
                gourdBulbPosition: state.gourdBulbPosition,
                gourdBulbRoundness: state.gourdBulbRoundness,
                gourdNeckPosition: state.gourdNeckPosition,
                gourdNeckHeight: state.gourdNeckHeight,
                gourdNeckRoundness: state.gourdNeckRoundness,
                gourdUpperNeckWidth: state.gourdUpperNeckWidth,
                gourdUpperNeckPosition: state.gourdUpperNeckPosition,
                gourdBendX: state.gourdBendX,
                gourdBendZ: state.gourdBendZ
            };
            const projectData = {
                type: 'kibuyu-project',
                name: state.projectName || 'my-artisan-gourd',
                shape: shapeParams,
                layers: state.patternZones,
                texture: {
                    dataURL: state.textureDataURL,
                    scale: state.textureScale,
                    rotation: state.textureRotation
                }
            };
            downloadJson(projectData, projectData.name);
            showToast('Project file exported!', 'success');
        });
    }

    // Trigger Load Project
    const btnLoadProject = document.getElementById('menu-load-project');
    const inputImportProject = document.getElementById('file-import-project');
    if (btnLoadProject && inputImportProject) {
        btnLoadProject.addEventListener('click', () => inputImportProject.click());
        inputImportProject.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.type !== 'kibuyu-project') {
                        showToast('Invalid project file type!', 'error');
                        return;
                    }
                    pushUndoState(gourdMesh);
                    if (data.name) {
                        state.projectName = data.name;
                        if (projectNameInput) projectNameInput.value = data.name;
                    }
                    if (data.shape) {
                        Object.assign(state, data.shape);
                    }
                    if (data.layers) {
                        state.patternZones = data.layers;
                        state.activeZoneId = state.patternZones[0] ? state.patternZones[0].id : null;
                    }
                    if (data.texture) {
                        state.textureDataURL = data.texture.dataURL || null;
                        state.textureScale = data.texture.scale !== undefined ? data.texture.scale : 1.0;
                        state.textureRotation = data.texture.rotation !== undefined ? data.texture.rotation : 0;
                        applyGourdTexture(gourdMesh, state.textureDataURL, state.textureScale, state.textureRotation);
                    } else {
                        state.textureDataURL = null;
                        applyGourdTexture(gourdMesh, null);
                    }
                    updateGourdGeometryImmediate(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    showToast('Project loaded successfully!', 'success');
                } catch (err) {
                    showToast('Failed to parse project file!', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    // Save Shape
    const btnSaveShape = document.getElementById('menu-save-shape');
    if (btnSaveShape) {
        btnSaveShape.addEventListener('click', () => {
            const shapeData = {
                type: 'kibuyu-shape',
                shape: {
                    gourdHeight: state.gourdHeight,
                    gourdBaseRadius: state.gourdBaseRadius,
                    gourdBulbRadius: state.gourdBulbRadius,
                    gourdNeckRadius: state.gourdNeckRadius,
                    gourdRimRadius: state.gourdRimRadius,
                    gourdBulbPosition: state.gourdBulbPosition,
                    gourdBulbRoundness: state.gourdBulbRoundness,
                    gourdNeckPosition: state.gourdNeckPosition,
                    gourdNeckHeight: state.gourdNeckHeight,
                    gourdNeckRoundness: state.gourdNeckRoundness,
                    gourdUpperNeckWidth: state.gourdUpperNeckWidth,
                    gourdUpperNeckPosition: state.gourdUpperNeckPosition,
                    gourdBendX: state.gourdBendX,
                    gourdBendZ: state.gourdBendZ
                }
            };
            downloadJson(shapeData, (state.projectName || 'gourd') + '-shape');
            showToast('Gourd shape exported!', 'success');
        });
    }

    // Trigger Load Shape
    const btnLoadShape = document.getElementById('menu-load-shape');
    const inputImportShape = document.getElementById('file-import-shape');
    if (btnLoadShape && inputImportShape) {
        btnLoadShape.addEventListener('click', () => inputImportShape.click());
        inputImportShape.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.type !== 'kibuyu-shape') {
                        showToast('Invalid shape file!', 'error');
                        return;
                    }
                    pushUndoState(gourdMesh);
                    if (data.shape) {
                        Object.assign(state, data.shape);
                    }
                    updateGourdGeometryImmediate(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
                    showToast('Gourd shape loaded!', 'success');
                } catch (err) {
                    showToast('Failed to parse shape file!', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    // Copy Layout (Clipboard)
    const btnCopyLayout = document.getElementById('menu-copy-layout');
    if (btnCopyLayout) {
        btnCopyLayout.addEventListener('click', () => {
            const layoutData = {
                type: 'kibuyu-layout',
                layers: state.patternZones
            };
            navigator.clipboard.writeText(JSON.stringify(layoutData, null, 2))
                .then(() => showToast('Layout JSON copied to clipboard!', 'success'))
                .catch(() => {
                    prompt('Copy this layout JSON:', JSON.stringify(layoutData));
                });
        });
    }

    // Paste Layout (Clipboard / Prompt)
    const btnPasteLayout = document.getElementById('menu-paste-layout');
    if (btnPasteLayout) {
        btnPasteLayout.addEventListener('click', () => {
            function loadPastedJSON(text) {
                try {
                    const data = JSON.parse(text);
                    if (data.type !== 'kibuyu-layout') {
                        showToast('Invalid layout data format!', 'error');
                        return;
                    }
                    pushUndoState(gourdMesh);
                    state.patternZones = data.layers;
                    state.activeZoneId = state.patternZones[0] ? state.patternZones[0].id : null;
                    updatePatternGroupImmediate(patternGroup, state);
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    showToast('Layout loaded successfully!', 'success');
                } catch (err) {
                    showToast('Invalid JSON syntax!', 'error');
                }
            }

            navigator.clipboard.readText()
                .then(text => loadPastedJSON(text))
                .catch(() => {
                    const pasted = prompt('Paste layout JSON here:');
                    if (pasted) loadPastedJSON(pasted);
                });
        });
    }

    // Save Layout File
    const btnSaveLayout = document.getElementById('menu-save-layout');
    if (btnSaveLayout) {
        btnSaveLayout.addEventListener('click', () => {
            const layoutData = {
                type: 'kibuyu-layout',
                layers: state.patternZones
            };
            downloadJson(layoutData, (state.projectName || 'gourd') + '-layout');
            showToast('Layout file exported!', 'success');
        });
    }

    // Load Layout File
    const btnLoadLayout = document.getElementById('menu-load-layout');
    const inputImportLayout = document.getElementById('file-import-layout');
    if (btnLoadLayout && inputImportLayout) {
        btnLoadLayout.addEventListener('click', () => inputImportLayout.click());
        inputImportLayout.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.type !== 'kibuyu-layout') {
                        showToast('Invalid layout file!', 'error');
                        return;
                    }
                    pushUndoState(gourdMesh);
                    state.patternZones = data.layers;
                    state.activeZoneId = state.patternZones[0] ? state.patternZones[0].id : null;
                    updatePatternGroupImmediate(patternGroup, state);
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                    showToast('Layout loaded successfully!', 'success');
                } catch (err) {
                    showToast('Failed to parse layout file!', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch (e.key.toLowerCase()) {
            case 'v': 
                selectTool('select', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 'm': 
                selectTool('measure', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 'p': 
                selectTool('pattern', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 't': 
                selectTool('shape', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 'c': 
                selectTool('carve', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 'k': 
                selectTool('camera', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
                break;
            case 'z': 
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        document.getElementById('btn-redo')?.click();
                    } else {
                        document.getElementById('btn-undo')?.click();
                    }
                }
                break;
        }
    });
    
    // Mobile hotspot click listeners
    document.querySelectorAll('.gourd-hotspot').forEach(btn => {
        btn.addEventListener('click', () => {
            openMobileAdjustments(btn.dataset.section, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    // Mobile adjustments bar close button
    document.getElementById('btn-close-adjustments')?.addEventListener('click', () => {
        const bar = document.getElementById('mobile-adjustments-bar');
        if (bar) {
            bar.classList.remove('open');
            setTimeout(() => {
                bar.style.display = 'none';
            }, 300);
        }
        state.activeMobileSection = null;
        document.querySelectorAll('.gourd-hotspot').forEach(btn => btn.classList.remove('active'));
    });

    // Load initial texture if present
    if (state.textureDataURL) {
        applyGourdTexture(gourdMesh, state.textureDataURL, state.textureScale, state.textureRotation);
    }
}

export function updatePhotoGuideOverlay() {
    const el = document.getElementById('viewport-photo-guide');
    if (el) {
        if (state.gourdPhotoGuide) {
            el.style.backgroundImage = `url(${state.gourdPhotoGuide})`;
            el.style.opacity = state.gourdPhotoOpacity;
            el.style.transform = `translate(${state.gourdPhotoX}px, ${state.gourdPhotoY}px) scale(${state.gourdPhotoScale})`;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }
}

let gourdArgs = null;
let isGourdUpdateScheduled = false;

export function updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup) {
    gourdArgs = { gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup };
    if (!isGourdUpdateScheduled) {
        isGourdUpdateScheduled = true;
        requestAnimationFrame(() => {
            if (gourdArgs) {
                updateGourdGeometryImmediate(
                    gourdArgs.gourdMesh,
                    gourdArgs.patternGroup,
                    gourdArgs.measureGroup,
                    gourdArgs.onUpdatePattern,
                    gourdArgs.onUpdateMeasure,
                    gourdArgs.carveGroup
                );
            }
            isGourdUpdateScheduled = false;
        });
    }
}

export function updateGourdGeometryImmediate(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup) {
    if (gourdMesh) {
        gourdMesh.geometry.dispose();
        gourdMesh.geometry = createGourdGeometry();
        
        const H = state.gourdHeight || 30.0;
        const H_three = H * 0.1;
        
        // Re-position grid and ground in scene
        const scene = gourdMesh.parent;
        if (scene) {
            const grid = scene.children.find(c => c instanceof THREE.GridHelper);
            if (grid) {
                grid.position.y = -H_three / 2;
            }
            const ground = scene.children.find(c => c.material && c.material instanceof THREE.ShadowMaterial);
            if (ground) {
                ground.position.y = -H_three / 2 - 0.01;
            }
        }

        // Update info badge HUD
        const badgeH = document.getElementById('badge-h');
        const badgeW = document.getElementById('badge-w');
        if (badgeH) badgeH.innerText = H.toFixed(1);
        if (badgeW) badgeW.innerText = ((state.gourdBulbRadius || 9.0) * 2.0).toFixed(1);
        
        updatePatternGroupImmediate(patternGroup, state);
        if (carveGroup) {
            updateCarveGroup(carveGroup, state);
        }
        if (onUpdatePattern) onUpdatePattern();
        if (onUpdateMeasure) onUpdateMeasure();
    }
}

export function openMobileAdjustments(section, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, isUpdate = false) {
    const bar = document.getElementById('mobile-adjustments-bar');
    const title = document.getElementById('adjustments-bar-title');
    const content = document.getElementById('adjustments-bar-body');
    if (!bar || !title || !content) return;

    state.activeMobileSection = section;

    if (!isUpdate) {
        // Highlight current active hotspot button
        document.querySelectorAll('.gourd-hotspot').forEach(btn => {
            if (btn.dataset.section === section) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        bar.style.display = 'block';
        setTimeout(() => bar.classList.add('open'), 10);
    }

    let html = '';

    if (section === 'neck') {
        title.innerText = 'Adjust Gourd Neck';
        const hasNeck = state.gourdHasNeck !== false;
        const neckPos = state.gourdNeckPosition !== undefined ? state.gourdNeckPosition : 0.55;
        const H = state.gourdHeight || 30.0;
        const defaultNeckHeight = (1.0 - neckPos) * H;
        const neckHVal = state.gourdNeckHeight !== undefined ? state.gourdNeckHeight : defaultNeckHeight;
        html = `
            ${sliderRow('Neck Width', 'gourd-neckRadius', 1.0, 10.0, 0.1, state.gourdNeckRadius || 3.8, 'cm')}
            ${sliderRow('Neck Junction', 'gourd-neckPosition', 0.4, 0.75, 0.01, state.gourdNeckPosition || 0.55)}
            ${sliderRow('Neck Height', 'gourd-neckHeight', 2.0, 40.0, 0.1, neckHVal, 'cm')}
            ${sliderRow('Neck Roundness', 'gourd-neckRoundness', 0.5, 3.0, 0.05, state.gourdNeckRoundness || 1.0)}
            
            <div class="control-row" style="margin: 10px 0 6px 0; justify-content: flex-start; gap: 8px;">
                <input type="checkbox" id="gourd-hasNeck" ${hasNeck ? 'checked' : ''} style="width: auto;">
                <label for="gourd-hasNeck" style="font-size: 11px; cursor: pointer; color: var(--color-tx);">Has Upper Neck Curvature</label>
            </div>
            
            ${hasNeck ? `
                ${sliderRow('Upper Neck Width', 'gourd-upperNeckWidth', 1.0, 12.0, 0.1, state.gourdUpperNeckWidth || 3.24, 'cm')}
                ${sliderRow('Upper Neck Height', 'gourd-upperNeckPosition', 0.6, 0.95, 0.01, state.gourdUpperNeckPosition || 0.78)}
            ` : ''}
        `;
    } else if (section === 'bend') {
        title.innerText = 'Adjust Shape Bending';
        html = `
            ${sliderRow('Lateral Bend (X)', 'gourd-bendX', -5.0, 5.0, 0.1, state.gourdBendX || 0.0, 'cm')}
            ${sliderRow('Lateral Bend (Z)', 'gourd-bendZ', -5.0, 5.0, 0.1, state.gourdBendZ || 0.0, 'cm')}
        `;
    } else if (section === 'body') {
        title.innerText = 'Adjust Gourd Body';
        html = `
            ${sliderRow('Gourd Height', 'gourd-height', 10.0, 60.0, 0.5, state.gourdHeight || 30.0, 'cm')}
            ${sliderRow('Base Width', 'gourd-baseRadius', 1.0, 10.0, 0.1, state.gourdBaseRadius || 3.5, 'cm')}
            ${sliderRow('Rim Width', 'gourd-rimRadius', 1.0, 10.0, 0.1, state.gourdRimRadius || 2.7, 'cm')}
            ${sliderRow('Bulb Width', 'gourd-bulbRadius', 3.0, 20.0, 0.1, state.gourdBulbRadius || 9.0, 'cm')}
            ${sliderRow('Bulb Height', 'gourd-bulbPosition', 0.1, 0.4, 0.01, state.gourdBulbPosition || 0.25)}
            ${sliderRow('Bulb Roundness', 'gourd-bulbRoundness', 0.5, 4.0, 0.05, state.gourdBulbRoundness || 1.0)}
        `;
    } else if (section === 'pattern') {
        title.innerText = 'Adjust Surface Patterns';
        html = getPanelHTML('pattern', gourdMesh, carveGroup, measureGroup);
    }

    content.innerHTML = html;

    if (section === 'pattern') {
        // Wire full controls using shared wireFormControls logic
        wireFormControls(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        
        // Wire pattern Zone card accordion toggle header clicks
        content.querySelectorAll('.zone-card-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // If clicked an action button inside the header, don't toggle accordion
                if (e.target.closest('.zone-card-actions') || e.target.closest('.zone-name-input')) {
                    return;
                }
                const card = header.closest('.zone-card');
                if (card) {
                    const zoneId = card.id.replace('zone-card-', '');
                    state.activeZoneId = (state.activeZoneId === zoneId) ? null : zoneId;
                    renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                }
            });
        });
    } else {
        // Manual wiring for shape sub-sections (neck, bend, body)
        content.querySelectorAll('input[type="range"]').forEach(slider => {
            const numInput = content.querySelector(`#${slider.id}-num`);
            
            const syncValue = (val) => {
                if (numInput) numInput.value = parseFloat(val).toFixed(2);
                applyInputChanges(slider.id, val, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            };
            
            slider.addEventListener('input', () => syncValue(slider.value));
            slider.addEventListener('change', () => {
                pushUndoState(gourdMesh);
                syncValue(slider.value);
            });
        });

        content.querySelectorAll('input[type="number"]').forEach(numInput => {
            const slider = content.querySelector(`#${numInput.id.replace('-num', '')}`);
            
            const syncValue = (val) => {
                if (slider) slider.value = val;
                applyInputChanges(numInput.id.replace('-num', ''), val, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            };
            
            numInput.addEventListener('input', () => syncValue(numInput.value));
            numInput.addEventListener('change', () => {
                pushUndoState(gourdMesh);
                syncValue(numInput.value);
            });
        });

        const hasNeckCheck = content.querySelector('#gourd-hasNeck');
        if (hasNeckCheck) {
            hasNeckCheck.addEventListener('change', () => {
                pushUndoState(gourdMesh);
                state.gourdHasNeck = hasNeckCheck.checked;
                updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure, carveGroup);
                openMobileAdjustments(section, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, true);
            });
        }
    }
}
