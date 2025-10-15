// Global variables
let map, layerGroup, baseLayerGroup;
let userLayers = [];
let addLayerModal;
let editingLayerIdx = null;
let isAddingManualLayer = false;
let autoSaveTimeout = null;

// Initialize map on page load
function initializeMap() {
    if (!map) {
        map = L.map("map", {
            fullscreenControl: true,
        }).setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);
        layerGroup = L.layerGroup().addTo(map);
        baseLayerGroup = L.layerGroup().addTo(map);
        
        // Test layer removed - initialize empty
    }
}

// Função para ler um arquivo como ArrayBuffer (escopo global)
function readFileAsArrayBuffer(file) {
    return new Promise((resolveFile, rejectFile) => {
        const reader = new FileReader();
        reader.onload = (e) => resolveFile(e.target.result);
        reader.onerror = (e) => rejectFile(new Error(`Erro ao ler o arquivo ${file.name}`));
        reader.readAsArrayBuffer(file);
    });
}

function showToast(message, type = "warning") {
    try {
        // Check if notifications are enabled
        const notificationsEnabled = localStorage.getItem("notificationsEnabled");
        if (notificationsEnabled === "false") {
            console.log(`Toast suppressed: ${message}`);
            return;
        }
        
        // Check for duplicate messages currently visible
        const container = document.getElementById("toast-container");
        if (container) {
            const existingToasts = container.querySelectorAll('.toast .toast-body');
            for (let toast of existingToasts) {
                if (toast.textContent.includes(message)) {
                    console.log(`Duplicate toast prevented: ${message}`);
                    return;
                }
            }
        }
        
        const icons = {
            success: "fa-check-circle",
            danger: "fa-exclamation-triangle",
            warning: "fa-exclamation-circle",
            info: "fa-info-circle",
        };
        const bg = {
            success: "bg-success text-white",
            danger: "bg-danger text-white",
            warning: "bg-warning text-dark",
            info: "bg-info text-white",
        };
        
        const toastId = "toast-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
        const selectedIcon = icons[type] || icons.warning;
        const selectedBg = bg[type] || bg.warning;
        
        const toastHTML = 
            '<div id="' + toastId + '" class="toast align-items-center ' + selectedBg + '" role="alert" aria-live="assertive" aria-atomic="true" data-bs-delay="4000">' +
            '<div class="d-flex">' +
            '<div class="toast-body">' +
            '<i class="fas ' + selectedIcon + ' me-2"></i>' + message +
            '</div>' +
            '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Fechar"></button>' +
            '</div>' +
            '</div>';
        
        if (container) {
            container.insertAdjacentHTML("beforeend", toastHTML);
            const toastEl = document.getElementById(toastId);
            if (toastEl && typeof bootstrap !== 'undefined') {
                const toast = new bootstrap.Toast(toastEl);
                toast.show();
                toastEl.addEventListener("hidden.bs.toast", () => {
                    toastEl.remove();
                });
            }
        }
    } catch (error) {
        console.error("Error showing toast:", error);
        // Fallback to console log when notifications disabled
        console.log(`Notification: ${message}`);
    }
}

function plotWKTOnMap(geometryString) {
    if (!map) {
        map = L.map("map", {
            fullscreenControl: true,
        }).setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);
        layerGroup = L.layerGroup().addTo(map);
    }
    layerGroup.clearLayers();

    geometryString = geometryString.trim();
    if (geometryString.startsWith("SELECT ST_GeomFromText")) {
        geometryString = geometryString.replace(/^SELECT ST_GeomFromText\('(.+)'\)$/i, "$1");
    }

    const format = detectGeometryFormat(geometryString);
    
    try {
        let layerToAdd;
        
        if (format === "geojson") {
            const geoJsonData = JSON.parse(geometryString);
            layerToAdd = L.geoJSON(geoJsonData, {
                style: {
                    color: "#007bff",
                    fillColor: "#007bff",
                    fillOpacity: 0.3,
                    opacity: 0.5,
                    weight: 2,
                },
                pointToLayer: function(feature, latlng) {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        color: "#007bff",
                        fillColor: "#007bff",
                        fillOpacity: 0.3,
                        opacity: 0.5,
                        weight: 2
                    });
                }
            });
        } else {
            // WKT format
            const wicket = new Wkt.Wkt();
            wicket.read(geometryString);
            const obj = wicket.toObject({
                color: "#007bff",
                fillColor: "#007bff",
                fillOpacity: 0.3,
                opacity: 0.5,
                weight: 2,
            });
            
            if (Array.isArray(obj)) {
                layerToAdd = L.featureGroup(obj);
            } else {
                layerToAdd = obj;
            }
        }
        
        layerGroup.addLayer(layerToAdd);
        
        try {
            map.fitBounds(layerToAdd.getBounds(), { padding: [20, 20] });
        } catch (boundsError) {
            console.warn("Não foi possível ajustar o zoom:", boundsError);
        }
        
    } catch (e) {
        console.error("Erro ao plotar geometria:", e);
        showToast("Não foi possível plotar o resultado. Verifique o formato da geometria.", "danger");
    }
}

