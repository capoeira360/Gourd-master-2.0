import { state, pushUndoState, performUndo, performRedo, addPatternZone, removePatternZone, duplicatePatternZone } from './state.js';
import { calculateMeasurements, updateMeasureLines } from './measure.js';
import { updatePatternGroup } from './pattern.js';
import { updateCarveGroup, clearCarvings } from './carve.js';
import * as THREE from 'three';
import { gourdRadius, createGourdGeometry } from './gourd.js';

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

// Row template for ranges and number sync inputs
function sliderRow(label, id, min, max, step, value, unit = '') {
    return `<div class="control-row">
        <label class="control-label" for="${id}">${id.startsWith('rot') ? label + ' Axis' : label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
        <input type="number" id="${id}-num" min="${min}" max="${max}" step="${step}" value="${parseFloat(value).toFixed(2)}">
        <span class="control-unit">${unit}</span>
    </div>`;
}

// Helper to convert hex string to THREE.Color
function setMeshColor(gourdMesh, hex) {
    if (gourdMesh) {
        gourdMesh.material.color.set(hex);
    }
}

// Builds panel HTML content based on the active tab and current model state
function getPanelHTML(tab, gourdMesh, carveGroup, measureGroup) {
    if (!gourdMesh) return '';
    
    if (tab === 'shape') {
        const isPhotoSet = !!state.gourdPhotoGuide;
        const photoOpacityProx = Math.round((state.gourdPhotoOpacity || 0.4) * 100);
        const hasNeck = state.gourdHasNeck !== false;
        
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
                ${sliderRow('Neck Height', 'gourd-neckPosition', 0.4, 0.75, 0.01, state.gourdNeckPosition || 0.55)}
                ${sliderRow('Neck Roundness', 'gourd-neckRoundness', 0.5, 3.0, 0.05, state.gourdNeckRoundness || 1.0)}

                <div class="panel-section-title">Upper Neck Curvature</div>
                ${sliderRow('Upper Neck Width', 'gourd-upperNeckWidth', 1.0, 12.0, 0.1, state.gourdUpperNeckWidth || 3.24, 'cm')}
                ${sliderRow('Upper Neck Height', 'gourd-upperNeckPosition', 0.6, 0.95, 0.01, state.gourdUpperNeckPosition || 0.78)}
            ` : ''}

            <div class="panel-section-title">Uneven Shape (Bending)</div>
            ${sliderRow('Lateral Bend (X)', 'gourd-bendX', -5.0, 5.0, 0.1, state.gourdBendX || 0.0, 'cm')}
            ${sliderRow('Lateral Bend (Z)', 'gourd-bendZ', -5.0, 5.0, 0.1, state.gourdBendZ || 0.0, 'cm')}
            
            <div class="panel-section-title">Artisan Blueprint Export</div>
            <button id="btn-export-blueprint" class="btn-primary" style="width: 100%; margin-top: 5px; margin-bottom: 8px; justify-content: center;">
                <i class="fas fa-print"></i> Generate Wrap Blueprint
            </button>
            <div class="info-badge-sub" style="font-size: 10px; line-height: 1.4; color: var(--color-tx-m);">
                Generates a 1:1 scale flattened pattern wrapper template. Cut, wrap around your physical gourd, and drill/carve directly through!
            </div>
        `;
    }
    
    if (tab === 'pattern') {
        const zoneCards = state.patternZones.map(zone => {
            const s = 1.0 / zone.density;
            const densityProx = Math.max(0, Math.min(100, Math.round(100 * (3.0 - s) / 2.96)));
            const dashProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.dashSpacing) / 0.30)));
            const holeDistProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.holeDistance) / 0.298)));
            const holeCountProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeCount - 1) / 799)));

            const isLocalShape = ['circle', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type);
            
            let fillTypeSelect = '';
            if (isLocalShape) {
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
            if (!isLocalShape || zone.fillType !== 'concentric') {
                orientationSelect = `
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Orientation</label>
                        <select class="zone-direction-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="both" ${zone.direction === 'both' ? 'selected' : ''}>Both Directions</option>
                            <option value="horizontal" ${zone.direction === 'horizontal' ? 'selected' : ''}>${zone.patternType === 'diamond' ? 'Clockwise' : 'Horizontal'} Only</option>
                            <option value="vertical" ${zone.direction === 'vertical' ? 'selected' : ''}>${zone.patternType === 'diamond' ? 'Counter-CW' : 'Vertical'} Only</option>
                        </select>
                    </div>
                `;
            }

            let patternTypeSelector = '';
            if (!isLocalShape || zone.fillType !== 'concentric') {
                patternTypeSelector = `
                    <div class="control-row" style="margin-bottom: 8px; flex-direction: column; align-items: flex-start;">
                        <label class="control-label" style="margin-bottom: 6px;">Pattern Layout</label>
                        <div class="btn-grid-options" style="width: 100%; margin-bottom: 0;">
                            <button class="option-btn ${zone.patternType === 'grid' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="grid" style="padding: 4px; font-size: 10px;">Grid</button>
                            <button class="option-btn ${zone.patternType === 'diamond' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="diamond" style="padding: 4px; font-size: 10px;">Diamond</button>
                            <button class="option-btn ${zone.patternType === 'zigzag' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="zigzag" style="padding: 4px; font-size: 10px;">Zigzag</button>
                            <button class="option-btn ${zone.patternType === 'spiral' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-type="spiral" style="padding: 4px; font-size: 10px;">Spiral</button>
                        </div>
                    </div>
                `;
            }

            let boundsSliders = '';
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
            } else if (['circle', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
                boundsSliders = `
                    ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                    ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                    ${sliderRow('Shape Size', `pat-zone-radius-${zone.id}`, 0.02, 0.6, 0.01, zone.radius, 'cm')}
                    ${sliderRow('Rotation', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                `;
            }

            let styleControls = '';
            const leanAngleVal = zone.leanAngle !== undefined ? zone.leanAngle : 0.0;
            const hasVertical = zone.direction === 'both' || zone.direction === 'vertical';
            const showLean = hasVertical && (!isLocalShape || zone.fillType !== 'concentric');

            if (zone.style === 'lines') {
                styleControls = `
                    ${sliderRow('Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx)}
                    ${sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx)}
                    ${showLean ? sliderRow('Line Lean Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, leanAngleVal, '°') : ''}
                    <div class="control-row" style="margin-bottom: 10px;">
                        <label class="control-label">Line Color</label>
                        <input type="color" class="zone-color-input" data-zone-id="${zone.id}" value="${zone.color}">
                        <span class="color-hex-text">${zone.color.toUpperCase()}</span>
                    </div>
                `;
            } else if (zone.style === 'holes') {
                const isWobbly = zone.holeShape === 'wobbly';
                const wobbleAmpProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeWobbleAmp || 0) / 0.4)));

                styleControls = `
                    ${sliderRow('Row Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx)}
                    ${showLean ? sliderRow('Line Lean Skew', `pat-zone-leanAngle-${zone.id}`, -45, 45, 1, leanAngleVal, '°') : ''}
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Hole Shape</label>
                        <select class="zone-hole-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="round" ${zone.holeShape === 'round' ? 'selected' : ''}>Round Hole</option>
                            <option value="wobbly" ${zone.holeShape === 'wobbly' ? 'selected' : ''}>Wobbly Shape</option>
                        </select>
                    </div>
                    ${sliderRow('Hole Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.10, 0.005, zone.holeSize, 'cm')}
                    ${isWobbly ? `
                        ${sliderRow('Wobble Waves', `pat-zone-holeWobbleFreq-${zone.id}`, 3, 12, 1, zone.holeWobbleFreq || 5)}
                        ${sliderRow('Wobble Depth', `pat-zone-holeWobbleAmp-${zone.id}`, 0, 100, 1, wobbleAmpProx)}
                    ` : ''}
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label">Layout Mode</label>
                        <div class="btn-grid-options" style="flex: 1; margin-bottom: 0; grid-template-cols: 1fr 1fr;">
                            <button class="option-btn ${zone.distMode === 'count' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="count" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Count</button>
                            <button class="option-btn ${zone.distMode === 'distance' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-dist-mode="distance" style="padding: 4px 6px; font-size: 9px; min-height: 20px;">By Distance</button>
                        </div>
                    </div>
                    ${zone.distMode === 'count' ? `
                        ${sliderRow('Hole Count', `pat-zone-holeCount-${zone.id}`, 0, 100, 1, holeCountProx)}
                    ` : `
                        ${sliderRow('Hole Spacing', `pat-zone-holeDistance-${zone.id}`, 0, 100, 1, holeDistProx)}
                    `}
                `;
            } else {
                styleControls = `<p style="color: var(--color-tx-m); font-size: 11px; margin-bottom: 8px; font-style: italic;">Layer disabled</p>`;
            }

            const isActive = zone.id === state.activeZoneId;
            const isHidden = zone.visible === false;

            let cardBody = '';
            if (isActive) {
                cardBody = `
                    <div class="zone-card-body">
                        <div class="control-row" style="margin-bottom: 8px;">
                            <label class="control-label" style="width: 35%;">Layer Shape</label>
                            <select class="zone-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                                <option value="full" ${zone.type === 'full' ? 'selected' : ''}>Full Gourd</option>
                                <option value="hor-band" ${zone.type === 'hor-band' ? 'selected' : ''}>Horizontal Band</option>
                                <option value="ver-strip" ${zone.type === 'ver-strip' ? 'selected' : ''}>Vertical Strip</option>
                                <option value="diagonal-stripe" ${zone.type === 'diagonal-stripe' ? 'selected' : ''}>Diagonal Stripe</option>
                                <option value="circular-patch" ${zone.type === 'circular-patch' ? 'selected' : ''}>Circular Patch</option>
                                <option value="square-patch" ${zone.type === 'square-patch' ? 'selected' : ''}>Square Patch</option>
                                <option value="circle" ${zone.type === 'circle' ? 'selected' : ''}>Circle Frame</option>
                                <option value="square" ${zone.type === 'square' ? 'selected' : ''}>Square Frame</option>
                                <option value="fish" ${zone.type === 'fish' ? 'selected' : ''}>Fish Silhouette</option>
                                <option value="star" ${zone.type === 'star' ? 'selected' : ''}>5-Point Star</option>
                                <option value="flower" ${zone.type === 'flower' ? 'selected' : ''}>Flower Rosette</option>
                                <option value="heart" ${zone.type === 'heart' ? 'selected' : ''}>Heart Shape</option>
                                <option value="triangle" ${zone.type === 'triangle' ? 'selected' : ''}>Triangle Shape</option>
                            </select>
                        </div>
                        
                        <div class="control-row" style="margin-bottom: 8px;">
                            <label class="control-label" style="width: 35%;">Mask Mode</label>
                            <select class="zone-mask-mode-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                                <option value="include" ${zone.maskMode !== 'exclude' ? 'selected' : ''}>Include Only</option>
                                <option value="exclude" ${zone.maskMode === 'exclude' ? 'selected' : ''}>Exclude (Mask Out)</option>
                            </select>
                        </div>

                        ${!['full', 'hor-band', 'ver-strip'].includes(zone.type) ? `
                            ${sliderRow('Repeating Count', `pat-zone-patchCount-${zone.id}`, 1, 12, 1, zone.patchCount || 1)}
                        ` : ''}
                        
                        ${fillTypeSelect}
                        ${orientationSelect}
                        ${patternTypeSelector}
                        ${boundsSliders}
                        
                        <div class="btn-grid-options" style="grid-template-cols: repeat(3, 1fr); margin-top: 10px; margin-bottom: 8px;">
                            <button class="option-btn ${zone.style === 'lines' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="lines">Lines</button>
                            <button class="option-btn ${zone.style === 'holes' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="holes">Holes</button>
                            <button class="option-btn ${zone.style === 'off' ? 'active' : ''}" data-zone-id="${zone.id}" data-pat-zone-style="off">Off</button>
                        </div>
                        
                        ${styleControls}
                        
                        ${zone.style !== 'off' ? sliderRow('Opacity', `pat-zone-opacity-${zone.id}`, 0.1, 1, 0.05, zone.opacity) : ''}
                    </div>
                `;
            }

            return `
                <div class="zone-card ${isActive ? 'active' : ''}" id="zone-card-${zone.id}" style="${isHidden ? 'opacity: 0.65;' : ''}">
                    <div class="zone-card-header" style="cursor: pointer;">
                        <div class="zone-card-header-main" style="display: flex; align-items: center; flex: 1;">
                            <span style="margin-right: 8px; font-size: 10px; color: var(--color-tx-m); display: flex; align-items: center;">
                                <i class="fas ${isActive ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>
                            </span>
                            <input type="text" class="zone-name-input" data-zone-id="${zone.id}" value="${zone.name}" style="font-weight: ${isActive ? '600' : 'normal'};">
                        </div>
                        <div class="zone-card-actions">
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
        return `
            <div class="panel-section-title">Carve tool settings</div>
            <p style="color: var(--color-tx-m); font-size: 11px; margin-bottom: 12px; line-height: 1.4;">
                Draw directly onto the gourd surface by holding down left-click (or touching on mobile) and dragging.
            </p>
            ${sliderRow('Depth Offset', 'carve-width', 0.001, 0.015, 0.001, state.carveDepth, 'm')}
            <div class="panel-section-title">Carve Aesthetics</div>
            <div class="control-row">
                <label class="control-label">Carve Color</label>
                <input type="color" id="carve-color" value="${state.carveColor}">
                <span class="color-hex-text">${state.carveColor.toUpperCase()}</span>
            </div>
            <div class="panel-section-title">actions</div>
            <div class="stats-list" style="margin-bottom: 8px;">
                <div class="stat-item"><span class="stat-item-label">Custom Carved Lines</span><span class="stat-item-val">${state.carvedPaths.length}</span></div>
            </div>
            <button id="btn-clear-carvings" class="btn-secondary" style="border-color: var(--color-err); color: var(--color-err);">Clear All Carvings</button>
        `;
    }
    
    return '';
}

// Refreshes the DOM elements of properties panel and hooks event controllers
export function renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    const parentContainer = document.getElementById('panel-content');
    const mobileContainer = document.getElementById('mobile-sheet-content');
    
    if (!parentContainer || !mobileContainer) return;
    
    const html = getPanelHTML(state.activeTab, gourdMesh, carveGroup, measureGroup);
    parentContainer.innerHTML = html;
    mobileContainer.innerHTML = html;
    
    // Bind all form controllers inside the generated HTML
    wireFormControls(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
}

// Binds handlers to form inputs and ensures number and range sync
function wireFormControls(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    // 1. Sync slider range inputs with number textboxes
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        const numberField = document.getElementById(slider.id + '-num');
        if (!numberField) return;
        
        slider.addEventListener('input', () => {
            numberField.value = parseFloat(slider.value).toFixed(2);
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
    const btnAddZone = document.getElementById('btn-add-zone');
    if (btnAddZone) {
        btnAddZone.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            addPatternZone();
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    }

    document.querySelectorAll('.btn-delete-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            removePatternZone(btn.dataset.zoneId);
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    });

    document.querySelectorAll('.btn-duplicate-zone').forEach(btn => {
        btn.addEventListener('click', () => {
            pushUndoState(gourdMesh);
            duplicatePatternZone(btn.dataset.zoneId);
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

    const shapeFriendlyNames = {
        'full': 'Full Gourd',
        'hor-band': 'Height Band',
        'ver-strip': 'Vertical Strip',
        'diagonal-stripe': 'Diagonal Stripe',
        'circular-patch': 'Circular Patch',
        'square-patch': 'Square Patch',
        'circle': 'Circle Frame',
        'square': 'Square Frame',
        'fish': 'Fish Silhouette',
        'star': '5-Point Star',
        'flower': 'Flower Rosette',
        'heart': 'Heart Shape',
        'triangle': 'Triangle Shape'
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

    document.querySelectorAll('.zone-mask-mode-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.maskMode = select.value;
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
    const patVis = document.getElementById('pat-visible');
    if (patVis) {
        patVis.addEventListener('change', () => {
            state.patternVisible = patVis.checked;
            patternGroup.visible = state.patternVisible;
        });
    }
    
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
            gourdMesh.material.needsUpdate = true;
            
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            showToast('Material reset to default settings');
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
    
    // 10. Carving Aesthetics picker
    const carveColorPicker = document.getElementById('carve-color');
    if (carveColorPicker) {
        carveColorPicker.addEventListener('input', () => {
            state.carveColor = carveColorPicker.value;
            const labelText = carveColorPicker.nextElementSibling;
            if (labelText) labelText.textContent = state.carveColor.toUpperCase();
            updateCarveGroup(carveGroup, state);
        });
        carveColorPicker.addEventListener('change', () => {
            pushUndoState(gourdMesh);
        });
    }
    
    // 11. Clear Carvings Button
    const clearCarvingBtn = document.getElementById('btn-clear-carvings');
    if (clearCarvingBtn) {
        clearCarvingBtn.addEventListener('click', () => {
            if (state.carvedPaths.length === 0) return;
            pushUndoState(gourdMesh);
            clearCarvings(carveGroup, state, () => {
                renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
                showToast('All carvings cleared', 'warn');
            });
        });
    }

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
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
        });
    }

    // Blueprint Generator Events
    const btnExportBlueprint = document.getElementById('btn-export-blueprint');
    if (btnExportBlueprint) {
        btnExportBlueprint.addEventListener('click', () => {
            generateAndShowBlueprint();
        });
    }

    const btnCloseBlueprint = document.getElementById('btn-close-blueprint');
    if (btnCloseBlueprint) {
        btnCloseBlueprint.addEventListener('click', () => {
            const modal = document.getElementById('blueprint-modal');
            if (modal) modal.style.display = 'none';
        });
    }

    // Close blueprint modal when clicking background overlay
    const blueprintModal = document.getElementById('blueprint-modal');
    if (blueprintModal) {
        blueprintModal.addEventListener('click', (e) => {
            if (e.target === blueprintModal) {
                blueprintModal.style.display = 'none';
            }
        });
    }

    const btnDownloadBlueprintPng = document.getElementById('btn-download-blueprint-png');
    if (btnDownloadBlueprintPng) {
        btnDownloadBlueprintPng.addEventListener('click', () => {
            const canvas = document.getElementById('blueprint-canvas');
            if (canvas) {
                const url = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `kibuyu-artisan-blueprint-${Date.now()}.png`;
                link.href = url;
                link.click();
                showToast('Artisan template downloaded as PNG', 'success');
            }
        });
    }

    const btnPrintBlueprint = document.getElementById('btn-print-blueprint');
    if (btnPrintBlueprint) {
        btnPrintBlueprint.addEventListener('click', () => {
            window.print();
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
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'baseRadius') {
            state.gourdBaseRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'bulbRadius') {
            state.gourdBulbRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'neckRadius') {
            state.gourdNeckRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'rimRadius') {
            state.gourdRimRadius = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'bulbPosition') {
            state.gourdBulbPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'bulbRoundness') {
            state.gourdBulbRoundness = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'neckPosition') {
            state.gourdNeckPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'neckRoundness') {
            state.gourdNeckRoundness = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'upperNeckWidth') {
            state.gourdUpperNeckWidth = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'upperNeckPosition') {
            state.gourdUpperNeckPosition = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'bendX') {
            state.gourdBendX = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
        } else if (param === 'bendZ') {
            state.gourdBendZ = valFloat;
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
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
            
        // Carving Offset
        case 'carve-width':
            state.carveDepth = valFloat;
            updateCarveGroup(carveGroup, state);
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
        
        // Show sheet on mobile size
        if (window.innerWidth <= 768) {
            document.getElementById('mobile-sheet')?.classList.add('open');
        }
    } else {
        // Close sheet on camera or select tool
        document.getElementById('mobile-sheet')?.classList.remove('open');
    }
    
    // Tool-specific visual actions
    measureGroup.visible = (tool === 'measure');
    const measureVisCheckbox = document.getElementById('measure-lines-vis');
    if (measureVisCheckbox) measureVisCheckbox.checked = measureGroup.visible;
    
    if (tool === 'carve') {
        showToast('Carve Mode active — Left click and drag on gourd to carve', 'warn');
        gourdMesh.material.emissive.set(0x2a1a08);
        gourdMesh.material.emissiveIntensity = 0.25;
    } else if (tool === 'position') {
        showToast('Position Mode active — Left click and drag on gourd to place active shape', 'warn');
        gourdMesh.material.emissive.set(0x0a1020);
        gourdMesh.material.emissiveIntensity = 0.15;
    } else {
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
    
    // 3. Export PNG button
    document.getElementById('btn-export')?.addEventListener('click', () => {
        // Temporarily hide lines helper if needed, or render as is
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `kibuyu-custom-design-${Date.now()}.png`;
        link.href = url;
        link.click();
        showToast('Design exported as PNG image', 'success');
    });
    
    // 4. Undo and Redo Button bindings
    document.getElementById('btn-undo')?.addEventListener('click', () => {
        const restored = performUndo(gourdMesh, () => {
            updatePatternGroup(patternGroup, state);
            updateCarveGroup(carveGroup, state);
            
            const unscaledMeas = calculateMeasurements(1.0, 1.0);
            updateMeasureLines(measureGroup, unscaledMeas);
            
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
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
            
            updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure);
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
    
    // Mobile sheet close gestures
    const sheet = document.getElementById('mobile-sheet');
    const handle = document.getElementById('sheet-handle');
    let startY = 0, startTransform = 0;
    
    handle?.addEventListener('pointerdown', (e) => {
        startY = e.clientY;
        startTransform = sheet.classList.contains('open') ? 0 : 1;
        handle.setPointerCapture(e.pointerId);
        
        const onMove = (ev) => {
            const dy = ev.clientY - startY;
            const progress = Math.max(0, Math.min(1, startTransform + dy / (window.innerHeight * 0.4)));
            sheet.style.transform = `translateY(${progress * 110}%)`;
        };
        
        const onUp = () => {
            handle.removeEventListener('pointermove', onMove);
            handle.removeEventListener('pointerup', onUp);
            sheet.style.transform = '';
            
            // Check threshold to snap open or close
            const clientHeight = window.innerHeight;
            const threshold = clientHeight * 0.15;
            if (sheet.getBoundingClientRect().top > clientHeight - threshold) {
                sheet.classList.remove('open');
            } else {
                sheet.classList.add('open');
            }
        };
        
        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup', onUp);
    });
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

export function updateGourdGeometry(gourdMesh, patternGroup, measureGroup, onUpdatePattern, onUpdateMeasure) {
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
        
        updatePatternGroup(patternGroup, state);
        if (onUpdatePattern) onUpdatePattern();
        if (onUpdateMeasure) onUpdateMeasure();
    }
}

function generateAndShowBlueprint() {
    const modal = document.getElementById('blueprint-modal');
    const canvas = document.getElementById('blueprint-canvas');
    if (!modal || !canvas) return;

    modal.style.display = 'flex';

    const H_cm = state.gourdHeight || 30.0;
    
    // Compute the profile arc lengths
    const segments = 100;
    const arcLengths = [0];
    let accumulated = 0;
    let prevPt = null;
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const r = gourdRadius(t);
        const r_cm = r * (H_cm / 3.0);
        const y_cm = t * H_cm;
        const currPt = { x: r_cm, y: y_cm };
        if (prevPt) {
            const dx = currPt.x - prevPt.x;
            const dy = currPt.y - prevPt.y;
            accumulated += Math.sqrt(dx * dx + dy * dy);
            arcLengths.push(accumulated);
        }
        prevPt = currPt;
    }

    const totalArcLength = accumulated;
    
    let maxRadius_cm = 0;
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const r = gourdRadius(t);
        const r_cm = r * (H_cm / 3.0);
        if (r_cm > maxRadius_cm) maxRadius_cm = r_cm;
    }
    const maxCircumference = 2 * Math.PI * maxRadius_cm;

    const scale = 20; // 20 pixels per cm (50 DPI)
    const padding = 40;
    
    const canvasWidth = Math.ceil(maxCircumference * scale + padding * 2);
    const canvasHeight = Math.ceil(totalArcLength * scale + padding * 2);
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw fine grid pattern
    ctx.strokeStyle = '#f0f0f5';
    ctx.lineWidth = 1;
    for (let x = padding; x < canvasWidth - padding; x += scale * 5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
    }
    for (let y = padding; y < canvasHeight - padding; y += scale * 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
    }
    
    const centerX = canvasWidth / 2;
    
    function mapToCanvas(t, theta) {
        const idx = t * segments;
        const idxFloor = Math.floor(idx);
        const f = idx - idxFloor;
        let arc_cm;
        if (idxFloor >= segments) {
            arc_cm = arcLengths[segments];
        } else {
            arc_cm = arcLengths[idxFloor] * (1 - f) + arcLengths[idxFloor + 1] * f;
        }
        
        const r = gourdRadius(t);
        const r_cm = r * (H_cm / 3.0);
        
        const y_canvas = canvasHeight - padding - arc_cm * scale;
        const x_canvas = centerX + theta * r_cm * scale;
        
        return { x: x_canvas, y: y_canvas };
    }
    
    // 2. Draw outline wrapper contour silhouette
    ctx.strokeStyle = '#333344';
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 5]);
    
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pt = mapToCanvas(t, -Math.PI);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    }
    for (let i = segments; i >= 0; i--) {
        const t = 1.0;
        const theta = -Math.PI + (i / segments) * 2 * Math.PI;
        const pt = mapToCanvas(t, theta);
        ctx.lineTo(pt.x, pt.y);
    }
    for (let i = segments; i >= 0; i--) {
        const t = i / segments;
        const pt = mapToCanvas(t, Math.PI);
        ctx.lineTo(pt.x, pt.y);
    }
    for (let i = 0; i <= segments; i++) {
        const t = 0.0;
        const theta = Math.PI - (i / segments) * 2 * Math.PI;
        const pt = mapToCanvas(t, theta);
        ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]); 

    // 3. Render projected patterns
    for (const zone of state.patternZones) {
        if (!zone.visible || zone.style === 'off') continue;
        
        ctx.strokeStyle = zone.color || '#D4A843';
        ctx.fillStyle = zone.color || '#D4A843';
        ctx.lineWidth = 1.5;
        
        let paths = [];
        const helpers = window.appPatternHelpers || {};
        
        if (zone.fillType === 'concentric' && ['circle', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
            paths = helpers.generateConcentricLoops ? helpers.generateConcentricLoops(zone) : [];
        } else {
            const patLayout = zone.patternType || 'grid';
            const horPaths = helpers.generateHorizontalPaths ? helpers.generateHorizontalPaths(patLayout, zone.density, state.patTilt) : [];
            const verPaths = helpers.generateVerticalPaths ? helpers.generateVerticalPaths(patLayout, zone.density, state.patTilt, zone.leanAngle || 0) : [];
            
            const direction = zone.direction || 'both';
            if (direction === 'both' || direction === 'horizontal') {
                for (const path of horPaths) {
                    paths.push(...helpers.clipPathToZone(path, zone));
                }
            }
            if (direction === 'both' || direction === 'vertical') {
                for (const path of verPaths) {
                    paths.push(...helpers.clipPathToZone(path, zone));
                }
            }
        }
        
        if (zone.style === 'lines') {
            for (const path of paths) {
                if (path.length < 2) continue;
                ctx.beginPath();
                const start = mapToCanvas(path[0].t, path[0].theta);
                ctx.moveTo(start.x, start.y);
                for (let k = 1; k < path.length; k++) {
                    const pt = mapToCanvas(path[k].t, path[k].theta);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.stroke();
            }
        } else if (zone.style === 'holes') {
            for (const path of paths) {
                if (path.length === 0) continue;
                const holeCount = zone.distMode === 'count' ? zone.holeCount : Math.max(2, Math.round(path.length * zone.density));
                const holeSize_px = (zone.holeSize || 0.03) * scale;
                
                const count = Math.max(1, Math.round(holeCount));
                if (count === 1) {
                    const pt = path[Math.floor(path.length / 2)];
                    const canvasPt = mapToCanvas(pt.t, pt.theta);
                    ctx.beginPath();
                    ctx.arc(canvasPt.x, canvasPt.y, holeSize_px, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    for (let k = 0; k < count; k++) {
                        const idx = Math.min(path.length - 1, Math.floor((k / (count - 1)) * (path.length - 1)));
                        const pt = path[idx];
                        const canvasPt = mapToCanvas(pt.t, pt.theta);
                        ctx.beginPath();
                        ctx.arc(canvasPt.x, canvasPt.y, holeSize_px, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }
        }
    }
    
    // Draw 5 x 5 cm print scale validation helper box
    ctx.fillStyle = '#111115';
    ctx.fillRect(padding, padding, 5 * scale, 5 * scale);
    ctx.fillStyle = '#ffffff';
    ctx.font = '8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('5 cm', padding + 2.5 * scale, padding + 1.8 * scale);
    ctx.fillText('Calibration', padding + 2.5 * scale, padding + 2.8 * scale);
    ctx.fillText('Square', padding + 2.5 * scale, padding + 3.8 * scale);
    
    ctx.fillStyle = '#111115';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('📏 5 x 5 cm calibration square', padding, padding + 6.2 * scale);
}
