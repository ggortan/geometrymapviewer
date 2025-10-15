// Teste das funções de conversão
// Para executar: node test_conversions.js

// Simular algumas funções que existem no navegador
global.showToast = function(message, type) {
    console.log(`Toast [${type}]: ${message}`);
};

// Copiar as funções de conversão do script.js
function convertPolygonsToMultipolygon(input) {
    const lines = input.trim().split('\n');
    const polygons = [];
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('POLYGON')) {
            // Extrair coordenadas do polígono
            const match = trimmedLine.match(/POLYGON\s*\(\s*\(([^)]+)\)\s*\)/);
            if (match) {
                polygons.push(match[1]);
            }
        }
    }
    
    if (polygons.length === 0) {
        return "Nenhum polígono válido encontrado na entrada.";
    }
    
    const polygonParts = polygons.map(coords => `((${coords}))`).join(',');
    return `MULTIPOLYGON (${polygonParts})`;
}

function convertMultipolygonToPolygons(input) {
    const trimmedInput = input.trim();
    
    if (!trimmedInput.startsWith('MULTIPOLYGON')) {
        return "A entrada deve ser um MULTIPOLYGON válido.";
    }
    
    // Usar regex mais robusta para extrair polígonos
    const regex = /\(\s*\(\s*([^)]+)\s*\)\s*\)/g;
    const polygons = [];
    let match;
    
    while ((match = regex.exec(trimmedInput)) !== null) {
        polygons.push(`POLYGON ((${match[1]}))`);
    }
    
    if (polygons.length === 0) {
        return "Nenhum polígono válido encontrado no MULTIPOLYGON.";
    }
    
    return polygons.join('\n');
}

function convertWktToGeojson(input) {
    const lines = input.trim().split('\n');
    const features = [];
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        try {
            if (trimmedLine.startsWith('POLYGON')) {
                const match = trimmedLine.match(/POLYGON\s*\(\s*\(([^)]+)\)\s*\)/);
                if (match) {
                    const coords = match[1].split(',').map(coord => {
                        const [lon, lat] = coord.trim().split(/\s+/);
                        return [parseFloat(lon), parseFloat(lat)];
                    });
                    
                    features.push({
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Polygon",
                            coordinates: [coords]
                        }
                    });
                }
            } else if (trimmedLine.startsWith('POINT')) {
                const match = trimmedLine.match(/POINT\s*\(\s*([^)]+)\s*\)/);
                if (match) {
                    const [lon, lat] = match[1].trim().split(/\s+/);
                    features.push({
                        type: "Feature",
                        properties: {},
                        geometry: {
                            type: "Point",
                            coordinates: [parseFloat(lon), parseFloat(lat)]
                        }
                    });
                }
            }
        } catch (error) {
            console.error("Erro ao processar linha:", trimmedLine, error);
        }
    }
    
    if (features.length === 0) {
        return "Nenhuma geometria WKT válida encontrada na entrada.";
    }
    
    return JSON.stringify({
        type: "FeatureCollection",
        features: features
    }, null, 2);
}

function convertGeojsonToWkt(input) {
    try {
        const geojson = JSON.parse(input);
        
        if (!geojson || !geojson.type) {
            return "Formato GeoJSON inválido.";
        }
        
        const wktLines = [];
        
        if (geojson.type === 'FeatureCollection') {
            if (!geojson.features || geojson.features.length === 0) {
                return "FeatureCollection vazia ou sem features.";
            }
            
            for (const feature of geojson.features) {
                if (feature.geometry) {
                    const wkt = geometryToWkt(feature.geometry);
                    if (wkt) wktLines.push(wkt);
                }
            }
        } else if (geojson.type === 'Feature') {
            if (geojson.geometry) {
                const wkt = geometryToWkt(geojson.geometry);
                if (wkt) wktLines.push(wkt);
            }
        } else {
            const wkt = geometryToWkt(geojson);
            if (wkt) wktLines.push(wkt);
        }
        
        return wktLines.length > 0 ? wktLines.join('\n') : "Nenhuma geometria válida encontrada no GeoJSON.";
        
    } catch (error) {
        return `Erro na conversão: ${error.message}`;
    }
}