function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 60%)`;
}

function detectGeometryFormat(input) {
    const trimmed = input.trim();
    
    // Try to parse as JSON first
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed.type && (
            parsed.type === "Feature" || 
            parsed.type === "FeatureCollection" ||
            ["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon", "GeometryCollection"].includes(parsed.type)
        )) {
            return "geojson";
        }
    } catch (e) {
        // Not JSON, continue
    }
    
    // Check for WKT patterns
    const wktPattern = /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(/i;
    if (wktPattern.test(trimmed)) {
        return "wkt";
    }
    
    return "unknown";
}

function addLayerFromGeojson(geojson, name = null, color = null, opacity = 0.4, silent = false) {
    if (!map) {
        map = L.map("map", {
            fullscreenControl: true,
        }).setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);
    }
    if (!baseLayerGroup) {
        baseLayerGroup = L.layerGroup().addTo(map);
    }
    
    color = color || getRandomColor();
    name = name || `Camada ${userLayers.length + 1}`;
    
    try {
        let geoJsonData;
        if (typeof geojson === 'string') {
            geoJsonData = JSON.parse(geojson);
        } else {
            geoJsonData = geojson;
        }
        
        const layer = L.geoJSON(geoJsonData, {
            style: {
                color: color,
                fillColor: color,
                fillOpacity: opacity,
                opacity: Math.min(opacity + 0.2, 1),
                weight: opacity === 0 ? 0 : 2,
            },
            pointToLayer: function(feature, latlng) {
                return L.circleMarker(latlng, {
                    radius: 6,
                    color: color,
                    fillColor: color,
                    fillOpacity: opacity,
                    opacity: Math.min(opacity + 0.2, 1),
                    weight: 2
                });
            }
        });
        
        layer.addTo(baseLayerGroup);
        
        // Convert back to WKT for storage compatibility
        let wktString = "";
        try {
            if (geoJsonData.type === "FeatureCollection") {
                const wkts = geoJsonData.features.map(feature => {
                    const wkt = new Wkt.Wkt();
                    wkt.read(feature.geometry);
                    return wkt.write();
                });
                wktString = wkts.join('\n');
            } else if (geoJsonData.type === "Feature") {
                const wkt = new Wkt.Wkt();
                wkt.read(geoJsonData.geometry);
                wktString = wkt.write();
            } else {
                const wkt = new Wkt.Wkt();
                wkt.read(geoJsonData);
                wktString = wkt.write();
            }
        } catch (e) {
            console.warn("Erro ao converter GeoJSON para WKT:", e);
            wktString = JSON.stringify(geoJsonData);
        }
        
        const layerIndex = userLayers.length;
        userLayers.push({
            name: name,
            layer: layer,
            wkt: wktString,
            color: color,
            opacity: opacity,
            visible: true,
            originalFillOpacity: opacity,
        });
        
        // Add click events for popup
        addClickEventsToLayer(layer, name, layerIndex);
        
        updateLayerList();
        
        try {
            map.fitBounds(layer.getBounds(), { padding: [20, 20] });
        } catch (fitError) {
            console.warn("Erro ao ajustar zoom:", fitError);
        }
        
        if (!silent) {
            showToast(`Camada "${name}" adicionada com sucesso!`, "success");
        }
        debouncedAutoSave();
        
        return true;
    } catch (error) {
        console.error("Erro ao adicionar camada GeoJSON:", error);
        if (!silent) {
            showToast(`Erro ao adicionar camada: ${error.message}`, "danger");
        }
        return false;
    }
}

function addLayerToMap(input, name = null, color = null, opacity = 0.4, silent = false) {
    const format = detectGeometryFormat(input);
    
    if (format === "geojson") {
        return addLayerFromGeojson(input, name, color, opacity, silent);
    } else if (format === "wkt") {
        return addLayerFromWkt(input, name, color, opacity, silent);
    } else {
        if (!silent) {
            showToast("Formato de geometria não reconhecido. Use WKT ou GeoJSON.", "danger");
        }
        return false;
    }
}

function addLayerFromWkt(wkt, name = null, color = null, opacity = 0.4, silent = false) {
    if (!map) {
        map = L.map("map", {
            fullscreenControl: true,
        }).setView([0, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {}).addTo(map);
    }
    if (!baseLayerGroup) {
        baseLayerGroup = L.layerGroup().addTo(map);
    }
    color = color || getRandomColor();
    name = name || `Camada ${userLayers.length + 1}`;
    wkt = wkt.trim();
    if (wkt.startsWith("SELECT ST_GeomFromText")) {
        wkt = wkt.replace(/^SELECT ST_GeomFromText\('(.+)'\)$/i, "$1");
    }

    try {
        if (wkt.toUpperCase().startsWith("GEOMETRYCOLLECTION")) {
            const geomMatch = wkt.match(/GEOMETRYCOLLECTION\s*\(\s*(.*)\s*\)/i);
            if (geomMatch && geomMatch[1]) {
                const geomParts = splitGeometries(geomMatch[1]);
                const featureGroup = L.featureGroup();
                let success = false;
                for (const geomPart of geomParts) {
                    try {
                        const wicket = new Wkt.Wkt();
                        wicket.read(geomPart);
                        const obj = wicket.toObject({
                            color: color,
                            fillColor: color,
                            fillOpacity: opacity,
                            opacity: Math.min(opacity + 0.2, 1),
                            weight: opacity === 0 ? 0 : 2,
                        });

                        if (Array.isArray(obj)) {
                            obj.forEach((o) => featureGroup.addLayer(o));
                        } else {
                            featureGroup.addLayer(obj);
                        }
                        success = true;
                    } catch (e) {
                        console.warn("Erro ao processar parte da geometria:", e);
                    }
                }

                if (success) {
                    featureGroup.addTo(baseLayerGroup);
                    const layerIndex = userLayers.length;
                    userLayers.push({ layer: featureGroup, wkt, color, opacity, name, visible: true });
                    addClickEventsToLayer(featureGroup, name, layerIndex);
                    updateLayerList();
                    map.fitBounds(featureGroup.getBounds(), { padding: [20, 20] });
                    return true;
                } else {
                    throw new Error("Nenhuma geometria válida encontrada na coleção");
                }
            }
        } else {
            const wicket = new Wkt.Wkt();
            wicket.read(wkt);
            const obj = wicket.toObject({
                color: color,
                fillColor: color,
                fillOpacity: opacity,
                opacity: Math.min(opacity + 0.2, 1),
                weight: opacity === 0 ? 0 : 2,
            });
            let leafletLayer;
            if (Array.isArray(obj)) {
                leafletLayer = L.featureGroup(obj);
            } else {
                leafletLayer = obj;
            }
            leafletLayer.addTo(baseLayerGroup);
            const layerIndex = userLayers.length;
            userLayers.push({ layer: leafletLayer, wkt, color, opacity, name, visible: true });
            addClickEventsToLayer(leafletLayer, name, layerIndex);
            updateLayerList();
            map.fitBounds(leafletLayer.getBounds(), { padding: [20, 20] });
            return true;
        }
    } catch (e) {
        console.error("Erro ao adicionar camada:", e);
        if (!silent) {
            showToast("Não foi possível adicionar a camada. Verifique o formato WKT.", "danger");
        }
        return false;
    }
}

function splitGeometries(geomString) {
    const geometries = [];
    let depth = 0;
    let start = 0;
    let inQuotes = false;

    for (let i = 0; i < geomString.length; i++) {
        const char = geomString[i];

        if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
        }

        if (!inQuotes) {
            if (char === "(") {
                if (depth === 0) {
                    let j = i - 1;
                    while (j >= 0 && /\s/.test(geomString[j])) j--;
                    let typeEnd = j + 1;
                    while (j >= 0 && /[A-Z]/i.test(geomString[j])) j--;
                    let typeStart = j + 1;

                    if (typeStart < typeEnd) {
                        start = typeStart;
                    }
                }
                depth++;
            } else if (char === ")") {
                depth--;
                if (depth === 0) {
                    geometries.push(geomString.substring(start, i + 1).trim());
                }
            } else if (char === "," && depth === 0) {
                start = i + 1;
            }
        }
    }

    return geometries.filter((g) => g && g.trim() !== "");
}

function removeLayer(idx) {
    baseLayerGroup.removeLayer(userLayers[idx].layer);
    userLayers.splice(idx, 1);
    updateLayerList();
}

// moveLayer function removed - now using drag and drop

function updateLayerColor(idx, color) {
    userLayers[idx].color = color;
    let style = {
        color: color,
        fillColor: color,
    };
    if (userLayers[idx].opacity == 0) {
        style.color = "transparent";
        style.fillColor = "transparent";
        style.opacity = 0;
        style.fillOpacity = 0;
        style.weight = 0;
    }
    if (userLayers[idx].layer.setStyle) {
        userLayers[idx].layer.setStyle(style);
    } else {
        userLayers[idx].layer.eachLayer((l) => l.setStyle(style));
    }
}

function updateLayerOpacity(idx, opacity) {
    userLayers[idx].opacity = opacity;
    let style;
    if (opacity == 0) {
        style = {
            fillOpacity: 0,
            opacity: 0,
            color: "transparent",
            fillColor: "transparent",
            weight: 0,
        };
    } else {
        style = {
            fillOpacity: opacity,
            opacity: Math.min(opacity + 0.2, 1),
            color: userLayers[idx].color,
            fillColor: userLayers[idx].color,
            weight: 2,
        };
    }
    if (userLayers[idx].layer.setStyle) {
        userLayers[idx].layer.setStyle(style);
    } else {
        userLayers[idx].layer.eachLayer((l) => l.setStyle(style));
    }
}

function toggleLayerVisibility(idx) {
    const layer = userLayers[idx];
    layer.visible = layer.visible !== false ? false : true;
    
    if (layer.visible) {
        baseLayerGroup.addLayer(layer.layer);
    } else {
        baseLayerGroup.removeLayer(layer.layer);
    }
    
    updateLayerList();
    
    // Auto-save after visibility change
    debouncedAutoSave();
}

function centerMapOnLayer(idx) {
    const layer = userLayers[idx];
    if (!layer || !layer.layer) return;
    
    // Add visual feedback on the layer item
    const layerElement = document.querySelector(`.clickable-layer[data-idx="${idx}"]`);
    if (layerElement) {
        layerElement.style.backgroundColor = '#e3f2fd';
        setTimeout(() => {
            layerElement.style.backgroundColor = '';
        }, 500);
    }
    
    try {
        if (layer.layer.getBounds) {
            // For layers with bounds (polygons, lines, etc.)
            map.fitBounds(layer.layer.getBounds(), { padding: [20, 20] });
        } else if (layer.layer.getLatLng) {
            // For point layers
            map.setView(layer.layer.getLatLng(), 15);
        } else if (layer.layer.getLayers) {
            // For layer groups
            const bounds = layer.layer.getBounds();
            map.fitBounds(bounds, { padding: [20, 20] });
        }
        
        // Show toast to indicate the action
        showToast(`📍 Centralizando em "${layer.name}"`, "info");
    } catch (error) {
        console.error("Erro ao centralizar na camada:", error);
        showToast("Erro ao centralizar na camada", "danger");
    }
}

function openEditModal(idx) {
    if (!addLayerModal) {
        console.error("Modal não foi inicializado");
        return;
    }
    
    isAddingManualLayer = false;
    editingLayerIdx = idx;
    
    const modalLabel = document.getElementById("addLayerModalLabel");
    const nameInput = document.getElementById("editLayerName");
    const wktInput = document.getElementById("editLayerWKT");
    const submitBtn = document.getElementById("submitLayerBtn");
    
    if (modalLabel) modalLabel.textContent = "Editar Camada";
    if (nameInput) nameInput.value = userLayers[idx].name;
    if (wktInput) wktInput.value = userLayers[idx].wkt;
    if (submitBtn) submitBtn.textContent = "Salvar Alterações";
    
    addLayerModal.show();
}

function setupDragAndDrop() {
    const layerItems = document.querySelectorAll('.draggable-layer');
    const dragHandles = document.querySelectorAll('.drag-handle');
    
    // Remove draggable from li elements
    layerItems.forEach(item => {
        item.draggable = false;
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);
    });
    
    // Add draggable only to drag handles
    dragHandles.forEach(handle => {
        const parentItem = handle.closest('.draggable-layer');
        handle.addEventListener('mousedown', () => {
            parentItem.draggable = true;
        });
        handle.addEventListener('mouseup', () => {
            parentItem.draggable = false;
        });
        parentItem.addEventListener('dragstart', handleDragStart);
    });
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    if (this !== draggedElement) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (draggedElement !== this) {
        const draggedIdx = parseInt(draggedElement.dataset.idx);
        const targetIdx = parseInt(this.dataset.idx);
        
        // Reorder layers array
        const draggedLayer = userLayers[draggedIdx];
        userLayers.splice(draggedIdx, 1);
        userLayers.splice(targetIdx, 0, draggedLayer);
        
        // Update map layers order
        baseLayerGroup.clearLayers();
        [...userLayers].reverse().forEach((l) => {
            if (l.visible !== false) {
                baseLayerGroup.addLayer(l.layer);
            }
        });
        
        // Update the list
        updateLayerList();
    }
    
    return false;
}

function handleDragEnd(e) {
    const items = document.querySelectorAll('.draggable-layer');
    items.forEach(item => {
        item.classList.remove('dragging', 'drag-over');
    });
    draggedElement = null;
}

function addClickEventsToLayer(layer, layerName, layerIndex) {
    try {
        // Handle layer groups (featureGroup, geoJSON layers)
        if (layer.eachLayer && typeof layer.eachLayer === 'function') {
            layer.eachLayer((subLayer) => {
                if (subLayer.on && typeof subLayer.on === 'function') {
                    subLayer.on('click', function(e) {
                        showLayerPopup(e, layerName, layerIndex);
                    });
                }
            });
        }
        
        // Handle individual layers
        if (layer.on && typeof layer.on === 'function') {
            layer.on('click', function(e) {
                showLayerPopup(e, layerName, layerIndex);
            });
        }
    } catch (error) {
        console.warn('Erro ao adicionar eventos de click à camada:', error);
    }
}

function showLayerPopup(e, layerName, layerIndex) {
    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    
    const popup = L.popup()
        .setLatLng(e.latlng)
        .setContent(`
            <div style="text-align: center; padding: 8px; min-width: 160px;">
                <strong style="color: #007bff;">${layerName}</strong>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #dee2e6;">
                <div style="font-size: 12px; color: #495057; font-family: monospace;">
                    Lat: ${lat}<br>
                    Lng: ${lng}
                </div>
            </div>
        `)
        .openOn(map);
}

function updateLayerList() {
    const list = document.getElementById("layer-list");
    list.innerHTML = "";
    
    userLayers.forEach((l, idx) => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex align-items-center justify-content-between draggable-layer clickable-layer";
        li.draggable = true;
        li.dataset.idx = idx;
        li.title = "Clique para centralizar no mapa";
        li.innerHTML = `
            <span class="drag-handle" title="Arraste para reordenar">
                <i class="fas fa-grip-vertical"></i>
            </span>
            <span class="layer-controls">
                <input type="color" value="${rgb2hex(l.color)}" style="width: 32px; height: 32px; border: none; vertical-align: middle;" data-idx="${idx}" class="layer-color-picker" title="Cor da camada">
                <input type="range" min="0" max="1" step="0.05" value="${l.opacity}" data-idx="${idx}" class="layer-opacity-slider" style="width:80px; vertical-align: middle;" title="Transparência">
                <button class="btn btn-sm btn-light visibility-toggle" data-idx="${idx}" title="Alternar visibilidade">
                    <i class="fas ${l.visible !== false ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <strong style="margin-left:8px;" class="layer-name">${l.name}</strong>
            </span>
            <span class="layer-buttons">
                <button class="btn btn-sm btn-warning edit-layer" data-idx="${idx}" title="Editar camada"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger remove-layer" data-idx="${idx}" title="Remover camada"><i class="fas fa-trash"></i></button>
            </span>
        `;
        list.appendChild(li);
    });

    // Anexar eventos após criar os elementos
    document.querySelectorAll(".remove-layer").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            removeLayer(Number(btn.dataset.idx));
        });
    });
    
    document.querySelectorAll(".edit-layer").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            const idx = Number(btn.dataset.idx);
            openEditModal(idx);
        });
    });
    
    document.querySelectorAll(".layer-color-picker").forEach((input) => {
        input.addEventListener("input", (e) => {
            updateLayerColor(Number(input.dataset.idx), input.value);
        });
    });
    
    document.querySelectorAll(".layer-opacity-slider").forEach((input) => {
        input.addEventListener("input", (e) => {
            updateLayerOpacity(Number(input.dataset.idx), Number(input.value));
        });
    });

    document.querySelectorAll(".visibility-toggle").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            toggleLayerVisibility(Number(btn.dataset.idx));
        });
    });

    document.querySelectorAll(".clickable-layer").forEach((layerEl) => {
        layerEl.addEventListener("click", (e) => {
            // Prevent centering if clicking on interactive elements
            if (e.target.closest('button, input, .drag-handle')) {
                return;
            }
            e.preventDefault();
            centerMapOnLayer(Number(layerEl.dataset.idx));
        });
    });

    // Drag and Drop functionality
    setupDragAndDrop();
}

function rgb2hex(color) {
    if (color.startsWith("#")) return color;
    if (color.startsWith("hsl")) {
        const hsl = color.match(/hsl\((\d+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
        if (!hsl) return "#888888";
        let [h, s, l] = [Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100];
        let c = (1 - Math.abs(2 * l - 1)) * s;
        let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        let m = l - c / 2;
        let [r, g, b] = [0, 0, 0];
        if (h < 60) [r, g, b] = [c, x, 0];
        else if (h < 120) [r, g, b] = [x, c, 0];
        else if (h < 180) [r, g, b] = [0, c, x];
        else if (h < 240) [r, g, b] = [0, x, c];
        else if (h < 300) [r, g, b] = [x, 0, c];
        else [r, g, b] = [c, 0, x];
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    if (color.startsWith("rgb")) {
        const rgb = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!rgb) return "#888888";
        return "#" + ((1 << 24) + (Number(rgb[1]) << 16) + (Number(rgb[2]) << 8) + Number(rgb[3])).toString(16).slice(1);
    }
    return "#888888";
}

function geomToWKT(geom) {
    if (!geom || !geom.type) return null;

    switch (geom.type.toUpperCase()) {
        case "POINT":
            return `POINT (\${geom.coordinates.join(" ")})`;
        case "LINESTRING":
            return `LINESTRING (\${geom.coordinates.map((c) => c.join(" ")).join(", ")})`;
        case "POLYGON":
            return `POLYGON (\${geom.coordinates.map((ring) => "(" + ring.map((c) => c.join(" ")).join(", ") + ")").join(", ")})`;
        case "MULTIPOINT":
            return `MULTIPOINT (\${geom.coordinates.map((c) => "(" + c.join(" ") + ")").join(", ")})`;
        case "MULTILINESTRING":
            return `MULTILINESTRING (\${geom.coordinates.map((line) => "(" + line.map((c) => c.join(" ")).join(", ") + ")").join(", ")})`;
        case "MULTIPOLYGON":
            return `MULTIPOLYGON (\${geom.coordinates.map((poly) => "(" + poly.map((ring) => "(" + ring.map((c) => c.join(" ")).join(", ") + ")").join(", ") + ")").join(", ")})`;
        case "GEOMETRYCOLLECTION":
            return `GEOMETRYCOLLECTION (\${geom.geometries.map((g) => geomToWKT(g)).filter(Boolean).join(", ")})`;
        default:
            return null;
    }
}

function processShapefile(files) {
    return new Promise((resolve, reject) => {
        try {
            if (!files || files.length === 0) {
                reject(new Error("Nenhum arquivo selecionado"));
                return;
            }

            let shpFile = null, dbfFile = null, prjFile = null, shxFile = null;

            for (let i = 0; i < files.length; i++) {
                const fileName = files[i].name.toLowerCase();
                if (fileName.endsWith(".shp")) shpFile = files[i];
                else if (fileName.endsWith(".dbf")) dbfFile = files[i];
                else if (fileName.endsWith(".prj")) prjFile = files[i];
                else if (fileName.endsWith(".shx")) shxFile = files[i];
            }

            if (!shpFile) {
                reject(new Error("Arquivo .shp não encontrado"));
                return;
            }

            showToast("Processando arquivo. Isso pode levar alguns instantes para arquivos grandes...", "info");

            const fileSizeMB = shpFile.size / (1024 * 1024);
            if (fileSizeMB > 50) {
                showToast(`Arquivo grande (${fileSizeMB.toFixed(1)} MB). O processamento pode levar mais tempo.`, "warning");
            }

            function updateProgress(percent) {
                const progressBar = document.getElementById("shapefileProgressBar");
                if (progressBar) {
                    progressBar.style.width = `${percent}%`;
                    progressBar.setAttribute("aria-valuenow", percent);
                }
            }

            updateProgress(10);

            if (typeof shapefile === "undefined") {
                throw new Error("Biblioteca shapefile não carregada. Verifique a conexão com a internet.");
            }

            Promise.all([
                readFileAsArrayBuffer(shpFile),
                dbfFile ? readFileAsArrayBuffer(dbfFile) : Promise.resolve(null),
                shxFile ? readFileAsArrayBuffer(shxFile) : Promise.resolve(null)
            ])
                .then(([shpBuffer, dbfBuffer, shxBuffer]) => {
                    updateProgress(30);
                    let shapefilePromise;
                    if (dbfBuffer) {
                        shapefilePromise = shapefile.read(shpBuffer, dbfBuffer);
                    } else {
                        shapefilePromise = shapefile.read(shpBuffer);
                    }
                    return shapefilePromise;
                })
                .then((geojson) => {
                    updateProgress(60);
                    if (!geojson) throw new Error("O arquivo não contém geometrias válidas");

                    let features = [];
                    if (geojson.type === "FeatureCollection" && geojson.features) {
                        features = geojson.features;
                    } else if (geojson.type === "Feature") {
                        features = [geojson];
                    } else if (geojson.geometry) {
                        features = [geojson];
                    } else {
                        features = [{ type: "Feature", geometry: geojson }];
                    }

                    updateProgress(70);

                    if (features.length === 0) throw new Error("Nenhuma geometria válida encontrada no arquivo");

                    let wktStrings = [];
                    let validFeatureCount = 0;

                    for (let i = 0; i < features.length; i++) {
                        const feature = features[i];
                        if (!feature.geometry) continue;
                        try {
                            const wkt = geomToWKT(feature.geometry);
                            if (wkt) {
                                wktStrings.push(wkt);
                                validFeatureCount++;
                            }
                        } catch (e) {
                            console.warn("Erro ao converter geometria para WKT:", e);
                        }
                    }

                    updateProgress(90);

                    if (wktStrings.length === 0) throw new Error("Não foi possível converter as geometrias para WKT");

                    const geometryTypes = {};
                    wktStrings.forEach((wkt) => {
                        const type = wkt.split("(")[0].trim();
                        geometryTypes[type] = (geometryTypes[type] || 0) + 1;
                    });

                    let predominantType = "";
                    let maxCount = 0;
                    for (const type in geometryTypes) {
                        if (geometryTypes[type] > maxCount) {
                            maxCount = geometryTypes[type];
                            predominantType = type;
                        }
                    }

                    let finalWkt = "";
                    if (predominantType && Object.keys(geometryTypes).length === 1) {
                        if (predominantType === "POLYGON") {
                            const polygonContents = wktStrings.map((wkt) => {
                                const match = wkt.match(/POLYGON\s*\(\((.*?)\)\)/is);
                                return match ? `((\${match[1]}))` : null;
                            }).filter(Boolean);
                            if (polygonContents.length > 0) {
                                finalWkt = `MULTIPOLYGON (\${polygonContents.join(", ")})`;
                            }
                        } else if (predominantType === "POINT") {
                            const pointContents = wktStrings.map((wkt) => {
                                const match = wkt.match(/POINT\s*\(\s*(.*?)\s*\)/i);
                                return match ? `(\${match[1]})` : null;
                            }).filter(Boolean);
                            if (pointContents.length > 0) {
                                finalWkt = `MULTIPOINT (\${pointContents.join(", ")})`;
                            }
                        } else if (predominantType === "LINESTRING") {
                            const lineContents = wktStrings.map((wkt) => {
                                const match = wkt.match(/LINESTRING\s*\(\s*(.*?)\s*\)/i);
                                return match ? `(\${match[1]})` : null;
                            }).filter(Boolean);
                            if (lineContents.length > 0) {
                                finalWkt = `MULTILINESTRING (\${lineContents.join(", ")})`;
                            }
                        }
                    } else if (wktStrings.length > 1) {
                        finalWkt = `GEOMETRYCOLLECTION (\${wktStrings.join(", ")})`;
                    } else if (wktStrings.length === 1) {
                        finalWkt = wktStrings[0];
                    }

                    updateProgress(100);

                    const wktData = {
                        wkt: finalWkt,
                        count: validFeatureCount,
                        name: shpFile.name.replace(/\.[^/.]+$/, ""),
                    };

                    resolve(wktData);
                })
                .catch((error) => {
                    console.error("Erro ao processar shapefile:", error);
                    reject(new Error("Erro ao processar o arquivo: " + error.message));
                });
        } catch (error) {
            console.error("Erro ao iniciar processamento:", error);
            reject(new Error("Erro ao iniciar processamento: " + error.message));
        }
    });
}

function cleanupMemory() {
    if (window.gc) window.gc();
}

function handleShapefileUpload(files) {
    const progressContainer = document.getElementById("shapefileProgressContainer");
    progressContainer.style.display = "flex";

    processShapefile(files)
        .then((wktData) => {
            const outputText = document.getElementById("outputText");
            outputText.value = wktData.wkt;

            if (!wktData.wkt || wktData.wkt.trim() === "") {
                throw new Error("O WKT gerado está vazio ou inválido");
            }

            try {
                const wicket = new Wkt.Wkt();
                wicket.read(wktData.wkt);
                const layerName = wktData.name || `Camada ${userLayers.length + 1}`;
                const randomColor = getRandomColor();
                const success = addLayerToMap(wktData.wkt, layerName, randomColor);

                if (success) {
                    addLayerModal.hide();
                    if (wktData.wkt.startsWith("GEOMETRYCOLLECTION")) {
                        showToast(`Shapefile adicionado como camada "${layerName}" com ${wktData.count} geometrias combinadas.`, "success");
                    } else {
                        showToast(`Shapefile adicionado como camada "\${layerName}" com \${wktData.count} feições.`, "success");
                    }
                } else {
                    showToast("Não foi possível adicionar a camada. Verifique o formato do arquivo.", "danger");
                }
            } catch (error) {
                console.error("Erro ao validar WKT:", error);
                showToast("O WKT gerado não é válido. Verifique o formato do arquivo.", "danger");
            }
            cleanupMemory();
        })
        .catch((error) => {
            showToast("Erro ao processar o arquivo: " + error.message, "danger");
        })
        .finally(() => {
            progressContainer.style.display = "none";
        });
}

// Conversion functions
function convertPolygonsToMultipolygon(input) {
    const polygons = input.split("\n").filter((line) => line.trim() !== "");
    if (polygons.length === 0) return "";
    if (input.trim().toUpperCase().startsWith("MULTIPOLYGON")) return input.trim();
    const polygonParts = polygons.map((polygon) => {
        const match = polygon.match(/POLYGON\s*\(\((.*?)\)\)/i);
        if (match && match[1]) return `(\${match[1]})`;
        return null;
    }).filter((part) => part !== null);
    if (polygonParts.length === 0) {
        return "Formato de entrada inválido. Verifique se os polígonos estão no formato correto.";
    }
    return `MULTIPOLYGON (\${polygonParts.join(",")})`;
}

function convertMultipolygonToPolygons(input) {
    if (!input.trim().toUpperCase().startsWith("MULTIPOLYGON")) {
        return "A entrada deve ser um MULTIPOLYGON.";
    }
    const multipolygonMatch = input.match(/MULTIPOLYGON\s*\(\((.*?)\)\)/is);
    if (!multipolygonMatch || !multipolygonMatch[1]) {
        return "Formato de MULTIPOLYGON inválido.";
    }
    let content = multipolygonMatch[1];
    const polygons = [];
    let depth = 0, start = 0;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "(") {
            if (depth === 0) start = i;
            depth++;
        } else if (content[i] === ")") {
            depth--;
            if (depth === 0) polygons.push(content.substring(start, i + 1));
        }
    }
    return polygons.map((polygon) => `POLYGON (\${polygon})`).join("\n");
}

function concatenateMultipolygons(input) {
    const regex = /MULTIPOLYGON\s*\(\s*(\(\(.*?\)\))\s*\)/gis;
    let match;
    const allPolygons = [];
    while ((match = regex.exec(input)) !== null) {
        const group = match[1];
        let depth = 0, start = -1;
        for (let i = 0; i < group.length; i++) {
            if (group[i] === "(") {
                if (depth === 0) start = i;
                depth++;
            } else if (group[i] === ")") {
                depth--;
                if (depth === 0 && start !== -1) {
                    allPolygons.push(group.substring(start, i + 1));
                    start = -1;
                }
            }
        }
    }
    if (allPolygons.length === 0) {
        return "Formato de entrada inválido. Verifique se os multipolígonos estão no formato correto.";
    }
    return `MULTIPOLYGON (\${allPolygons.join(",")})`;
}

function convertMultipointToMultipolygon(input) {
    const lines = input.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    let points = [];
    lines.forEach((line) => {
        let multiMatch = line.match(/MULTIPOINT\s*\(\s*(.*)\s*\)/i);
        if (multiMatch) {
            let content = multiMatch[1].trim();
            if (content.startsWith("(")) {
                let innerPoints = [...content.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim());
                points.push(...innerPoints);
            } else {
                points.push(...content.split(",").map((p) => p.trim()));
            }
            return;
        }
        let pointMatch = line.match(/POINT\s*\(\s*([^\)]+)\s*\)/i);
        if (pointMatch) {
            points.push(pointMatch[1].trim());
            return;
        }
        if (/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test(line)) {
            points.push(line);
        }
    });
    if (points.length === 0) return "Nenhum ponto válido encontrado.";
    const size = 0.00001;
    const polygons = points.map((point) => {
        const [x, y] = point.split(/\s+/).map(Number);
        return `((\${x - size} \${y - size}, \${x + size} \${y - size}, \${x + size} \${y + size}, \${x - size} \${y + size}, \${x - size} \${y - size}))`;
    });
    return `MULTIPOLYGON (\${polygons.join(", ")})`;
}

function concatenateMultipoints(input) {
    const lines = input.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    let points = [];
    lines.forEach((line) => {
        let multiMatch = line.match(/MULTIPOINT\s*\(\s*(.*)\s*\)/i);
        if (multiMatch) {
            let content = multiMatch[1].trim();
            if (content.startsWith("(")) {
                let innerPoints = [...content.matchAll(/\(([^()]+)\)/g)].map((m) => m[1].trim());
                points.push(...innerPoints);
            } else {
                points.push(...content.split(",").map((p) => p.trim()));
            }
            return;
        }
        let pointMatch = line.match(/POINT\s*\(\s*([^\)]+)\s*\)/i);
        if (pointMatch) {
            points.push(pointMatch[1].trim());
            return;
        }
        if (/^-?\d+(\.\d+)?\s+-?\d+(\.\d+)?$/.test(line)) {
            points.push(line);
        }
    });
    if (points.length === 0) return "Nenhum ponto válido encontrado.";
    return "MULTIPOINT(" + points.map((pt) => "(" + pt + ")").join(", ") + ")";
}

// GeoJSON conversion functions
function convertWktToGeojson(input) {
    try {
        const lines = input.split('\n').filter(line => line.trim() !== '');
        const features = [];
        
        lines.forEach(line => {
            const wkt = new Wkt.Wkt();
            try {
                wkt.read(line.trim());
                const geojson = wkt.toJson();
                
                features.push({
                    type: "Feature",
                    properties: {},
                    geometry: geojson
                });
            } catch (e) {
                console.warn('Erro ao converter WKT:', line, e);
            }
        });
        
        if (features.length === 0) {
            return "Nenhuma geometria WKT válida encontrada.";
        }
        
        if (features.length === 1) {
            return JSON.stringify(features[0].geometry, null, 2);
        }
        
        return JSON.stringify({
            type: "FeatureCollection",
            features: features
        }, null, 2);
        
    } catch (error) {
        return `Erro na conversão WKT para GeoJSON: ${error.message}`;
    }
}

function convertGeojsonToWkt(input) {
    try {
        const geojson = JSON.parse(input.trim());
        const results = [];
        
        if (geojson.type === "FeatureCollection") {
            geojson.features.forEach(feature => {
                const wkt = new Wkt.Wkt();
                wkt.read(feature.geometry);
                results.push(wkt.write());
            });
        } else if (geojson.type === "Feature") {
            const wkt = new Wkt.Wkt();
            wkt.read(geojson.geometry);
            results.push(wkt.write());
        } else if (geojson.type) {
            // É uma geometria direta
            const wkt = new Wkt.Wkt();
            wkt.read(geojson);
            results.push(wkt.write());
        } else {
            return "Formato GeoJSON inválido.";
        }
        
        return results.join('\n');
        
    } catch (error) {
        return `Erro na conversão GeoJSON para WKT: ${error.message}`;
    }
}

function convertGeojsonToFeatureCollection(input) {
    try {
        const geojson = JSON.parse(input.trim());
        
        if (geojson.type === "FeatureCollection") {
            return JSON.stringify(geojson, null, 2);
        }
        
        let features = [];
        
        if (geojson.type === "Feature") {
            features.push(geojson);
        } else if (geojson.type) {
            // É uma geometria direta
            features.push({
                type: "Feature",
                properties: {},
                geometry: geojson
            });
        } else {
            return "Formato GeoJSON inválido.";
        }
        
        return JSON.stringify({
            type: "FeatureCollection",
            features: features
        }, null, 2);
        
    } catch (error) {
        return `Erro na conversão para FeatureCollection: ${error.message}`;
    }
}

function convertFeatureCollectionToGeojson(input) {
    try {
        const featureCollection = JSON.parse(input.trim());
        
        if (featureCollection.type !== "FeatureCollection") {
            return "A entrada deve ser uma FeatureCollection.";
        }
        
        if (!featureCollection.features || featureCollection.features.length === 0) {
            return "FeatureCollection vazia ou inválida.";
        }
        
        const geometries = featureCollection.features.map(feature => feature.geometry);
        
        if (geometries.length === 1) {
            return JSON.stringify(geometries[0], null, 2);
        }
        
        return JSON.stringify({
            type: "GeometryCollection",
            geometries: geometries
        }, null, 2);
        
    } catch (error) {
        return `Erro na conversão FeatureCollection: ${error.message}`;
    }
}

// Storage functions
function saveLayersToLocalStorage(showNotification = false) {
    const layersData = userLayers.map((layer) => ({
        name: layer.name,
        wkt: layer.wkt,
        color: layer.color,
        opacity: layer.opacity,
        visible: layer.visible !== false
    }));
    localStorage.setItem("savedLayers", JSON.stringify(layersData));
    
    // Only show notification when explicitly requested (manual save)
    if (showNotification) {
        showToast("Camadas salvas com sucesso!", "success");
    }
}

function debouncedAutoSave() {
    // Clear existing timeout
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
    }
    
    // Set new timeout for auto-save (silent)
    autoSaveTimeout = setTimeout(() => {
        saveLayersToLocalStorage(false);
    }, 300); // Wait 300ms before saving
}

function saveUISettings() {
    try {
        const settings = {
            sidebarWidth: document.querySelector('.sidebar')?.offsetWidth || 350,
            converterHeight: document.querySelector('#converterPanel')?.offsetHeight || window.innerHeight * 0.5,
            converterVisible: document.querySelector('#converterPanel')?.classList.contains('show') || false,
            notificationsEnabled: localStorage.getItem("notificationsEnabled") !== "false"
        };
        
        localStorage.setItem("uiSettings", JSON.stringify(settings));
        return true;
    } catch (error) {
        console.error("Erro ao salvar configurações da UI:", error);
        return false;
    }
}

function loadUISettings() {
    try {
        const savedSettings = localStorage.getItem("uiSettings");
        if (!savedSettings) return false;

        const settings = JSON.parse(savedSettings);
        
        // Apply sidebar width
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && settings.sidebarWidth) {
            sidebar.style.width = settings.sidebarWidth + 'px';
        }
        
        // Apply converter panel height
        const converterPanel = document.querySelector('#converterPanel');
        if (converterPanel && settings.converterHeight) {
            converterPanel.style.height = settings.converterHeight + 'px';
        }
        
        // Apply converter visibility
        if (settings.converterVisible) {
            converterPanel?.classList.add('show');
            const toggleBtn = document.getElementById('converterToggleBtn');
            if (toggleBtn) {
                toggleBtn.querySelector('i')?.classList.replace('fa-chevron-up', 'fa-chevron-down');
            }
        }
        
        // Apply notifications preference
        if (settings.notificationsEnabled !== undefined) {
            localStorage.setItem("notificationsEnabled", settings.notificationsEnabled.toString());
            updateNotificationButtonText();
        }
        
        return true;
    } catch (error) {
        console.error("Erro ao carregar configurações da UI:", error);
        return false;
    }
}

function loadLayersFromLocalStorage(showNotification = false) {
    try {
        const savedData = localStorage.getItem("savedLayers");
        if (!savedData) return false;

        const layersData = JSON.parse(savedData);
        if (!Array.isArray(layersData) || layersData.length === 0) return false;

        if (baseLayerGroup) {
            baseLayerGroup.clearLayers();
            userLayers = [];
        }

        layersData.forEach((layerData) => {
            // Add layer with all saved properties (silently)
            const success = addLayerToMap(layerData.wkt, layerData.name, layerData.color, layerData.opacity, true);
            if (success && layerData.visible === false) {
                // Hide layer if it was hidden
                const lastLayerIndex = userLayers.length - 1;
                toggleLayerVisibility(lastLayerIndex);
            }
        });

        // Only show notification when explicitly requested
        if (showNotification) {
            showToast(`${layersData.length} camadas carregadas com sucesso!`, "info");
        }
        return true;
    } catch (error) {
        console.error("Erro ao carregar camadas:", error);
        if (showNotification) {
            showToast("Erro ao carregar camadas salvas", "danger");
        }
        return false;
    }
}

function clearAllData() {
    // Clear all layers from map
    if (baseLayerGroup) {
        baseLayerGroup.clearLayers();
    }
    if (layerGroup) {
        layerGroup.clearLayers();
    }
    
    // Clear userLayers array
    userLayers = [];
    
    // Update layer list display
    updateLayerList();
    
    // Clear localStorage
    localStorage.removeItem("savedLayers");
    localStorage.removeItem("uiSettings");
    
    showToast("Todos os dados foram limpos!", "info");
}

function toggleNotifications() {
    const currentState = localStorage.getItem("notificationsEnabled") !== "false";
    const newState = !currentState;
    
    localStorage.setItem("notificationsEnabled", newState.toString());
    updateNotificationButtonText();
    saveUISettings();
    
    const message = newState ? "Avisos habilitados" : "Avisos desabilitados";
    if (newState) {
        showToast(message, "info");
    } else {
        console.log(message);
    }
}

function updateNotificationButtonText() {
    const button = document.getElementById("toggleNotificationsBtn");
    const span = button?.querySelector("span");
    const icon = button?.querySelector("i");
    
    if (button && span && icon) {
        const enabled = localStorage.getItem("notificationsEnabled") !== "false";
        span.textContent = enabled ? "Desabilitar Avisos" : "Habilitar Avisos";
        icon.className = enabled ? "fas fa-bell" : "fas fa-bell-slash";
        button.title = enabled ? "Desabilitar avisos de notificação" : "Habilitar avisos de notificação";
    }
}

function exportLayers() {
    if (userLayers.length === 0) {
        showToast("Não há camadas para exportar", "warning");
        return;
    }

    const layersData = userLayers.map((layer) => ({
        name: layer.name,
        wkt: layer.wkt,
        color: layer.color,
        opacity: layer.opacity,
    }));

    const dataStr = JSON.stringify(layersData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "camadas_exportadas.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Camadas exportadas com sucesso!", "success");
}

function importLayers(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const layersData = JSON.parse(e.target.result);
                if (!Array.isArray(layersData)) {
                    throw new Error("Formato de arquivo inválido");
                }

                const shouldReplace = confirm("Deseja substituir as camadas existentes? Clique em OK para substituir ou Cancelar para adicionar às camadas existentes.");

                if (shouldReplace && baseLayerGroup) {
                    baseLayerGroup.clearLayers();
                    userLayers = [];
                }

                let addedCount = 0;
                layersData.forEach((layerData) => {
                    if (layerData.wkt && layerData.name) {
                        const success = addLayerToMap(layerData.wkt, layerData.name, layerData.color || getRandomColor(), layerData.opacity !== undefined ? layerData.opacity : 0.4, true);
                        if (success) addedCount++;
                    }
                });

                if (addedCount > 0) {
                    showToast(`\${addedCount} camadas importadas com sucesso!`, "success");
                    debouncedAutoSave();
                    resolve(true);
                } else {
                    throw new Error("Nenhuma camada válida encontrada no arquivo");
                }
            } catch (error) {
                console.error("Erro ao importar camadas:", error);
                showToast("Erro ao importar camadas: " + error.message, "danger");
                reject(error);
            }
        };

        reader.onerror = (e) => {
            reject(new Error("Erro ao ler o arquivo"));
        };

        reader.readAsText(file);
    });
}

// DOM initialization
document.addEventListener("DOMContentLoaded", function () {
    // Sidebar resize logic
    const sidebar = document.querySelector('.sidebar');
    const sidebarHandle = document.querySelector('.sidebar-resize-handle');
    let isSidebarResizing = false;
    let startSidebarX = 0;
    let startSidebarWidth = 0;
    if (sidebar && sidebarHandle) {
        sidebarHandle.addEventListener('mousedown', function(e) {
            isSidebarResizing = true;
            startSidebarX = e.clientX;
            startSidebarWidth = sidebar.offsetWidth;
            document.body.style.cursor = 'ew-resize';
            e.preventDefault();
        });
        document.addEventListener('mousemove', function(e) {
            if (!isSidebarResizing) return;
            const dx = e.clientX - startSidebarX;
            let newWidth = startSidebarWidth - dx; // Invertido: arrastar esquerda aumenta, direita diminui
            newWidth = Math.max(220, Math.min(600, newWidth));
            sidebar.style.width = newWidth + 'px';
        });
        document.addEventListener('mouseup', function() {
            if (isSidebarResizing) {
                isSidebarResizing = false;
                document.body.style.cursor = '';
                // Save UI settings after resize
                saveUISettings();
            }
        });
    }
    const inputText = document.getElementById("inputText");
    const outputText = document.getElementById("outputText");
    const convertBtn = document.getElementById("convertBtn");
    const clearBtn = document.getElementById("clearBtn");
    const copyBtn = document.getElementById("fixed-copy-btn");
    const conversionType = document.getElementById("conversionType");
    const addSTGeomFromText = document.getElementById("addSTGeomFromText");
    const addLayerBtn = document.getElementById("addLayerBtn");
    const addLayerManualBtn = document.getElementById("addLayerManualBtn");

    // Create modal HTML
    const addLayerModalHTML = `
