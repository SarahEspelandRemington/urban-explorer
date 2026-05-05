/**
 * ESLint rule: no-pii-in-sentry
 *
 * Warns when a template literal in the **message-position argument** of a
 * Sentry wrapper function (captureException, captureMessage,
 * addWalkBreadcrumb) interpolates an expression that accesses a known PII
 * field — e.g.
 *
 *   captureMessage(`Failed to load narration for ${place.name}`)
 *                                                        ^^^^  ← flagged
 *
 * scrubString() in lib/sentry.ts only catches *structured* patterns like
 * "name: Eiffel Tower"; raw interpolations bypass it entirely.  This rule
 * catches the problem at authoring time, before it reaches the runtime.
 *
 * Scope: only the first argument is checked for each call:
 *   captureMessage(message, level?)        → arg[0]
 *   addWalkBreadcrumb(message, data?, …)   → arg[0]
 *   captureException(err, ctx?)            → arg[0]  (recurses into new Error(…))
 *
 * Later arguments (context objects, severity levels) are intentionally
 * excluded — scrubObject() in beforeSend already handles structured PII
 * in those positions.
 */

const PII_FIELDS = [
  "lat",
  "lon",
  "lng",
  "coord",
  "location",
  "place",
  "address",
  "destination",
  "origin",
  "route",
  "street",
  "city",
  "geo",
  "name",
  "summary",
  "narration",
  "altitude",
  "heading",
  "speed",
];

const SENTRY_FUNCTIONS = new Set([
  "captureException",
  "captureMessage",
  "addWalkBreadcrumb",
]);

function isPiiName(name) {
  if (/(?:Id|Count)$/i.test(name)) return false;
  const lk = name.toLowerCase();
  return PII_FIELDS.some((p) => lk.includes(p));
}

function getCalleeName(calleeNode) {
  if (calleeNode.type === "Identifier") return calleeNode.name;
  if (
    calleeNode.type === "MemberExpression" &&
    calleeNode.property.type === "Identifier"
  ) {
    return calleeNode.property.name;
  }
  return null;
}

function collectTemplateLiterals(node, results = []) {
  if (!node || typeof node !== "object") return results;
  if (node.type === "TemplateLiteral") {
    results.push(node);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === "string") {
          collectTemplateLiterals(item, results);
        }
      }
    } else if (child && typeof child.type === "string") {
      collectTemplateLiterals(child, results);
    }
  }
  return results;
}

function findPiiExpressions(exprNode) {
  if (!exprNode) return [];
  const hits = [];

  switch (exprNode.type) {
    case "MemberExpression": {
      const prop = exprNode.property;
      const propName =
        prop.type === "Identifier"
          ? prop.name
          : prop.type === "Literal"
            ? String(prop.value)
            : null;
      if (propName !== null) {
        if (isPiiName(propName)) {
          hits.push({ node: exprNode, field: propName });
        }
        // Property name is known and safe — the object reference is not
        // being embedded as a string value, so do not recurse further.
      } else {
        // Computed property with a dynamic key; recurse into both sides.
        hits.push(...findPiiExpressions(exprNode.object));
        hits.push(...findPiiExpressions(prop));
      }
      break;
    }
    case "Identifier": {
      if (isPiiName(exprNode.name)) {
        hits.push({ node: exprNode, field: exprNode.name });
      }
      break;
    }
    case "CallExpression": {
      for (const arg of exprNode.arguments) {
        hits.push(...findPiiExpressions(arg));
      }
      hits.push(...findPiiExpressions(exprNode.callee));
      break;
    }
    case "ConditionalExpression": {
      hits.push(...findPiiExpressions(exprNode.consequent));
      hits.push(...findPiiExpressions(exprNode.alternate));
      break;
    }
    case "LogicalExpression":
    case "BinaryExpression": {
      hits.push(...findPiiExpressions(exprNode.left));
      hits.push(...findPiiExpressions(exprNode.right));
      break;
    }
    case "TemplateLiteral": {
      for (const expr of exprNode.expressions) {
        hits.push(...findPiiExpressions(expr));
      }
      break;
    }
    default:
      break;
  }

  return hits;
}

export const noPiiInSentry = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Warn when a PII field is interpolated into a Sentry wrapper call's message argument",
    },
    messages: {
      piiInterpolation:
        "PII field '{{field}}' interpolated into a Sentry call. " +
        "Use only opaque IDs or counts; scrubString() cannot redact raw interpolations.",
    },
    schema: [],
  },

  create(context) {
    return {
      CallExpression(node) {
        const calleeName = getCalleeName(node.callee);
        if (!calleeName || !SENTRY_FUNCTIONS.has(calleeName)) return;
        if (node.arguments.length === 0) return;

        const templates = collectTemplateLiterals(node.arguments[0]);

        for (const tmpl of templates) {
          for (const expr of tmpl.expressions) {
            const hits = findPiiExpressions(expr);
            for (const { node: hitNode, field } of hits) {
              context.report({
                node: hitNode,
                messageId: "piiInterpolation",
                data: { field },
              });
            }
          }
        }
      },
    };
  },
};

export const plugin = {
  rules: {
    "no-pii-in-sentry": noPiiInSentry,
  },
};

export default plugin;
