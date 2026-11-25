import { definePlugin, defineRule, type ESTree } from 'vite-plus/lint/plugins';

const TRANSITION_ALL = /\btransition-all\b/;

const noTransitionAll = defineRule({
  meta: {
    type: 'problem',
    messages: {
      transitionAll:
        'transition-all also animates the focus outline. Name the properties instead, e.g. transition-[color,background-color,scale].',
    },
  },
  create(context) {
    return {
      Literal(node) {
        if (typeof node.value === 'string' && TRANSITION_ALL.test(node.value)) {
          context.report({ node, messageId: 'transitionAll' });
        }
      },
      TemplateElement(node) {
        if (node.value.cooked && TRANSITION_ALL.test(node.value.cooked)) {
          context.report({ node, messageId: 'transitionAll' });
        }
      },
    };
  },
});

const noBareEscape = defineRule({
  meta: {
    type: 'problem',
    messages: {
      bareEscape:
        'Register the overlay with useEscapeLayer, so one Escape closes only the top layer.',
    },
  },
  create(context) {
    const reportEscape = (node: ESTree.BinaryExpression['left']) => {
      if (node.type === 'Literal' && node.value === 'Escape') {
        context.report({ node, messageId: 'bareEscape' });
      }
    };
    return {
      BinaryExpression(node) {
        reportEscape(node.left);
        reportEscape(node.right);
      },
      SwitchCase(node) {
        if (node.test) reportEscape(node.test);
      },
    };
  },
});

export default definePlugin({
  meta: { name: 'sounds-abroad' },
  rules: {
    'no-transition-all': noTransitionAll,
    'no-bare-escape': noBareEscape,
  },
});