function geometryToWkt(geometry) {
    if (!geometry || !geometry.type) return null;
    
    switch (geometry.type) {
        case 'Point':
            if (geometry.coordinates && geometry.coordinates.length >= 2) {
                return `POINT (${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
            }
            break;
            
        case 'Polygon':
            if (geometry.coordinates && geometry.coordinates[0]) {
                const coords = geometry.coordinates[0].map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                return `POLYGON ((${coords}))`;
            }
            break;
            
        case 'MultiPolygon':
            if (geometry.coordinates && geometry.coordinates.length > 0) {
                const polygons = geometry.coordinates.map(polygon => {
                    const coords = polygon[0].map(coord => `${coord[0]} ${coord[1]}`).join(', ');
                    return `((${coords}))`;
                });
                return `MULTIPOLYGON (${polygons.join(', ')})`;
            }
            break;
    }
    
    return null;
}

// Executar os testes
function runTests() {
    console.log("🧪 Iniciando teste das conversões...\n");
    
    const tests = [
        {
            name: "Polígonos para Multipolígono",
            input: `POLYGON((-46.65 -23.55, -46.64 -23.55, -46.64 -23.54, -46.65 -23.54, -46.65 -23.55))
POLYGON((-46.63 -23.56, -46.62 -23.56, -46.62 -23.55, -46.63 -23.55, -46.63 -23.56))`,
            function: convertPolygonsToMultipolygon,
            expectedPattern: /^MULTIPOLYGON/
        },
        {
            name: "Multipolígono para Polígonos",
            input: `MULTIPOLYGON (((-46.65 -23.55, -46.64 -23.55, -46.64 -23.54, -46.65 -23.54, -46.65 -23.55)),((-46.63 -23.56, -46.62 -23.56, -46.62 -23.55, -46.63 -23.55, -46.63 -23.56)))`,
            function: convertMultipolygonToPolygons,
            expectedPattern: /^POLYGON.*\nPOLYGON/
        },
        {
            name: "WKT para GeoJSON",
            input: `POLYGON((-46.6344 -23.5505, -46.6334 -23.5505, -46.6334 -23.5495, -46.6344 -23.5495, -46.6344 -23.5505))`,
            function: convertWktToGeojson,
            expectedPattern: /"type": "FeatureCollection"/
        },
        {
            name: "GeoJSON para WKT",
            input: `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {},
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-46.6344, -23.5505],
          [-46.6334, -23.5505],
          [-46.6334, -23.5495],
          [-46.6344, -23.5495],
          [-46.6344, -23.5505]
        ]]
      }
    }
  ]
}`,
            function: convertGeojsonToWkt,
            expectedPattern: /^POLYGON/
        }
    ];
    
    let passedTests = 0;
    let totalTests = tests.length;
    
    tests.forEach((test, index) => {
        try {
            console.log(`📋 Teste ${index + 1}: ${test.name}`);
            console.log("Input:", test.input.substring(0, 100) + (test.input.length > 100 ? "..." : ""));
            
            const result = test.function(test.input);
            console.log("Output:", result.substring(0, 100) + (result.length > 100 ? "..." : ""));
            
            if (test.expectedPattern.test(result)) {
                console.log("✅ PASSOU\n");
                passedTests++;
            } else {
                console.log("❌ FALHOU - Padrão esperado não encontrado\n");
            }
        } catch (error) {
            console.log(`❌ FALHOU - Erro: ${error.message}\n`);
        }
    });
    
    console.log(`📊 Resultado dos testes: ${passedTests}/${totalTests} aprovados`);
    
    if (passedTests === totalTests) {
        console.log("🎉 Todos os testes passaram!");
    } else {
        console.log("⚠️ Alguns testes falharam.");
    }
    
    return passedTests === totalTests;
}

// Executar os testes
runTests();