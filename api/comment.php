<?php
// Comentarios de entradas. Sustituye a wp-comments-post.php.
// El sitio estático no publica comentarios automáticamente: se envían por correo para moderación
// (equivalente a la cola "pendiente de moderación" de WordPress).
declare(strict_types=1);
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /blog/', true, 303);
    exit;
}

$postId  = fem_clean('comment_post_ID', 20);
$comment = fem_clean('comment', 65525);
$author  = fem_clean('author', 245);
$email   = fem_clean('email', 100);
$url     = fem_clean('url', 200);

$ref  = (string)($_SERVER['HTTP_REFERER'] ?? '');
$host = parse_url($ref, PHP_URL_HOST);
$path = fem_safe_path(rawurldecode((string)parse_url($ref, PHP_URL_PATH)), '/blog/');
if ($host !== null && $host !== strtok((string)($_SERVER['HTTP_HOST'] ?? ''), ':')) {
    $path = '/blog/';
}
$path = implode('/', array_map('rawurlencode', explode('/', $path)));

if (fem_is_bot()) {
    header('Location: ' . $path . '?comentario=pendiente#comentarios', true, 303);
    exit;
}

if ($comment === '' || $author === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header('Location: ' . $path . '?comentario=error#comentarios', true, 303);
    exit;
}
if (fem_rate_limited('comment')) {
    header('Location: ' . $path . '?comentario=limite#comentarios', true, 303);
    exit;
}

$body = "Nuevo comentario pendiente de moderación\n\n"
      . "Artículo: $path (ID $postId)\nNombre: $author\nEmail: $email\n"
      . ($url !== '' ? "Web: $url\n" : '')
      . "\nComentario:\n$comment\n";
$ok = fem_mail('Comentario en ' . rawurldecode($path), $body, $email);
fem_log_submission('comentario', $body, $ok);

header('Location: ' . $path . '?comentario=' . ($ok ? 'pendiente' : 'error') . '#comentarios', true, 303);
