type OpenApiPaths = Record<string, unknown>;

/**
 * Resolve a concrete request path to its OpenAPI template. Exact static paths
 * must win over parameterized siblings such as `/reorder` and `/{id}`.
 */
export function operationTemplateFor(
  path: string,
  paths: OpenApiPaths,
): string | undefined {
  const pathname = path.split('?', 1)[0];
  if (pathname in paths) return pathname;

  const segments = pathname.split('/');
  const candidates = Object.keys(paths).filter((template) => {
    const templateSegments = template.split('/');
    return (
      templateSegments.length === segments.length &&
      templateSegments.every(
        (segment, index) =>
          (segment.startsWith('{') && segment.endsWith('}')) ||
          segment === segments[index],
      )
    );
  });
  return candidates.sort((left, right) => {
    const staticSegments = (template: string) =>
      template
        .split('/')
        .filter(
          (segment) =>
            !(segment.startsWith('{') && segment.endsWith('}')),
        ).length;
    return staticSegments(right) - staticSegments(left);
  })[0];
}
