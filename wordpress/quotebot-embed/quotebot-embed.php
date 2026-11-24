<?php
/**
 * Plugin Name:       Quote Bot embedded quote form
 * Description:       Puts your co-branded Quote Bot life insurance quote form on your own site, with a shortcode or a block.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            Quote Bot
 * Author URI:        https://quote-bot.com/
 * License:           GPL-2.0-or-later
 * Text Domain:       quotebot-embed
 *
 * WHY THIS PLUGIN EXISTS AT ALL, because a shortcode wrapping a script tag
 * looks like busywork until you try the plain snippet on WordPress.
 *
 * WordPress strips <script> out of post content for every role below
 * administrator -- editors and authors included -- and a long tail of
 * security plugins strip it whatever the role. The snippet looks right in
 * the editor, saves without complaint, and renders nothing. So the fix is
 * not packaging: it is enqueueing the script through WordPress, where
 * nothing strips it, and putting a plain <div> in the content, where
 * nothing does either.
 *
 * WHAT THIS PLUGIN WILL NOT DO. It collects nothing, stores nothing about
 * a visitor, and talks to nothing but the Quote Bot script it enqueues.
 * The quote form itself runs in an iframe on tools.quote-bot.com -- the
 * date of birth and contact details a visitor types are never in this
 * site's pages, so no plugin, theme or analytics tag here can read them.
 */

if (!defined('ABSPATH')) {
    exit; // Loaded directly rather than by WordPress.
}

const QUOTEBOT_EMBED_VERSION = '1.0.0';
const QUOTEBOT_EMBED_HANDLE  = 'quotebot-embed-loader';
const QUOTEBOT_EMBED_SRC     = 'https://tools.quote-bot.com/js/quotebot-embed-loader.js';
const QUOTEBOT_EMBED_HOSTED  = 'https://tools.quote-bot.com/quotetool.html';
const QUOTEBOT_EMBED_OPTION  = 'quotebot_embed_code';

/**
 * Register the script without putting it on every page.
 *
 * REGISTERED, NOT ENQUEUED. A partner may have this plugin active and the
 * form on one page; loading our script on all of theirs would be us taking
 * a request on every page view of a site we are a guest on. The shortcode
 * and the block enqueue it when they actually render.
 */
function quotebot_embed_register_script(): void {
    wp_register_script(
        QUOTEBOT_EMBED_HANDLE,
        QUOTEBOT_EMBED_SRC,
        array(),
        QUOTEBOT_EMBED_VERSION,
        /*
         * The args array is WordPress 6.3 and later. On anything older
         * this parameter was a boolean $in_footer, and an array is
         * truthy -- so an old site still gets the script in the footer
         * and simply does not get `defer`. That is why the header asks
         * for 6.0 rather than 6.3: the degradation is harmless, and
         * excluding older sites over it would not be.
         */
        array('in_footer' => true, 'strategy' => 'defer')
    );
}
add_action('wp_enqueue_scripts', 'quotebot_embed_register_script');
add_action('enqueue_block_assets', 'quotebot_embed_register_script');

/** The code saved in settings, which a shortcode may override. */
function quotebot_embed_default_code(): string {
    return trim((string) get_option(QUOTEBOT_EMBED_OPTION, ''));
}

/**
 * The markup one embed renders to.
 *
 * EVERYTHING IS ESCAPED ON THE WAY OUT, including values this plugin wrote
 * itself. A tracking code arrives from a settings field and a shortcode
 * attribute, both of which are text somebody typed, and the difference
 * between esc_attr and trusting ourselves is one careless edit later.
 *
 * THE LINK INSIDE IS THE FALLBACK, and it is the whole reason the markup
 * is shaped this way. If the script is blocked, never loads, or the
 * visitor has JavaScript off, that link is what they get -- and it goes to
 * the same co-branded quote page, carrying the same tracking code, so the
 * partner is still credited. The loader empties the div before it inserts
 * the frame, so nobody ever sees both.
 */
function quotebot_embed_markup(array $atts): string {
    $code = trim((string) ($atts['code'] ?? ''));
    if ($code === '') {
        $code = quotebot_embed_default_code();
    }
    if ($code === '') {
        /*
         * Nothing on the page, and nothing shouted at a visitor. An
         * administrator looking at their own site gets told; everybody
         * else gets no empty box where a form should be.
         */
        if (current_user_can('manage_options')) {
            return '<p>' . esc_html__(
                'Quote Bot: no partner code is set. Add yours under Settings → Quote Bot.',
                'quotebot-embed'
            ) . '</p>';
        }
        return '';
    }

    $hosted = add_query_arg('qb', rawurlencode($code), QUOTEBOT_EMBED_HOSTED);

    $data = array(
        'data-quotebot-embed' => '',
        'data-code'           => $code,
    );
    foreach (array('open' => 'data-open', 'target' => 'data-target', 'title' => 'data-title') as $att => $name) {
        $said = trim((string) ($atts[$att] ?? ''));
        if ($said !== '') {
            $data[$name] = $said;
        }
    }

    $attributes = '';
    foreach ($data as $name => $value) {
        $attributes .= ' ' . esc_attr($name) . '="' . esc_attr($value) . '"';
    }

    $label = trim((string) ($atts['label'] ?? ''));
    if ($label === '') {
        $label = __('Get a life insurance quote', 'quotebot-embed');
    }

    wp_enqueue_script(QUOTEBOT_EMBED_HANDLE);

    return '<div class="quotebot-embed"' . $attributes . '>'
        . '<a href="' . esc_url($hosted) . '" rel="noopener">' . esc_html($label) . '</a>'
        . '</div>';
}

