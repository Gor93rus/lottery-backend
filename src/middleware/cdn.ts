import { Request, Response, NextFunction } from "express";
import { cdnService } from "../lib/cdn/cdnService.js";

/**
 * Middleware to add CDN headers for static assets
 */
export const cdnHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Set cache control headers for static assets
  if (req.path.match(/\.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg)$/)) {
    // Cache static assets for 1 year
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // Add CDN headers if configured
    if (cdnService.isConfigured()) {
      res.setHeader("X-CDN-Cache", "HIT");
    }
  }

  next();
};

/**
 * Middleware to transform asset URLs to CDN URLs
 */
export const transformAssetUrls = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!cdnService.isConfigured()) {
    next();
    return;
  }

  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method to transform URLs
  res.json = function (data: unknown) {
    const transformed = transformUrls(data);
    return originalJson(transformed);
  };

  next();
};

/**
 * Recursively transform URLs in data
 */
function transformUrls(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => transformUrls(item));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Transform URL fields
    if (
      typeof value === "string" &&
      (key.toLowerCase().includes("url") ||
        key.toLowerCase().includes("image") ||
        key.toLowerCase().includes("avatar") ||
        key.toLowerCase().includes("thumbnail"))
    ) {
      // Check if it's a relative path
      if (value.startsWith("/")) {
        result[key] = cdnService.getAssetUrl(value);
      } else {
        result[key] = value;
      }
    } else if (typeof value === "object" && value !== null) {
      result[key] = transformUrls(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Helper to get CDN URL for use in responses
 */
export function getCdnUrl(path: string): string {
  return cdnService.getAssetUrl(path);
}
