export type ContentType = "article" | "newsletter" | "social_post";
export type PropertySurface = "website" | "social";

export function propertySurfaceForSlug(propertySlug: string): PropertySurface {
  return propertySlug === "herzenco-social" ? "social" : "website";
}

export function defaultContentTypeForProperty(property: {
  surface: PropertySurface;
}): ContentType {
  return property.surface === "social" ? "social_post" : "article";
}

export function isContentTypeAllowedForProperty(
  property: { surface: PropertySurface },
  contentType: ContentType,
) {
  return property.surface === "social"
    ? contentType === "social_post"
    : contentType === "article" || contentType === "newsletter";
}

export function normalizeContentTypeForProperty(
  property: { surface: PropertySurface },
  requestedType: ContentType,
): ContentType {
  return isContentTypeAllowedForProperty(property, requestedType)
    ? requestedType
    : defaultContentTypeForProperty(property);
}
