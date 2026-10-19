import type { MetadataRoute } from "next";
import { siteConfig, VERIFIED_CATEGORIES, getAbsoluteUrl } from "@/lib/site-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // Root Homepage
  const sitemapEntries: MetadataRoute.Sitemap = [
    {
      url: getAbsoluteUrl("/"),
      lastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: getAbsoluteUrl("/categories"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: getAbsoluteUrl("/create"),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...Object.keys(VERIFIED_CATEGORIES).map((slug) => ({
      url: getAbsoluteUrl(`/categories/${slug}`),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

  return sitemapEntries;
}
