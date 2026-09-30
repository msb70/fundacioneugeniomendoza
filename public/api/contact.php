<?php
// Formulario de contacto (home y /contacto/). Sustituye a admin-post.php?action=fem_contact.
declare(strict_types=1);
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /contacto/', true, 303);
    exit;
}

$back   = fem_back('/contacto/');
$nombre = fem_clean('nombre', 200);
$email  = fem_clean('email', 200);
$asunto = fem_clean('asunto', 200);
$msg    = fem_clean('mensaje', 5000);

if ($nombre === '' || $msg === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    header('Location: ' . $back . '?contacto=error', true, 303);
    exit;
}
if (fem_rate_limited('contact')) {
    header('Location: ' . $back . '?contacto=limite', true, 303);
    exit;
}

$body = "Nuevo mensaje desde la web ($back)\n\n"
      . "Nombre: $nombre\nEmail: $email\n"
      . ($asunto !== '' ? "Asunto: $asunto\n" : '')
      . "\nMensaje:\n$msg\n";
$ok = fem_mail('Contacto web: ' . ($asunto !== '' ? $asunto : $nombre), $body, $email);

header('Location: ' . $back . '?contacto=' . ($ok ? 'ok' : 'error'), true, 303);
