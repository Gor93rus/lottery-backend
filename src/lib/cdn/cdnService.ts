/**
 * CDN service for asset management and optimization
 */
export class CdnService {
  private cdnUrl: string;
  private originUrl: string;
  private cacheBuster: string;

  constructor() {
    this.cdnUrl = process.env.CDN_URL || "";
    this.originUrl = process.env.ORIGIN_URL || "";
    this.cacheBuster =
      process.env.NODE_ENV === "production"
        ? process.env.APP_VERSION || Date.now().toString()
        : "dev";
  }

  /**
   * Get CDN URL for an asset
   */
  getAssetUrl(
    path: string,
    options: {
      cacheBust?: boolean;
      version?: string;
    } = {},
  ): string {
    const { cacheBust = true, version } = options;

    // If no CDN configured, return origin URL
    if (!this.cdnUrl) {
      return `${this.originUrl}${path}`;
    }

    // Add cache busting parameter
    let url = `${this.cdnUrl}${path}`;

    if (cacheBust) {
      const versionParam = version || this.cacheBuster;
      const separator = url.includes("?") ? "&" : "?";
      url = `${url}${separator}v=${versionParam}`;
    }

    return url;
  }

  /**
   * Purge cache for specific paths
   */
  async purgeCache(paths: string[]): Promise<void> {
    if (!this.cdnUrl || !process.env.CDN_API_KEY) {
      console.warn("⚠️  CDN not configured, skipping cache purge");
      return;
    }

    try {
      // This is a generic implementation
      // Adjust based on your CDN provider (Cloudflare, CloudFront, etc.)
      const response = await fetch(`${this.cdnUrl}/purge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CDN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: paths }),
      });

      if (!response.ok) {
        throw new Error(`CDN purge failed: ${response.statusText}`);
      }

      console.log(`✅ Purged ${paths.length} files from CDN cache`);
    } catch (error) {
      console.error("❌ CDN purge error:", error);
      throw error;
    }
  }

  /**
   * Upload asset to CDN
   */
  async uploadAsset(
    filePath: string,
    content: Buffer,
    options: {
      contentType?: string;
      cacheControl?: string;
    } = {},
  ): Promise<string> {
    if (!this.cdnUrl || !process.env.CDN_API_KEY) {
      console.warn("⚠️  CDN not configured, asset not uploaded");
      return filePath;
    }

    const {
      contentType = "application/octet-stream",
      cacheControl = "public, max-age=31536000, immutable",
    } = options;

    try {
      // Generic upload implementation
      // Adjust based on your CDN provider
      const response = await fetch(`${this.cdnUrl}/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CDN_API_KEY}`,
          "Content-Type": contentType,
          "Cache-Control": cacheControl,
          "X-File-Path": filePath,
        },
        // Buffer can be used as body in Node.js fetch
        body: content as unknown as BodyInit,
      });

      if (!response.ok) {
        throw new Error(`CDN upload failed: ${response.statusText}`);
      }

      const result = (await response.json()) as { url: string };
      console.log(`✅ Uploaded asset to CDN: ${filePath}`);
      return result.url;
    } catch (error) {
      console.error("❌ CDN upload error:", error);
      throw error;
    }
  }

  /**
   * Get CDN statistics
   */
  async getStats(): Promise<{
    bandwidth: number;
    requests: number;
    cacheHitRatio: number;
  } | null> {
    if (!this.cdnUrl || !process.env.CDN_API_KEY) {
      return null;
    }

    try {
      const response = await fetch(`${this.cdnUrl}/stats`, {
        headers: {
          Authorization: `Bearer ${process.env.CDN_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`CDN stats failed: ${response.statusText}`);
      }

      return (await response.json()) as {
        bandwidth: number;
        requests: number;
        cacheHitRatio: number;
      };
    } catch (error) {
      console.error("❌ CDN stats error:", error);
      return null;
    }
  }

  /**
   * Check if CDN is configured
   */
  isConfigured(): boolean {
    return Boolean(this.cdnUrl && process.env.CDN_API_KEY);
  }

  /**
   * Invalidate all cache
   */
  async invalidateAll(): Promise<void> {
    if (!this.cdnUrl || !process.env.CDN_API_KEY) {
      console.warn("⚠️  CDN not configured, skipping cache invalidation");
      return;
    }

    try {
      const response = await fetch(`${this.cdnUrl}/purge/all`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CDN_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error(`CDN invalidation failed: ${response.statusText}`);
      }

      console.log("✅ Invalidated all CDN cache");
    } catch (error) {
      console.error("❌ CDN invalidation error:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const cdnService = new CdnService();
