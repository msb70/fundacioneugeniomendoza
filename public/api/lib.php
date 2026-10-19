<?php
/**
 * Configuración y utilidades comunes de los endpoints PHP del sitio estático.
 * Sustituyen a las funciones de WordPress (admin-post, admin-ajax, comentarios).
 */
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') {
    http_response_code(404);
    exit;
}

const FEM_TO        = 'contacto@fundacioneugeniomendoza.com';   // destinatario de formularios
const FEM_FROM      = 'no-reply@fundacioneugeniomendoza.com';   // remitente (debe ser un buzón del dominio)
const FEM_FROM_NAME = 'Web Fundación Eugenio Mendoza';
const FEM_RATE_MAX  = 5;      // envíos por IP y hora, por formulario
const FEM_HONEYPOT  = 'sitio_web_alt'; // campo trampa que añade Base.astro a todos los formularios

/** Carpeta de datos FUERA de public_html: los despliegues por Git no la tocan. */
function fem_data_dir(): string
{
    $dir = dirname(__DIR__, 2) . '/fem-data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir;
}

function fem_clean(string $key, int $max = 5000): string
{
    $v = trim((string)($_POST[$key] ?? ''));
    $v = str_replace("\0", '', $v);
    return mb_substr($v, 0, $max);
}

function fem_header_safe(string $v): string
{
    return trim(preg_replace('/[\r\n]+/', ' ', $v));
}

function fem_ip_hash(): string
{
    return hash_hmac('sha256', $_SERVER['REMOTE_ADDR'] ?? '', fem_secret());
}

/** Hash usado hasta oct-2026 (solo para reconocer votos antiguos en rating.php). */
function fem_ip_hash_legacy(): string
{
    return hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . '|fem');
}

/** Clave aleatoria propia del servidor (fuera de public_html) para no guardar IPs reversibles. */
function fem_secret(): string
{
    $file = fem_data_dir() . '/secret.key';
    $key = @file_get_contents($file);
    if (!$key) {
        $key = bin2hex(random_bytes(32));
        @file_put_contents($file, $key, LOCK_EX);
        @chmod($file, 0600);
    }
    return $key;
}

/** true si un bot ha rellenado el campo trampa (se responde como si todo fuera bien). */
function fem_is_bot(): bool
{
    return trim((string)($_POST[FEM_HONEYPOT] ?? '')) !== '';
}

/** La petición viene de fetch() y espera JSON (si no, es un envío clásico de formulario). */
function fem_wants_json(): bool
{
    return ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== ''
        || str_contains((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
}

/** Copia de cada envío en fem-data/envios/AAAA-MM.log: si el correo falla, el mensaje no se pierde. */
function fem_log_submission(string $form, string $body, bool $mailed): void
{
    $dir = fem_data_dir() . '/envios';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $line = '=== ' . date('c') . " | $form | correo " . ($mailed ? 'OK' : 'FALLÓ') . " ===\n$body\n";
    @file_put_contents($dir . '/' . date('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);
}

/** Límite simple de envíos por IP y hora (anti-spam básico). */
function fem_rate_limited(string $bucket): bool
{
    $file = fem_data_dir() . '/rate-' . $bucket . '.json';
    $now = time();
    $fh = @fopen($file, 'c+');
    if (!$fh) {
        error_log('FEM: no se puede escribir ' . $file . ' (límite anti-spam desactivado)');
        return false;
    }
    flock($fh, LOCK_EX);
    $data = json_decode(stream_get_contents($fh) ?: '{}', true) ?: [];
    $ip = fem_ip_hash();
    $hits = array_values(array_filter($data[$ip] ?? [], fn($t) => $t > $now - 3600));
    $limited = count($hits) >= FEM_RATE_MAX;
    if (!$limited) {
        $hits[] = $now;
    }
    $data[$ip] = $hits;
    foreach ($data as $k => $v) {
        if (!array_filter($v, fn($t) => $t > $now - 3600)) {
            unset($data[$k]);
        }
    }
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    flock($fh, LOCK_UN);
    fclose($fh);
    return $limited;
}

/** Ruta interna segura para redirigir (evita open-redirect). */
function fem_back(string $fallback = '/'): string
{
    return fem_safe_path((string)($_POST['_wp_http_referer'] ?? ''), $fallback);
}

/** Solo rutas internas del tipo /a/b/ (evita open-redirect con //dominio, \\dominio, etc.). */
function fem_safe_path(string $path, string $fallback = '/'): string
{
    $path = (string)strtok($path, '?#');
    if (!preg_match('#^/(?:[\p{L}\p{N}\p{So}\x{FE0F}%._-]+/)*$#u', $path) || str_contains($path, '//')) {
        return $fallback;
    }
    return $path;
}

/**
 * Envía un correo (texto plano, con adjunto opcional) usando mail() de Hostinger.
 * Para máxima entregabilidad se recomienda migrar a SMTP autenticado.
 */
function fem_mail(string $subject, string $body, string $replyTo = '', ?array $attachment = null): bool
{
    $subject = '=?UTF-8?B?' . base64_encode(fem_header_safe($subject)) . '?=';
    $headers = [
        'From: ' . '=?UTF-8?B?' . base64_encode(FEM_FROM_NAME) . '?= <' . FEM_FROM . '>',
        'MIME-Version: 1.0',
    ];
    if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . fem_header_safe($replyTo);
    }
    if ($attachment === null) {
        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: 8bit';
        return mail(FEM_TO, $subject, $body, implode("\r\n", $headers), '-f' . FEM_FROM);
    }
    $boundary = 'fem_' . bin2hex(random_bytes(12));
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';
    $name = fem_header_safe($attachment['name']);
    $msg  = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n$body\r\n";
    $msg .= "--$boundary\r\nContent-Type: {$attachment['type']}; name=\"$name\"\r\n"
          . "Content-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename=\"$name\"\r\n\r\n"
          . chunk_split(base64_encode($attachment['data'])) . "\r\n--$boundary--";
    return mail(FEM_TO, $subject, $msg, implode("\r\n", $headers), '-f' . FEM_FROM);
}

function fem_json(bool $ok, array $data = [], int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['success' => $ok, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