/**
 * [quotebot] and [quotebot code="DOE-TERM"].
 *
 * The code is optional because most partners have one, set once in
 * settings. It is accepted per shortcode because some have several -- a
 * code per campaign or per page is exactly what the tracking codes are
 * for, and a partner should not have to choose between this plugin and
 * their own reporting.
 */
function quotebot_embed_shortcode($atts): string {
    $atts = shortcode_atts(
        array('code' => '', 'open' => '', 'target' => '', 'title' => '', 'label' => ''),
        $atts,
        'quotebot'
    );
    return quotebot_embed_markup($atts);
}
add_shortcode('quotebot', 'quotebot_embed_shortcode');

/**
 * The block, which renders through the same function.
 *
 * ONE RENDERER. A block that built its own markup would be a second copy
 * of the fallback link and the escaping, and the copy that gets forgotten
 * is the one nobody is looking at.
 */
function quotebot_embed_register_block(): void {
    if (!function_exists('register_block_type')) {
        return;
    }
    /*
     * FROM block.json, WITH AN EDITOR SCRIPT. Registering a block in PHP
     * alone registers it on the server and nowhere else: it never appears
     * in the inserter, so nobody can add it, and the plugin ships a block
     * that does not exist. The editor half is block/editor.js -- plain
     * JavaScript, no build step, because a toolchain in a plugin this
     * size is a thing to maintain for nobody's benefit.
     */
    register_block_type(
        __DIR__ . '/block',
        array('render_callback' => 'quotebot_embed_markup')
    );
}
add_action('init', 'quotebot_embed_register_block');

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function quotebot_embed_settings_menu(): void {
    add_options_page(
        __('Quote Bot', 'quotebot-embed'),
        __('Quote Bot', 'quotebot-embed'),
        'manage_options',
        'quotebot-embed',
        'quotebot_embed_settings_page'
    );
}
add_action('admin_menu', 'quotebot_embed_settings_menu');

/**
 * A tracking code as we will store it.
 *
 * NOT A VALIDATION OF WHETHER IT IS REAL -- only Quote Bot can say that,
 * and a plugin that refused an unfamiliar code would break every time a
 * new shape of code was issued. This strips what cannot be part of one, so
 * a pasted line with a stray quote or angle bracket cannot become markup
 * on the way back out.
 */
function quotebot_embed_clean_code($raw): string {
    $code = trim((string) $raw);
    $code = preg_replace('/[^A-Za-z0-9._-]/', '', $code);
    return substr((string) $code, 0, 64);
}

function quotebot_embed_settings_init(): void {
    register_setting(
        'quotebot_embed',
        QUOTEBOT_EMBED_OPTION,
        array(
            'type'              => 'string',
            'sanitize_callback' => 'quotebot_embed_clean_code',
            'default'           => '',
        )
    );
}
add_action('admin_init', 'quotebot_embed_settings_init');

function quotebot_embed_settings_page(): void {
    /* Belt and braces: add_options_page already gates on this. */
    if (!current_user_can('manage_options')) {
        return;
    }
    $code = quotebot_embed_default_code();
    ?>
    <div class="wrap">
        <h1><?php echo esc_html__('Quote Bot', 'quotebot-embed'); ?></h1>
        <form action="options.php" method="post">
            <?php settings_fields('quotebot_embed'); ?>
            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row">
                        <label for="quotebot_embed_code">
                            <?php echo esc_html__('Your partner code', 'quotebot-embed'); ?>
                        </label>
                    </th>
                    <td>
                        <input name="<?php echo esc_attr(QUOTEBOT_EMBED_OPTION); ?>"
                               id="quotebot_embed_code" type="text" class="regular-text"
                               value="<?php echo esc_attr($code); ?>">
                        <p class="description">
                            <?php echo esc_html__(
                                'Find this on the Affiliate links screen of your Quote Bot partner portal. Leads from this form are credited to it.',
                                'quotebot-embed'
                            ); ?>
                        </p>
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>

        <h2><?php echo esc_html__('Putting the form on a page', 'quotebot-embed'); ?></h2>
        <p><?php echo esc_html__('Add the Quote Bot block, or paste this shortcode:', 'quotebot-embed'); ?></p>
        <p><code>[quotebot]</code></p>
        <p><?php echo esc_html__(
            'To open the form over the page from a button you already have, give that button a class and name it:',
            'quotebot-embed'
        ); ?></p>
        <p><code>[quotebot open=".my-quote-button"]</code></p>

        <h2><?php echo esc_html__('Before it will appear', 'quotebot-embed'); ?></h2>
        <p><?php
            printf(
                /* translators: %s: the site's own address. */
                esc_html__(
                    'Register %s in your Quote Bot partner portal. The form only draws on websites you have registered, so that nobody else can put your form -- and your tracking code -- on a site of theirs.',
                    'quotebot-embed'
                ),
                '<code>' . esc_html(wp_parse_url(home_url(), PHP_URL_SCHEME) . '://' . wp_parse_url(home_url(), PHP_URL_HOST)) . '</code>'
            );
        ?></p>
    </div>
    <?php
}
