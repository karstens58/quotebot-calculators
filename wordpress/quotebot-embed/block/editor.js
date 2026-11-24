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
            field(
              __('Open from a button', 'quotebot-embed'),
              __('A CSS selector for a button you already have, such as .my-quote-button. The form then opens over the page instead of sitting in it.', 'quotebot-embed'),
              atts.open, set('open')
            ),
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
              instructions: atts.open
                ? __('Opens over the page when a visitor clicks your button.', 'quotebot-embed')
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
