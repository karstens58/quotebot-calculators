/*
 * Page configuration that used to be an inline <script> on six pages.
 *
 * It was the same one line on every one of them, which is six places for it
 * to drift and six inline scripts standing between this site and a
 * Content-Security-Policy that does not allow 'unsafe-inline'. Both problems
 * have the same answer: say it once, in a file.
 *
 * The same reasoning as SITE_URL in tools/apply-chrome.mjs, which says it
 * better: a host typed into thirteen pages is thirteen places to miss.
 */
window.QB_QUOTE_ENDPOINT = 'https://api.quote-bot.com/quote/';
