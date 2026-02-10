import { cdnService } from "../lib/cdn/cdnService.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Asset service for managing static assets
 */
export class AssetService {
  private assetDir: string;

  constructor(assetDir = "public") {
    this.assetDir = assetDir;
  }

  /**
   * Upload an asset to CDN
   */
  async uploadToCdn(
    localPath: string,
    remotePath: string,
    options?: {
      contentType?: string;
      cacheControl?: string;
    },
  ): Promise<string> {
    try {
      // Read file from local path
      const content = await fs.readFile(localPath);

      // Determine content type from file extension if not provided
      const contentType =
        options?.contentType || this.getContentType(localPath);

      // Upload to CDN
      return await cdnService.uploadAsset(remotePath, content, {
        contentType,
        cacheControl: options?.cacheControl,
      });
    } catch (error) {
      console.error(`Failed to upload asset ${localPath}:`, error);
      throw error;
    }
  }

  /**
   * Upload multiple assets to CDN
   */
  async uploadMultiple(
    assets: Array<{ local: string; remote: string }>,
  ): Promise<string[]> {
    const uploads = assets.map(({ local, remote }) =>
      this.uploadToCdn(local, remote),
    );

    return Promise.all(uploads);
  }

  /**
   * Get asset URL (from CDN if configured, otherwise local)
   */
  getAssetUrl(assetPath: string): string {
    return cdnService.getAssetUrl(assetPath);
  }

  /**
   * Purge asset cache
   */
  async purgeAssets(paths: string[]): Promise<void> {
    return cdnService.purgeCache(paths);
  }

  /**
   * Determine content type from file extension
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    const contentTypes: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
      ".otf": "font/otf",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".pdf": "application/pdf",
    };

    return contentTypes[ext] || "application/octet-stream";
  }

  /**
   * Optimize image (placeholder - would use sharp or similar)
   */
  async optimizeImage(
    inputPath: string,
    outputPath: string,
    _options: {
      width?: number;
      height?: number;
      quality?: number;
    } = {},
  ): Promise<void> {
    // This is a placeholder
    // In production, you'd use a library like sharp:
    // const sharp = require('sharp');
    // await sharp(inputPath)
    //   .resize(options.width, options.height)
    //   .jpeg({ quality: options.quality || 80 })
    //   .toFile(outputPath);

    console.log(
      `Image optimization not implemented. Would optimize ${inputPath} to ${outputPath}`,
    );
  }

  /**
   * Generate multiple image sizes (responsive images)
   */
  async generateResponsiveImages(
    inputPath: string,
    sizes: Array<{ width: number; suffix: string }>,
  ): Promise<string[]> {
    const results: string[] = [];

    for (const { width, suffix } of sizes) {
      const ext = path.extname(inputPath);
      const base = inputPath.slice(0, -ext.length);
      const outputPath = `${base}${suffix}${ext}`;

      await this.optimizeImage(inputPath, outputPath, { width });
      results.push(outputPath);
    }

    return results;
  }
}

// Export singleton instance
export const assetService = new AssetService();
