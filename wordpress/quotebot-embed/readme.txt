=== Quote Bot embedded quote form ===
Contributors: quotebot
Tags: insurance, quotes, life insurance, embed
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.1.0
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
3. Register your website's address in that same portal, under Marketing,
   then Quote form on your site. The form only appears on sites you have
   registered, so nobody else can put your form — and your tracking code —
   on a site of theirs.
4. Add the "Quote Bot quote form" block to a page, or use the shortcode
   `[quotebot]`.

== Frequently Asked Questions ==

= The form says this site is not registered =

Add this site's address in your Quote Bot partner portal, under Marketing,
then Quote form on your site. It takes effect immediately.

= Where can the form appear? =

Three places, and all three ask the same questions and credit the same
code. What changes is where a visitor starts.

* On the page — the form sits where you put the block. In a narrow column
  it opens over the page instead, so it is never squeezed.
* A bar — a strip for a header or footer: one line and a button.
  `[quotebot placement="bar"]`
* From your own button — nothing sits in the page at all.
  `[quotebot placement="button"]`

In the block editor this is the "Where it is reached from" setting.

= Can I open it from a button I already have? =

Yes. Give your button the class `qb-quote` — every page builder has a
field for it, and in WordPress it is "Advanced", then "Additional CSS
class(es)" on the button. Then:

`[quotebot placement="button"]`

Nothing sits in the page until somebody clicks, and the form opens over
your site. If your button already has a class of its own, name that
instead and you need not add ours:

`[quotebot placement="button" open=".my-quote-button"]`

= I have more than one tracking code =

Pass the one you want per page: `[quotebot code="SPRING-CAMPAIGN"]`. The
code in Settings is only the default.

= What do visitors see if JavaScript is off? =

A plain link to your co-branded quote page, carrying your tracking code. It
is inside the block, and the plugin removes it only once the form has
loaded.

== Changelog ==

= 1.1.0 =
* Choose where the form is reached from: on the page, a bar, or your own
  button. Previously only the page and a named button were possible.
* A button with no selector now uses the class `qb-quote`, which is the
  one the partner portal hands out.

= 1.0.0 =
* First release: block, shortcode, and settings.
