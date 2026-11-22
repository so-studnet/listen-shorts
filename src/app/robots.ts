import type { MetadataRoute } from "next";

/** 個人用のアプリなので、検索エンジンには載せない。 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
