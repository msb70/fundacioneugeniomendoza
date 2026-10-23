<?php
/**
 * Plugin Name: FEM – Sincronizar web al publicar
 * Description: Al publicar, actualizar, despublicar o borrar una entrada, lanza en GitHub la sincronización del sitio fundacioneugeniomendoza.com (workflow sync-wordpress.yml). Configuración en Ajustes → Sincronizar web.
 * Version: 1.0.0
 * Author: Fundación Eugenio Mendoza
 * Requires PHP: 7.4
 *
 * El token se guarda en la opción fem_sync_token, o en wp-config.php con
 * define('FEM_SYNC_TOKEN', '...'), que tiene prioridad.
 * Token necesario: fine-grained de GitHub, solo el repo msb70/fundacioneugeniomendoza,
 * permiso "Actions: Read and write" (no puede modificar el código).
 */

if (!defined('ABSPATH')) exit;

const FEM_SYNC_REPO     = 'msb70/fundacioneugeniomendoza';
const FEM_SYNC_WORKFLOW = 'sync-wordpress.yml';
const FEM_SYNC_LOCK_S   = 20;   // Gutenberg guarda dos veces por clic: una sola llamada

function fem_sync_token() {
    if (defined('FEM_SYNC_TOKEN') && FEM_SYNC_TOKEN) return FEM_SYNC_TOKEN;
    return (string) get_option('fem_sync_token', '');
}

/** Llama a GitHub. Devuelve [ok(bool), mensaje]. */
function fem_sync_dispatch($reason) {
    $token = fem_sync_token();
    if ($token === '') return [false, 'Falta el token de GitHub.'];
    $r = wp_remote_post(
        'https://api.github.com/repos/' . FEM_SYNC_REPO . '/actions/workflows/' . FEM_SYNC_WORKFLOW . '/dispatches',
        [
            'timeout' => 10,
            'headers' => [
                'Authorization'        => 'Bearer ' . $token,
                'Accept'               => 'application/vnd.github+json',
                'X-GitHub-Api-Version' => '2022-11-28',
                'User-Agent'           => 'FEM-WP-sync-trigger',
                'Content-Type'         => 'application/json',
            ],
            'body' => wp_json_encode(['ref' => 'main']),
        ]
    );
    if (is_wp_error($r)) {
        $msg = 'Error de red: ' . $r->get_error_message();
    } else {
        $code = wp_remote_retrieve_response_code($r);
        $msg  = $code === 204 ? 'OK' : 'HTTP ' . $code . ' ' . substr(wp_remote_retrieve_body($r), 0, 200);
    }
    $ok = ($msg === 'OK');
    update_option('fem_sync_last', [
        'time'   => current_time('mysql'),
        'reason' => $reason,
        'result' => $msg,
    ], false);
    return [$ok, $msg];
}

function fem_sync_maybe($reason) {
    if (get_transient('fem_sync_lock')) return;
    set_transient('fem_sync_lock', 1, FEM_SYNC_LOCK_S);
    fem_sync_dispatch($reason);
}

/** Cambios de estado que afectan a la web: entrar en, salir de o actualizar algo publicado. */
add_action('transition_post_status', function ($new, $old, $post) {
    if ($post->post_type !== 'post') return;
    if (wp_is_post_revision($post) || wp_is_post_autosave($post)) return;
    if ($new !== 'publish' && $old !== 'publish') return;
    fem_sync_maybe(sprintf('Entrada %d (%s → %s): %s', $post->ID, $old, $new, $post->post_title));
}, 10, 3);

add_action('before_delete_post', function ($post_id) {
    $p = get_post($post_id);
    if ($p && $p->post_type === 'post' && $p->post_status === 'publish') {
        fem_sync_maybe(sprintf('Entrada %d borrada: %s', $post_id, $p->post_title));
    }
});

/* ---------- Ajustes → Sincronizar web ---------- */

add_action('admin_menu', function () {
    add_options_page('Sincronizar web', 'Sincronizar web', 'manage_options', 'fem-sync', 'fem_sync_page');
});

add_action('admin_init', function () {
    register_setting('fem_sync', 'fem_sync_token', [
        'type'              => 'string',
        'sanitize_callback' => function ($v) {
            $v = trim((string) $v);
            // Campo vacío al guardar = conservar el token actual (no se muestra nunca).
            return $v === '' ? (string) get_option('fem_sync_token', '') : $v;
        },
    ]);
});

add_action('admin_post_fem_sync_now', function () {
    if (!current_user_can('manage_options')) wp_die('Sin permiso');
    check_admin_referer('fem_sync_now');
    [$ok, $msg] = fem_sync_dispatch('Lanzada a mano desde Ajustes');
    wp_safe_redirect(add_query_arg(['page' => 'fem-sync', 'fem_sync_result' => $ok ? 'ok' : 'error'], admin_url('options-general.php')));
    exit;
});

function fem_sync_page() {
    if (!current_user_can('manage_options')) return;
    $has   = fem_sync_token() !== '';
    $last  = get_option('fem_sync_last');
    $const = defined('FEM_SYNC_TOKEN') && FEM_SYNC_TOKEN;
    ?>
    <div class="wrap">
        <h1>Sincronizar web</h1>
        <p>Cada vez que se publica, actualiza, despublica o borra una entrada, la web
           <a href="https://fundacioneugeniomendoza.com" target="_blank" rel="noopener">fundacioneugeniomendoza.com</a>
           se actualiza sola en 3–5 minutos.</p>

        <?php if (isset($_GET['fem_sync_result'])): ?>
            <div class="notice notice-<?php echo $_GET['fem_sync_result'] === 'ok' ? 'success' : 'error'; ?>"><p>
                <?php echo $_GET['fem_sync_result'] === 'ok' ? 'Sincronización lanzada.' : 'No se pudo lanzar. Mira «Última llamada».'; ?>
            </p></div>
        <?php endif; ?>

        <h2>Estado</h2>
        <p>Token: <strong><?php echo $has ? 'configurado' . ($const ? ' (wp-config.php)' : '') : 'falta'; ?></strong></p>
        <?php if ($last): ?>
            <p>Última llamada: <?php echo esc_html($last['time']); ?> — <?php echo esc_html($last['reason']); ?> —
               <strong><?php echo esc_html($last['result']); ?></strong></p>
        <?php endif; ?>

        <?php if (!$const): ?>
        <h2>Token de GitHub</h2>
        <form method="post" action="options.php">
            <?php settings_fields('fem_sync'); ?>
            <input type="password" name="fem_sync_token" class="regular-text" autocomplete="off"
                   placeholder="<?php echo $has ? '•••••• (déjalo vacío para conservarlo)' : 'github_pat_…'; ?>">
            <?php submit_button('Guardar token', 'secondary', 'submit', false); ?>
        </form>
        <?php endif; ?>

        <h2>Sincronizar ahora</h2>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
            <input type="hidden" name="action" value="fem_sync_now">
            <?php wp_nonce_field('fem_sync_now'); ?>
            <?php submit_button('Sincronizar la web ahora', 'primary', 'submit', false); ?>
        </form>
    </div>
    <?php
}
