"use client";

import { useEffect } from "react";

type MetricsBeaconProps = {
  engineUrl: string;
  propertySlug: string;
  slug: string;
};

export function MetricsBeacon({
  engineUrl,
  propertySlug,
  slug,
}: MetricsBeaconProps) {
  useEffect(() => {
    if (!engineUrl || !propertySlug || !slug) return;

    const endpoint = `${engineUrl.replace(/\/$/, "")}/api/metrics/beacon`;
    const body = JSON.stringify({ propertySlug, slug });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        endpoint,
        new Blob([body], { type: "application/json" }),
      );
      return;
    }

    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }, [engineUrl, propertySlug, slug]);

  return null;
}
