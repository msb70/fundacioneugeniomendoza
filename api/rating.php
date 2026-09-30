<?php
// Valoraciones con estrellas de entradas y aliados. Sustituye a admin-ajax.php?action=fem_rate_post.
//  GET  ?ids=1,2   -> valores actuales (para refrescar lo que se generó en el build)
//  POST post_id, rating (1-5) -> guarda y devuelve {average, count}
// Los datos viven fuera de public_html (fem-data/ratings.json), sembrados con los valores de WordPress.
declare(strict_types=1);
require __DIR__ . '/lib.php';

function fem_ratings_load($fh): array
{
    $raw = stream_get_contents($fh);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) {
        $data = json_decode((string)@file_get_contents(__DIR__ . '/ratings-seed.json'), true) ?: [];
    }
    return $data;
}

function fem_ratings_out(array $r): array
{
    $count = (int)($r['count'] ?? 0);
    return ['average' => $count ? round($r['sum'] / $count, 1) : 0, 'count' => $count];
}

$file = fem_data_dir() . '/ratings.json';
$fh = fopen($file, 'c+');
if (!$fh) {
    fem_json(false, ['message' => 'No se pudo guardar la valoración.'], 500);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    flock($fh, LOCK_SH);
    $data = fem_ratings_load($fh);
    flock($fh, LOCK_UN);
    $out = [];
    foreach (array_slice(explode(',', (string)($_GET['ids'] ?? '')), 0, 50) as $id) {
        if (ctype_digit($id) && isset($data[$id])) {
            $out[$id] = fem_ratings_out($data[$id]);
        }
    }
    fem_json(true, $out);
}

$postId = (string)($_POST['post_id'] ?? '');
$rating = (int)($_POST['rating'] ?? 0);
if (!ctype_digit($postId) || $rating < 1 || $rating > 5) {
    fem_json(false, ['message' => 'Valoración no válida.']);
}

flock($fh, LOCK_EX);
$data = fem_ratings_load($fh);
if (!isset($data[$postId])) {
    flock($fh, LOCK_UN);
    fem_json(false, ['message' => 'Contenido no encontrado.']);
}
$voter = fem_ip_hash();
$voters = $data[$postId]['voters'] ?? [];
if (in_array($voter, $voters, true)) {
    flock($fh, LOCK_UN);
    fem_json(false, ['message' => 'Ya registraste tu valoración para este artículo.']);
}
$data[$postId]['sum'] = ($data[$postId]['sum'] ?? 0) + $rating;
$data[$postId]['count'] = ($data[$postId]['count'] ?? 0) + 1;
$voters[] = $voter;
$data[$postId]['voters'] = $voters;

ftruncate($fh, 0);
rewind($fh);
fwrite($fh, json_encode($data));
flock($fh, LOCK_UN);
fclose($fh);

fem_json(true, fem_ratings_out($data[$postId]));
