// Centralized Application State and History Management

export const state = {
    currentTool: 'select',
    activeTab: 'pattern',
    
    // Pattern parameters
    patternType: 'grid', // 'grid', 'diamond', 'zigzag', 'spiral'
    patternVisible: true,
    gridVisible: true,
    patRotation: 0,
    patTilt: 0,
    
    // Photoshop-like Pattern Zones (Layers)
    patternZones: [
        {
            id: 'zone-base',
            name: 'Base Layer',
            type: 'full', // 'full', 'hor-band', 'ver-strip', 'diagonal-stripe', 'circular-patch'
            style: 'lines', // 'lines', 'holes', 'off'
            color: '#D4A843',
            opacity: 1.0,
            density: 1.0,
            distMode: 'count', // 'count' or 'distance'
            holeCount: 30,
            holeDistance: 0.06,
            holeSize: 0.03,
            dashSpacing: 0.0,
            
            // Bounds parameters (used depending on type)
            tMin: 0.0,
            tMax: 1.0,
            thetaMin: -Math.PI,
            thetaMax: Math.PI,
            centerT: 0.5,
            centerTheta: 0.0,
            radius: 0.3,
            slantAngle: 15,
            width: 0.15,
            shapeRotation: 0,
            direction: 'both'
        }
    ],
    activeZoneId: 'zone-base',
    
    // Decoupled stats tracking
    patternCount: 0,
    patternCountType: 'Lines',
    positionToolMode: 'shape', // 'shape' (moves mask shape) or 'camera' (rotates view)
    
    // Material parameters
    materialColor: '#C4956A',
    materialRoughness: 0.82,
    materialMetalness: 0.0,
    materialOpacity: 1.0,
    materialWireframe: false,
    materialFlatShading: false,
    
    // Carving parameters
    carveWidth: 0.015,
    carveColor: '#523620',
    carveDepth: 0.004, // offset (inwards or outwards relative to gourd surface)
    carvedPaths: [], // array of arrays of { t, theta }
    
    // Undo/Redo history
    undoStack: [],
    redoStack: []
};

// Captures a snapshot of the mesh transform and carving paths
export function pushUndoState(gourdMesh) {
    if (!gourdMesh) return;
    
    const snapshot = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patternType: state.patternType,
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode
    };
    
    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) {
        state.undoStack.shift();
    }
    state.redoStack = []; // Clear redo stack on new operation
}

// Restores the previous state
export function performUndo(gourdMesh, onRestore) {
    if (!gourdMesh || state.undoStack.length === 0) return false;
    
    const snapshotToRedo = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patternType: state.patternType,
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode
    };
    state.redoStack.push(snapshotToRedo);
    
    const prevState = state.undoStack.pop();
    gourdMesh.position.copy(prevState.pos);
    gourdMesh.rotation.copy(prevState.rot);
    gourdMesh.scale.copy(prevState.scl);
    state.carvedPaths = prevState.carvedPaths;
    state.patternZones = prevState.patternZones;
    state.patternType = prevState.patternType;
    state.patRotation = prevState.patRotation;
    state.patTilt = prevState.patTilt;
    state.activeZoneId = prevState.activeZoneId;
    state.positionToolMode = prevState.positionToolMode;
    
    if (onRestore) onRestore();
    return true;
}

// Restores the next state
export function performRedo(gourdMesh, onRestore) {
    if (!gourdMesh || state.redoStack.length === 0) return false;
    
    const snapshotToUndo = {
        pos: gourdMesh.position.clone(),
        rot: gourdMesh.rotation.clone(),
        scl: gourdMesh.scale.clone(),
        carvedPaths: JSON.parse(JSON.stringify(state.carvedPaths)),
        patternZones: JSON.parse(JSON.stringify(state.patternZones)),
        patternType: state.patternType,
        patRotation: state.patRotation,
        patTilt: state.patTilt,
        activeZoneId: state.activeZoneId,
        positionToolMode: state.positionToolMode
    };
    state.undoStack.push(snapshotToUndo);
    
    const nextState = state.redoStack.pop();
    gourdMesh.position.copy(nextState.pos);
    gourdMesh.rotation.copy(nextState.rot);
    gourdMesh.scale.copy(nextState.scl);
    state.carvedPaths = nextState.carvedPaths;
    state.patternZones = nextState.patternZones;
    state.patternType = nextState.patternType;
    state.patRotation = nextState.patRotation;
    state.patTilt = nextState.patTilt;
    state.activeZoneId = nextState.activeZoneId;
    state.positionToolMode = nextState.positionToolMode;
    
    if (onRestore) onRestore();
    return true;
}

// Photoshop-like Pattern Zone management helper functions
export function addPatternZone() {
    const id = 'zone-' + Math.random().toString(36).substr(2, 9);
    const newZone = {
        id: id,
        name: 'Layer ' + (state.patternZones.length + 1),
        type: 'full',
        style: 'holes',
        color: '#D4A843',
        opacity: 1.0,
        density: 1.0,
        distMode: 'count',
        holeCount: 30,
        holeDistance: 0.06,
        holeSize: 0.03,
        dashSpacing: 0.0,
        
        tMin: 0.0,
        tMax: 1.0,
        thetaMin: -Math.PI,
        thetaMax: Math.PI,
        centerT: 0.5,
        centerTheta: 0.0,
        radius: 0.3,
        slantAngle: 15,
        width: 0.15,
        shapeRotation: 0,
        direction: 'both'
    };
    state.patternZones.push(newZone);
    return newZone;
}

export function removePatternZone(id) {
    state.patternZones = state.patternZones.filter(z => z.id !== id);
}

export function duplicatePatternZone(id) {
    const zoneToCopy = state.patternZones.find(z => z.id === id);
    if (!zoneToCopy) return;
    const clone = JSON.parse(JSON.stringify(zoneToCopy));
    clone.id = 'zone-' + Math.random().toString(36).substr(2, 9);
    clone.name = clone.name + ' (Copy)';
    state.patternZones.push(clone);
}
