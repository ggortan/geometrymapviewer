<?php
// Configurações de cabeçalho para permitir CORS e definir tipo de resposta
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Função para converter Shapefile para WKT usando ogr2ogr
function shapefileToWKT($shpFilePath) {
    // Criar um diretório temporário para os resultados
    $tempDir = sys_get_temp_dir() . '/shp_' . uniqid();
    if (!file_exists($tempDir)) {
        mkdir($tempDir, 0755, true);
    }
    
    // Arquivo de saída para o WKT
    $wktFile = $tempDir . '/output.wkt';
    
    // Comando para converter Shapefile para WKT usando ogr2ogr
    $command = "ogr2ogr -f CSV $wktFile $shpFilePath -lco GEOMETRY=AS_WKT";
    
    // Executar o comando
    exec($command, $output, $returnCode);
    
    if ($returnCode !== 0) {
        // Limpar arquivos temporários
        array_map('unlink', glob("$tempDir/*"));
        rmdir($tempDir);
        
        return [
            'success' => false,
            'error' => 'Erro ao executar ogr2ogr: ' . implode("\n", $output)
        ];
    }
    
    // Ler o arquivo WKT gerado
    if (!file_exists($wktFile)) {
        return [
            'success' => false,
            'error' => 'Arquivo WKT não foi gerado'
        ];
    }
    
    $wktContent = file_get_contents($wktFile);
    $lines = explode("\n", $wktContent);
    
    // Remover a primeira linha (cabeçalho)
    array_shift($lines);
    
    // Extrair as geometrias WKT
    $wktGeometries = [];
    foreach ($lines as $line) {
        if (empty(trim($line))) continue;
        
        // Extrair a parte WKT da linha CSV
        if (preg_match('/"(POLYGON|MULTIPOLYGON|POINT|MULTIPOINT|LINESTRING|MULTILINESTRING\s*\(.*\))"/i', $line, $matches)) {
            $wktGeometries[] = $matches[1];
        }
    }
    
    // Limpar arquivos temporários
    array_map('unlink', glob("$tempDir/*"));
    rmdir($tempDir);
    
    return [
        'success' => true,
        'wkt' => implode("\n", $wktGeometries),
        'count' => count($wktGeometries)
    ];
}

// Verificar se é uma requisição POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode([
        'success' => false,
        'error' => 'Método não permitido. Use POST.'
    ]);
    exit;
}

// Verificar se um arquivo foi enviado
if (!isset($_FILES['shapefile']) || $_FILES['shapefile']['error'] !== UPLOAD_ERR_OK) {
    echo json_encode([
        'success' => false,
        'error' => 'Nenhum arquivo enviado ou erro no upload.'
    ]);
    exit;
}

// Diretório para salvar os arquivos temporários
$uploadDir = sys_get_temp_dir() . '/shp_uploads_' . uniqid();
if (!file_exists($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Processar o arquivo .shp
$shpFile = null;
$uploadedFiles = [];

// Processar todos os arquivos enviados
foreach ($_FILES as $fileKey => $fileInfo) {
    $fileName = $fileInfo['name'];
    $tmpName = $fileInfo['tmp_name'];
    $fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    
    // Salvar o arquivo no diretório temporário
    $targetPath = $uploadDir . '/' . $fileName;
    move_uploaded_file($tmpName, $targetPath);
    $uploadedFiles[] = $targetPath;
    
    // Identificar o arquivo .shp
    if ($fileExt === 'shp') {
        $shpFile = $targetPath;
    }
}

// Verificar se encontramos um arquivo .shp
if ($shpFile === null) {
    // Limpar arquivos temporários
    foreach ($uploadedFiles as $file) {
        unlink($file);
    }
    rmdir($uploadDir);
    
    echo json_encode([
        'success' => false,
        'error' => 'Arquivo .shp não encontrado entre os arquivos enviados.'
    ]);
    exit;
}

// Converter o Shapefile para WKT
$result = shapefileToWKT($shpFile);

// Adicionar o nome do arquivo ao resultado
if ($result['success']) {
    $result['name'] = pathinfo($_FILES['shapefile']['name'], PATHINFO_FILENAME);
}

// Limpar arquivos temporários
foreach ($uploadedFiles as $file) {
    unlink($file);
}
rmdir($uploadDir);

// Retornar o resultado como JSON
echo json_encode($result);
?>