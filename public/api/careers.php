<?php
// Postulaciones de "Trabaja con Nosotros" con CV adjunto.
// Sustituye a admin-ajax.php?action=tcn_submit_application. Responde JSON como WordPress.
declare(strict_types=1);
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fem_json(false, ['message' => 'Método no permitido'], 405);
}

$nombre    = fem_clean('nombre', 200);
$email     = fem_clean('email', 200);
$telefono  = fem_clean('telefono', 60);
$categoria = fem_clean('categoria', 60);
$mensaje   = fem_clean('mensaje', 8000);

if ($nombre === '' || $telefono === '' || $categoria === '' || $mensaje === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fem_json(false, ['message' => 'Por favor completa todos los campos obligatorios.']);
}

$f = $_FILES['cv'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    fem_json(false, ['message' => 'Por favor adjunta tu CV']);
}
if ($f['size'] > 5 * 1024 * 1024) {
    fem_json(false, ['message' => 'El archivo supera el máximo de 5MB.']);
}
$ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
$mimes = ['pdf' => 'application/pdf', 'doc' => 'application/msword',
          'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
if (!isset($mimes[$ext])) {
    fem_json(false, ['message' => 'Solo se permiten archivos PDF, DOC o DOCX']);
}
if (fem_rate_limited('careers')) {
    fem_json(false, ['message' => 'Has enviado demasiadas solicitudes. Inténtalo más tarde.']);
}

$data = file_get_contents($f['tmp_name']);
$safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', pathinfo($f['name'], PATHINFO_FILENAME)) . '.' . $ext;

$body = "Nueva postulación desde /trabaja-con-nosotros/\n\n"
      . "Nombre: $nombre\nEmail: $email\nTeléfono: $telefono\nÁrea de interés: $categoria\n\n"
      . "Mensaje / Carta de presentación:\n$mensaje\n";

$ok = fem_mail("Postulación: $nombre ($categoria)", $body, $email,
               ['name' => $safeName, 'type' => $mimes[$ext], 'data' => $data]);

$ok ? fem_json(true, ['message' => 'ok'])
    : fem_json(false, ['message' => 'No se pudo enviar la aplicación. Inténtalo nuevamente.']);
