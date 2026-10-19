<?php
// Postulaciones de "Trabaja con Nosotros" con CV adjunto.
// Sustituye a admin-ajax.php?action=tcn_submit_application. Responde JSON como WordPress.
declare(strict_types=1);
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: /trabaja-con-nosotros/', true, 303);
    exit;
}

/** Responde JSON a fetch(); a un envío clásico (sin JS) lo devuelve a la página con un aviso. */
function tcn_reply(bool $ok, string $message): never
{
    if (fem_wants_json()) {
        fem_json($ok, ['message' => $message]);
    }
    header('Location: /trabaja-con-nosotros/?postulacion=' . ($ok ? 'ok' : 'error') . '#tcn-application-form', true, 303);
    exit;
}

if (fem_is_bot()) {
    tcn_reply(true, 'ok');
}

$nombre    = fem_clean('nombre', 200);
$email     = fem_clean('email', 200);
$telefono  = fem_clean('telefono', 60);
$categoria = fem_clean('categoria', 60);
$mensaje   = fem_clean('mensaje', 8000);

if ($nombre === '' || $telefono === '' || $categoria === '' || $mensaje === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    tcn_reply(false, 'Por favor completa todos los campos obligatorios.');
}

$f = $_FILES['cv'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    tcn_reply(false, 'Por favor adjunta tu CV');
}
if ($f['size'] > 5 * 1024 * 1024) {
    tcn_reply(false, 'El archivo supera el máximo de 5MB.');
}
$ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
$mimes = ['pdf' => 'application/pdf', 'doc' => 'application/msword',
          'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
// Comprobar el contenido real, no solo la extensión (un .exe renombrado a .pdf no pasa).
$real = class_exists('finfo') ? (string)(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) : '';
$okTypes = ['pdf' => ['application/pdf'],
            'doc' => ['application/msword', 'application/CDFV2', 'application/x-ole-storage', 'application/vnd.ms-office'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip', 'application/octet-stream']];
if (!isset($mimes[$ext]) || ($real !== '' && !in_array($real, $okTypes[$ext], true))) {
    tcn_reply(false, 'Solo se permiten archivos PDF, DOC o DOCX');
}
if (fem_rate_limited('careers')) {
    tcn_reply(false, 'Has enviado demasiadas solicitudes. Inténtalo más tarde.');
}

$data = file_get_contents($f['tmp_name']);
$safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', pathinfo($f['name'], PATHINFO_FILENAME)) . '.' . $ext;

$body = "Nueva postulación desde /trabaja-con-nosotros/\n\n"
      . "Nombre: $nombre\nEmail: $email\nTeléfono: $telefono\nÁrea de interés: $categoria\n\n"
      . "Mensaje / Carta de presentación:\n$mensaje\n";

$ok = fem_mail("Postulación: $nombre ($categoria)", $body, $email,
               ['name' => $safeName, 'type' => $mimes[$ext], 'data' => $data]);

fem_log_submission('postulacion', $body . "Adjunto: $safeName (" . round(strlen($data) / 1024) . " KB, no se guarda copia)\n", $ok);

$ok ? tcn_reply(true, 'ok')
    : tcn_reply(false, 'No se pudo enviar la aplicación. Inténtalo nuevamente.');