<div class="modal fade" id="addLayerModal" tabindex="-1" aria-labelledby="addLayerModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="addLayerModalLabel">Adicionar Camada</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <ul class="nav nav-tabs" id="addLayerTabs" role="tablist">
                    <li class="nav-item" role="presentation">
                        <button class="nav-link active" id="wkt-tab" data-bs-toggle="tab" data-bs-target="#wkt-tab-pane" type="button" role="tab">WKT</button>
                    </li>
                    <li class="nav-item" role="presentation">
                        <button class="nav-link" id="shapefile-tab" data-bs-toggle="tab" data-bs-target="#shapefile-tab-pane" type="button" role="tab">Shapefile</button>
                    </li>
                </ul>
                <div class="tab-content" id="addLayerTabContent">
                    <div class="tab-pane fade show active" id="wkt-tab-pane" role="tabpanel" tabindex="0">
                        <form id="editLayerForm" class="mt-3">
                            <div class="mb-3">
                                <label for="editLayerName" class="form-label">Nome da Camada</label>
                                <input type="text" class="form-control" id="editLayerName" required>
                            </div>
                            <div class="mb-3">
                                <label for="editLayerWKT" class="form-label">Conteúdo (WKT ou GeoJSON)</label>
                                <textarea class="form-control" id="editLayerWKT" rows="4" placeholder="Insira geometria WKT ou GeoJSON..." required></textarea>
                            </div>
                            <div class="text-end">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button type="submit" class="btn btn-primary" id="submitLayerBtn">Adicionar Camada</button>
                            </div>
                        </form>
                    </div>
                    <div class="tab-pane fade" id="shapefile-tab-pane" role="tabpanel" tabindex="0">
                        <div class="mt-3">
                            <div class="alert alert-danger" role="alert">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Atenção!</strong> Esta funcionalidade está em desenvolvimento e pode não funcionar corretamente.
                            </div>
                            <div id="shapefileDropzone" class="dropzone">
                                <div class="dz-message">
                                    <i class="fas fa-upload fa-2x mb-2"></i>
                                    <p>Arraste e solte arquivos .shp aqui ou clique para selecionar</p>
                                    <p class="small text-muted">Você pode selecionar múltiplos arquivos (.shp, .dbf, .shx, .prj)</p>
                                </div>
                                <input type="file" id="shapefileInput" multiple style="display: none;" accept=".shp,.dbf,.shx,.prj">
                            </div>
                            <div id="shapefileProgressContainer" class="progress-container">
                                <div class="progress">
                                    <div id="shapefileProgressBar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`;

    document.body.insertAdjacentHTML("beforeend", addLayerModalHTML);
    addLayerModal = new bootstrap.Modal(document.getElementById("addLayerModal"));

    const dropzone = document.getElementById("shapefileDropzone");
    const fileInput = document.getElementById("shapefileInput");

    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) handleShapefileUpload(e.dataTransfer.files);
    });
    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) handleShapefileUpload(fileInput.files);
    });

    convertBtn.addEventListener("click", function () {
        const input = inputText.value.trim();
        if (!input) {
            showToast("Por favor, insira o texto para conversão.", "warning");
            return;
        }
        let convertedText;
        if (conversionType.value === "polygonsToMultipolygon") {
            convertedText = convertPolygonsToMultipolygon(input);
        } else if (conversionType.value === "multipolygonToPolygons") {
            convertedText = convertMultipolygonToPolygons(input);
        } else if (conversionType.value === "concatenateMultipolygons") {
            convertedText = concatenateMultipolygons(input);
        } else if (conversionType.value === "multipointToMultipolygon") {
            convertedText = convertMultipointToMultipolygon(input);
        } else if (conversionType.value === "concatenateMultipoints") {
            convertedText = concatenateMultipoints(input);
        } else if (conversionType.value === "wktToGeojson") {
            convertedText = convertWktToGeojson(input);
        } else if (conversionType.value === "geojsonToWkt") {
            convertedText = convertGeojsonToWkt(input);
        } else if (conversionType.value === "geojsonToFeatureCollection") {
            convertedText = convertGeojsonToFeatureCollection(input);
        } else if (conversionType.value === "featureCollectionToGeojson") {
            convertedText = convertFeatureCollectionToGeojson(input);
        } else {
            convertedText = "";
        }
        if (convertedText.startsWith("Formato de entrada inválido") || 
            convertedText.startsWith("A entrada deve ser") || 
            convertedText.startsWith("Nenhum ponto válido") ||
            convertedText.startsWith("Nenhuma geometria WKT válida") ||
            convertedText.startsWith("Erro na conversão") ||
            convertedText.startsWith("Formato GeoJSON inválido") ||
            convertedText.startsWith("FeatureCollection vazia")) {
            showToast(convertedText, "danger");
            outputText.value = "";
        } else {
            if (addSTGeomFromText.checked) {
                convertedText = `SELECT ST_GeomFromText('\${convertedText}')`;
            }
            outputText.value = convertedText;
            showToast("Conversão realizada com sucesso!", "success");
            plotWKTOnMap(convertedText);
        }
    });

    clearBtn.addEventListener("click", function () {
        inputText.value = "";
        outputText.value = "";
        if (map && layerGroup) layerGroup.clearLayers();
    });

    copyBtn.addEventListener("click", function () {
        if (!outputText.value) {
            showToast("Não há resultado para copiar.", "warning");
            return;
        }
        outputText.select();
        try {
            document.execCommand("copy");
            showToast("Resultado copiado para a área de transferência!", "success");
        } catch (err) {
            navigator.clipboard.writeText(outputText.value)
                .then(() => showToast("Resultado copiado para a área de transferência!", "success"))
                .catch((err) => {
                    showToast("Erro ao copiar: " + err.message, "danger");
                    console.error("Erro ao copiar: ", err);
                });
        }
    });

    addLayerBtn.onclick = function () {
        const wkt = outputText.value.trim();
        if (!wkt) {
            showToast("Não há resultado para adicionar como camada.", "warning");
            return;
        }
        isAddingManualLayer = true;
        editingLayerIdx = null;
        document.getElementById("addLayerModalLabel").textContent = "Adicionar Camada Convertida";
        document.getElementById("editLayerName").value = `Camada ${userLayers.length + 1}`;
        document.getElementById("editLayerWKT").value = wkt;
        document.getElementById("submitLayerBtn").textContent = "Adicionar Camada";
        addLayerModal.show();
    };

    addLayerManualBtn.addEventListener("click", function () {
        isAddingManualLayer = true;
        editingLayerIdx = null;
        document.getElementById("addLayerModalLabel").textContent = "Adicionar Camada Manualmente";
        document.getElementById("editLayerName").value = "";
        document.getElementById("editLayerWKT").value = "";
        document.getElementById("submitLayerBtn").textContent = "Adicionar Camada";
        addLayerModal.show();
    });

    // Event listener para editar removido - agora é tratado em updateLayerList()

    document.getElementById("editLayerForm").addEventListener("submit", function (e) {
        e.preventDefault();
        console.log("Form submitted"); // Debug log
        const newName = document.getElementById("editLayerName").value.trim();
        const newWKT = document.getElementById("editLayerWKT").value.trim();
        if (!newName || !newWKT) {
            console.log("Missing name or WKT"); // Debug log
            return;
        }

        if (isAddingManualLayer) {
            console.log("Adding new layer"); // Debug log
            addLayerToMap(newWKT, newName);
            // Toast is already shown by addLayerToMap function
            addLayerModal.hide();
            isAddingManualLayer = false;
            return;
        }

        console.log("Editing layer at index:", editingLayerIdx); // Debug log
        baseLayerGroup.removeLayer(userLayers[editingLayerIdx].layer);
        
        const format = detectGeometryFormat(newWKT);
        let leafletLayer;
        
        try {
            if (format === "geojson") {
                const geoJsonData = JSON.parse(newWKT);
                leafletLayer = L.geoJSON(geoJsonData, {
                    style: {
                        color: userLayers[editingLayerIdx].color,
                        fillColor: userLayers[editingLayerIdx].color,
                        fillOpacity: userLayers[editingLayerIdx].opacity,
                        opacity: Math.min(userLayers[editingLayerIdx].opacity + 0.2, 1),
                        weight: userLayers[editingLayerIdx].opacity === 0 ? 0 : 2,
                    },
                    pointToLayer: function(feature, latlng) {
                        return L.circleMarker(latlng, {
                            radius: 6,
                            color: userLayers[editingLayerIdx].color,
                            fillColor: userLayers[editingLayerIdx].color,
                            fillOpacity: userLayers[editingLayerIdx].opacity,
                            opacity: Math.min(userLayers[editingLayerIdx].opacity + 0.2, 1),
                            weight: 2
                        });
                    }
                });
            } else {
                const wicket = new Wkt.Wkt();
                wicket.read(newWKT);
                const obj = wicket.toObject({
                    color: userLayers[editingLayerIdx].color,
                    fillColor: userLayers[editingLayerIdx].color,
                    fillOpacity: userLayers[editingLayerIdx].opacity,
                    opacity: Math.min(userLayers[editingLayerIdx].opacity + 0.2, 1),
                    weight: userLayers[editingLayerIdx].opacity === 0 ? 0 : 2,
                });
                
                if (Array.isArray(obj)) {
                    leafletLayer = L.featureGroup(obj);
                } else {
                    leafletLayer = obj;
                }
            }
            leafletLayer.addTo(baseLayerGroup);

            userLayers[editingLayerIdx].name = newName;
            userLayers[editingLayerIdx].wkt = newWKT;
            userLayers[editingLayerIdx].layer = leafletLayer;

            // Re-add click events to the updated layer
            addClickEventsToLayer(leafletLayer, newName, editingLayerIdx);

            baseLayerGroup.clearLayers();
            userLayers.forEach((l) => {
                if (l.visible !== false) {
                    baseLayerGroup.addLayer(l.layer);
                }
            });
            updateLayerList();
            showToast("Camada editada com sucesso!", "success");
            console.log("Attempting to hide modal"); // Debug log
            
            // Try multiple ways to close the modal
            if (addLayerModal && typeof addLayerModal.hide === 'function') {
                addLayerModal.hide();
            } else {
                console.error("Modal hide method not available"); // Debug log
                // Fallback method
                const modalElement = document.getElementById("addLayerModal");
                if (modalElement) {
                    const modal = bootstrap.Modal.getInstance(modalElement);
                    if (modal) {
                        modal.hide();
                    }
                }
            }
        } catch (err) {
            showToast("Erro ao atualizar camada. Verifique o WKT.", "danger");
        }
    });

    // Settings menu
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsMenu = document.getElementById("settingsMenu");
    
    if (settingsBtn && settingsMenu) {
        settingsBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            settingsMenu.classList.toggle("show");
        });

        document.addEventListener("click", function() {
            settingsMenu.classList.remove("show");
        });
    }

    // Toggle converter panel
    const converterToggle = document.getElementById("converterToggleBtn");
    const converterPanel = document.getElementById("converterPanel");
    
    if (converterToggle && converterPanel) {
        converterToggle.addEventListener("click", function() {
            converterPanel.classList.toggle("show");
            converterToggle.querySelector("i").classList.toggle("fa-chevron-up");
            converterToggle.querySelector("i").classList.toggle("fa-chevron-down");
            // Save UI settings after toggle
            setTimeout(() => saveUISettings(), 100);
        });
    }

    // Resize handler for converter panel
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    const resizeHandle = document.querySelector(".resize-handle");
    if (resizeHandle) {
        resizeHandle.addEventListener("mousedown", function(e) {
            isResizing = true;
            startY = e.clientY;
            startHeight = converterPanel.offsetHeight;
            document.body.style.cursor = "ns-resize";
            e.preventDefault();
        });

        document.addEventListener("mousemove", function(e) {
            if (!isResizing) return;
            const delta = startY - e.clientY;
            const newHeight = Math.max(200, Math.min(window.innerHeight * 0.8, startHeight + delta));
            converterPanel.style.height = newHeight + "px";
        });

        document.addEventListener("mouseup", function() {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = "";
                // Save UI settings after resize
                saveUISettings();
            }
        });
    }

    // Storage event listeners
    document.getElementById("saveLayersBtn")?.addEventListener("click", () => saveLayersToLocalStorage(true));
    document.getElementById("exportLayersBtn")?.addEventListener("click", exportLayers);
    
    // Toggle notifications button
    document.getElementById("toggleNotificationsBtn")?.addEventListener("click", toggleNotifications);
    
    // Clear all data button with confirmation
    document.getElementById("clearAllDataBtn")?.addEventListener("click", function() {
        if (confirm("Tem certeza que deseja limpar todos os dados? Esta ação não pode ser desfeita.")) {
            clearAllData();
        }
    });
    
    const importBtn = document.getElementById("importLayersBtn");
    if (importBtn) {
        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = ".json";
        importInput.style.display = "none";
        document.body.appendChild(importInput);

        importBtn.addEventListener("click", () => importInput.click());
        importInput.addEventListener("change", function() {
            if (this.files && this.files.length > 0) {
                importLayers(this.files[0]).finally(() => this.value = "");
            }
        });
    }

    // Load saved layers on page load only if explicitly requested
    window.addEventListener("load", function () {
        setTimeout(() => {
            // Check URL parameter to load saved data
            const urlParams = new URLSearchParams(window.location.search);
            const loadSaved = urlParams.get('load') === 'true';
            
            if (loadSaved) {
                loadLayersFromLocalStorage();
            }
            loadUISettings();
        }, 500);
    });

    // Auto-save events (silent with debounce)
    const autoSaveEvents = ["layer-added", "layer-removed", "layer-edited", "layer-moved"];
    autoSaveEvents.forEach((eventName) => {
        document.addEventListener(eventName, debouncedAutoSave);
    });

    // Override functions to dispatch events
    const originalAddLayerToMap = addLayerToMap;
    window.addLayerToMap = function (...args) {
        const result = originalAddLayerToMap.apply(this, args);
        if (result) document.dispatchEvent(new CustomEvent("layer-added"));
        return result;
    };

    const originalRemoveLayer = removeLayer;
    window.removeLayer = function (...args) {
        originalRemoveLayer.apply(this, args);
        document.dispatchEvent(new CustomEvent("layer-removed"));
    };

    // moveLayer function removed - using drag and drop instead

    const editLayerForm = document.getElementById("editLayerForm");
    if (editLayerForm) {
        const originalSubmitHandler = editLayerForm.onsubmit;
        editLayerForm.addEventListener("submit", function (e) {
            if (originalSubmitHandler) originalSubmitHandler.call(this, e);
            document.dispatchEvent(new CustomEvent("layer-edited"));
        });
    }

    // Initialize map after DOM is loaded
    setTimeout(initializeMap, 100);
    
    // Initialize notification button text
    setTimeout(updateNotificationButtonText, 100);
});
