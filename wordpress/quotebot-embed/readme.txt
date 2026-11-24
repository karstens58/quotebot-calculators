=== Quote Bot embedded quote form ===
Contributors: quotebot
Tags: insurance, quotes, life insurance, embed
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Put your co-branded Quote Bot life insurance quote form on your own site.

== Description ==

Adds a block and a shortcode that place your Quote Bot quote form on any
page of your website. Visitors compare real rates from top-rated carriers
without leaving your site, and every lead is credited to your partner code.

The form itself runs on tools.quote-bot.com inside a frame. That is
deliberate: what a visitor types — their date of birth, their contact
details — never passes through your site's pages, so no theme, plugin or
analytics tag on your site can read it.

This plugin collects nothing, stores nothing about your visitors, and
contacts nothing but the Quote Bot script it loads.

== Installation ==

1. Install and activate the plugin.
2. Go to Settings, then Quote Bot, and enter your partner code. You will
   find it on the Affiliate links screen of your Quote Bot partner portal.
3. Register your website's address in that same portal. The form only
   appears on sites you have registered, so nobody else can put your form —
   and your tracking code — on a site of theirs.
4. Add the "Quote Bot quote form" block to a page, or use the shortcode
   `[quotebot]`.

== Frequently Asked Questions ==

= The form says this site is not registered =

Add this site's address in your Quote Bot partner portal, under Affiliate
links. It takes effect immediately.

= Can I open it from a button I already have? =

Yes. Give your button a class and name it:

`[quotebot open=".my-quote-button"]`

Nothing then sits in the page until somebody clicks, and the form opens
over your site.

= I have more than one tracking code =

Pass the one you want per page: `[quotebot code="SPRING-CAMPAIGN"]`. The
code in Settings is only the default.

= What do visitors see if JavaScript is off? =

A plain link to your co-branded quote page, carrying your tracking code. It
is inside the block, and the plugin removes it only once the form has
loaded.

== Changelog ==

= 1.0.0 =
* First release: block, shortcode, and settings.
