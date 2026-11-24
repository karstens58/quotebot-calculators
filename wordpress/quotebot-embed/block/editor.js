/*
 * The editor half of the Quote Bot block.
 *
 * NO BUILD STEP AND NO JSX, deliberately. A plugin this small does not
 * earn a toolchain: the whole editor experience is four text fields and a
 * sentence, and createElement by hand is a few more characters than JSX
 * for something nobody has to install node to change.
 *
 * NOTHING IS PREVIEWED. The block draws a placeholder in the editor rather
 * than the real form, because the real form refuses to draw anywhere the
 * partner has not registered -- and an editor screen is served from
 * wp-admin, which is not a website anybody registers. A live preview would
 * therefore show every author a refusal box and teach them the plugin is
 * broken.
 */
(function (blocks, element, components, blockEditor, i18n) {
  'use strict';

  var el = element.createElement;
  var __ = i18n.__;

  function field(label, help, value, onChange) {
    return el(components.TextControl, {
      label: label,
      help: help,
      value: value || '',
      onChange: onChange,
      __nextHasNoMarginBottom: true,
    });
  }

  /*
   * WHERE THE VISITOR REACHES THE FORM FROM -- QBP-637.
   *
   * The same three the portal offers, in the same words, because a
   * partner reads the portal's Marketing screen and then comes here. The
   * page is the empty value: it is what the loader does with no
   * attribute, so choosing it writes nothing.
   */
  var PLACEMENTS = [
    { value: '', label: __('On the page', 'quotebot-embed') },
    { value: 'bar', label: __('A bar', 'quotebot-embed') },
    { value: 'button', label: __('From your own button', 'quotebot-embed') },
  ];

  var ABOUT = {
    '': __('The form sits where you put this block. In a narrow column it opens over the page instead.', 'quotebot-embed'),
    bar: __('A strip for a header or footer: one line and a button. The form opens over the page.', 'quotebot-embed'),
    button: __('Nothing sits in the page. A button of yours opens the form.', 'quotebot-embed'),
  };

  blocks.registerBlockType('quotebot/embed', {
    edit: function (props) {
      var atts = props.attributes;
      var set = function (key) {
        return function (value) {
          var patch = {};
          patch[key] = value;
          props.setAttributes(patch);
        };
      };

      return el(
        element.Fragment,
        null,
        el(
          blockEditor.InspectorControls,
          null,
          el(
            components.PanelBody,
            { title: __('Quote form', 'quotebot-embed'), initialOpen: true },
            field(
              __('Partner code', 'quotebot-embed'),
              __('Leave empty to use the code saved under Settings, Quote Bot.', 'quotebot-embed'),
              atts.code, set('code')
            ),
            el(components.SelectControl, {
              label: __('Where it is reached from', 'quotebot-embed'),
              help: ABOUT[atts.placement || ''],
              value: atts.placement || '',
              options: PLACEMENTS,
              onChange: set('placement'),
              __nextHasNoMarginBottom: true,
            }),
            /*
             * Only with the button, because it means nothing otherwise --
             * and left empty it is the class the portal hands out, which
             * is what most partners will have put on their button.
             */
            (atts.placement === 'button' || atts.open)
              ? field(
                __('Your button', 'quotebot-embed'),
                __('Leave empty to use the class qb-quote, which is the one your Quote Bot portal gives you. Or name your own, such as .my-quote-button.', 'quotebot-embed'),
                atts.open, set('open')
              )
              : null,
            field(
              __('Link text', 'quotebot-embed'),
              __('Shown to anyone whose browser does not run the form.', 'quotebot-embed'),
              atts.label, set('label')
            )
          )
        ),
        el(
          'div',
          blockEditor.useBlockProps({ className: 'quotebot-embed-placeholder' }),
          el(
            components.Placeholder,
            {
              icon: 'shield',
              label: __('Quote Bot quote form', 'quotebot-embed'),
              instructions: (atts.placement === 'button' || atts.open)
                ? __('Opens over the page when a visitor clicks your button. Nothing is drawn here.', 'quotebot-embed')
                : __('The form appears here when somebody views this page. It is not shown while editing, because the editor is not one of the websites you registered.', 'quotebot-embed'),
            },
            atts.code
              ? el('p', null, __('Code: ', 'quotebot-embed') + atts.code)
              : null
          )
        )
      );
    },
    /* Server-rendered: the markup comes from quotebot_embed_markup in PHP,
       so there is one renderer and one copy of the fallback link. */
    save: function () { return null; },
  });
}(
  window.wp.blocks,
  window.wp.element,
  window.wp.components,
  window.wp.blockEditor,
  window.wp.i18n
));
