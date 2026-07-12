import { state, pushUndoState, performUndo, performRedo, addPatternZone, removePatternZone, duplicatePatternZone } from './state.js';
import { calculateMeasurements, updateMeasureLines } from './measure.js';
import { updatePatternGroup } from './pattern.js';
import { updateCarveGroup, clearCarvings } from './carve.js';
import * as THREE from 'three';

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
    
    if (tab === 'transform') {
        const rad2deg = 180 / Math.PI;
        const rx = Math.round(((gourdMesh.rotation.x * rad2deg) % 360 + 360) % 360);
        const ry = Math.round(((gourdMesh.rotation.y * rad2deg) % 360 + 360) % 360);
        const rz = Math.round(((gourdMesh.rotation.z * rad2deg) % 360 + 360) % 360);
        
        return `
            <div class="panel-section-title">Position</div>
            ${sliderRow('X', 'pos-x', -3, 3, 0.01, gourdMesh.position.x, 'm')}
            ${sliderRow('Y', 'pos-y', -3, 3, 0.01, gourdMesh.position.y, 'm')}
            ${sliderRow('Z', 'pos-z', -3, 3, 0.01, gourdMesh.position.z, 'm')}
            <div class="panel-section-title">Rotation</div>
            ${sliderRow('X', 'rot-x', 0, 360, 1, rx, '°')}
            ${sliderRow('Y', 'rot-y', 0, 360, 1, ry, '°')}
            ${sliderRow('Z', 'rot-z', 0, 360, 1, rz, '°')}
            <div class="panel-section-title">Uniform Scale</div>
            ${sliderRow('Scale', 'scale-u', 0.2, 3.0, 0.01, gourdMesh.scale.x, 'x')}
            <button id="btn-reset-transform" class="btn-secondary">Reset Transform</button>
        `;
    }
    
    if (tab === 'pattern') {
        const zoneCards = state.patternZones.map(zone => {
            const s = 1.0 / zone.density;
            const densityProx = Math.max(0, Math.min(100, Math.round(100 * (3.0 - s) / 2.96)));
            const dashProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.dashSpacing) / 0.30)));
            const holeDistProx = Math.max(0, Math.min(100, Math.round(100 * (0.30 - zone.holeDistance) / 0.298)));
            const holeCountProx = Math.max(0, Math.min(100, Math.round(100 * (zone.holeCount - 1) / 799)));

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
            } else if (['circle', 'fish', 'star', 'flower', 'heart', 'triangle'].includes(zone.type)) {
                boundsSliders = `
                    ${sliderRow('Center Height', `pat-zone-centerT-${zone.id}`, 0.0, 1.0, 0.01, zone.centerT)}
                    ${sliderRow('Center Angle', `pat-zone-centerTheta-${zone.id}`, -180, 180, 1, Math.round(zone.centerTheta * 180 / Math.PI), '°')}
                    ${sliderRow('Shape Size', `pat-zone-radius-${zone.id}`, 0.02, 0.6, 0.01, zone.radius, 'cm')}
                    ${sliderRow('Rotation', `pat-zone-shapeRotation-${zone.id}`, 0, 360, 1, zone.shapeRotation || 0, '°')}
                `;
            }

            let styleControls = '';
            if (zone.style === 'lines') {
                styleControls = `
                    ${sliderRow('Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx)}
                    ${sliderRow('Dash Gap', `pat-zone-dashSpacing-${zone.id}`, 0, 100, 1, dashProx)}
                    <div class="control-row" style="margin-bottom: 10px;">
                        <label class="control-label">Line Color</label>
                        <input type="color" class="zone-color-input" data-zone-id="${zone.id}" value="${zone.color}">
                        <span class="color-hex-text">${zone.color.toUpperCase()}</span>
                    </div>
                `;
            } else if (zone.style === 'holes') {
                styleControls = `
                    ${sliderRow('Row Spacing', `pat-zone-density-${zone.id}`, 0, 100, 1, densityProx)}
                    ${sliderRow('Hole Size', `pat-zone-holeSize-${zone.id}`, 0.01, 0.10, 0.005, zone.holeSize, 'cm')}
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

            return `
                <div class="zone-card ${zone.id === state.activeZoneId ? 'active' : ''}" id="zone-card-${zone.id}">
                    <div class="zone-card-header">
                        <input type="text" class="zone-name-input" data-zone-id="${zone.id}" value="${zone.name}">
                        <div class="zone-card-actions">
                            <button class="zone-action-btn btn-duplicate-zone" data-zone-id="${zone.id}" title="Duplicate Layer">Copy</button>
                            <button class="zone-action-btn delete btn-delete-zone" data-zone-id="${zone.id}" title="Delete Layer">Delete</button>
                        </div>
                    </div>
                    
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Layer Shape</label>
                        <select class="zone-shape-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="full" ${zone.type === 'full' ? 'selected' : ''}>Full Gourd</option>
                            <option value="hor-band" ${zone.type === 'hor-band' ? 'selected' : ''}>Horizontal Band</option>
                            <option value="ver-strip" ${zone.type === 'ver-strip' ? 'selected' : ''}>Vertical Strip</option>
                            <option value="diagonal-stripe" ${zone.type === 'diagonal-stripe' ? 'selected' : ''}>Diagonal Stripe</option>
                            <option value="circular-patch" ${zone.type === 'circular-patch' ? 'selected' : ''}>Circular Patch</option>
                            <option value="circle" ${zone.type === 'circle' ? 'selected' : ''}>Circle Frame</option>
                            <option value="fish" ${zone.type === 'fish' ? 'selected' : ''}>Fish Silhouette</option>
                            <option value="star" ${zone.type === 'star' ? 'selected' : ''}>5-Point Star</option>
                            <option value="flower" ${zone.type === 'flower' ? 'selected' : ''}>Flower Rosette</option>
                            <option value="heart" ${zone.type === 'heart' ? 'selected' : ''}>Heart Shape</option>
                            <option value="triangle" ${zone.type === 'triangle' ? 'selected' : ''}>Triangle Shape</option>
                        </select>
                    </div>
                    
                    <div class="control-row" style="margin-bottom: 8px;">
                        <label class="control-label" style="width: 35%;">Orientation</label>
                        <select class="zone-direction-select" data-zone-id="${zone.id}" style="margin-bottom: 0; flex: 1;">
                            <option value="both" ${zone.direction === 'both' ? 'selected' : ''}>Both Directions</option>
                            <option value="horizontal" ${zone.direction === 'horizontal' ? 'selected' : ''}>${state.patternType === 'diamond' ? 'Clockwise' : 'Horizontal'} Only</option>
                            <option value="vertical" ${zone.direction === 'vertical' ? 'selected' : ''}>${state.patternType === 'diamond' ? 'Counter-CW' : 'Vertical'} Only</option>
                        </select>
                    </div>
                    
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
        }).join('');

        return `
            <div class="panel-section-title">Pattern Design</div>
            <div class="btn-grid-options">
                <button class="option-btn ${state.patternType === 'grid' ? 'active' : ''}" data-pat="grid">Grid</button>
                <button class="option-btn ${state.patternType === 'diamond' ? 'active' : ''}" data-pat="diamond">Diamond</button>
                <button class="option-btn ${state.patternType === 'zigzag' ? 'active' : ''}" data-pat="zigzag">Zigzag</button>
                <button class="option-btn ${state.patternType === 'spiral' ? 'active' : ''}" data-pat="spiral">Spiral</button>
            </div>
            
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
    
    // 2. Pattern Options (Grid and Style Buttons)
    document.querySelectorAll('.option-btn[data-pat]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.option-btn[data-pat]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            pushUndoState(gourdMesh);
            state.patternType = btn.dataset.pat;
            
            updatePatternGroup(patternGroup, state);
            if (onUpdatePattern) onUpdatePattern();
            
            // Re-render properties panel to update section titles (e.g. Clockwise vs Horizontal)
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
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

    document.querySelectorAll('.zone-name-input').forEach(input => {
        input.addEventListener('change', () => {
            const zoneId = input.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.name = input.value;
            }
        });
    });

    document.querySelectorAll('.zone-shape-select').forEach(select => {
        select.addEventListener('change', () => {
            const zoneId = select.dataset.zoneId;
            const zone = state.patternZones.find(z => z.id === zoneId);
            if (zone) {
                pushUndoState(gourdMesh);
                zone.type = select.value;
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

    // 3.1. Zone card direct click selection handler
    document.querySelectorAll('.zone-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('input, select, button')) return;
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
}

// Processes interactive form settings in real-time
function applyInputChanges(id, value, gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure) {
    if (!gourdMesh) return;
    const valFloat = parseFloat(value);
    const deg2rad = Math.PI / 180;
    
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
const toolToTab = { select: null, measure: 'measure', pattern: 'pattern', position: 'pattern', transform: 'transform', carve: 'carve', camera: null };

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
            
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            if (onUpdateMeasure) onUpdateMeasure();
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
            
            renderPropertiesPanel(gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure);
            if (onUpdateMeasure) onUpdateMeasure();
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
                selectTool('transform', gourdMesh, carveGroup, measureGroup, patternGroup, onUpdatePattern, onUpdateMeasure, window.appControls);
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
