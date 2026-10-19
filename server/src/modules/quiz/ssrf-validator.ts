import dns from 'dns/promises';
import { URL } from 'url';
import net from 'net';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../config/logger.js';
import { mediaService } from '../media/media.service.js';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Checks whether an IPv4 or IPv6 address belongs to private, loopback, link-local,
 * carrier-grade NAT, or multicast ranges.
 */
export function isPrivateOrRestrictedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    // 0.0.0.0/8 (Broadcast/Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (RFC 1918 Private)
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (Shared / Carrier-Grade NAT RFC 6598)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-Local / Cloud Instance Metadata e.g. 169.254.169.254)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (RFC 1918 Private: 172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.0.0.0/24 & 192.0.2.0/24 (TEST-NET-1)
    if (parts[0] === 192 && parts[1] === 0) return true;
    // 192.168.0.0/16 (RFC 1918 Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 198.51.100.0/24 & 203.0.113.0/24 (Documentation)
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;
    return false;
  }

  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // Loopback ::1
    if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    // Unspecified ::
    if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') return true;
    // Unique Local fc00::/7 (fc.. or fd..)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-Local fe80::/10 (fe8, fe9, fea, feb)
    if (/^fe[89ab]/i.test(lower)) return true;
    // Multicast ff00::/8
    if (lower.startsWith('ff')) return true;
    // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1 or ::ffff:127.0.0.1)
    if (lower.includes('::ffff:')) {
      const v4Part = lower.split('::ffff:')[1];
      if (v4Part && net.isIPv4(v4Part)) {
        return isPrivateOrRestrictedIp(v4Part);
      }
    }
    return false;
  }

  // Non-standard address
  return true;
}

/**
 * Validates magic bytes of an image buffer to ensure format authenticity.
 */
export function validateImageMagicBytes(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (buffer.length < 12) {
    throw new ApiError(400, 'Invalid image file: Image header is too short.');
  }

  // JPEG: 0xFF, 0xD8, 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 0x89, 0x50, 0x4E, 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // GIF: 'GIF87a' or 'GIF89a'
  const gifHeader = buffer.toString('ascii', 0, 6);
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return 'image/gif';
  }

  throw new ApiError(400, 'Invalid image format: Must be authentic JPEG, PNG, or WebP image data.');
}

/**
 * Extracts width and height from standard image headers without native dependencies.
 */
export function getImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;

  try {
    // PNG: bytes 16-24 hold 32-bit big-endian width and height
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // GIF: bytes 6-10 hold 16-bit little-endian width and height
    const gifHeader = buffer.toString('ascii', 0, 6);
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    // JPEG: Scan segments for Start Of Frame (SOF)
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        // SOF markers: 0xC0 through 0xC3, 0xC5 through 0xC7, 0xC9 through 0xCB, 0xCD through 0xCF
        const isSof =
          (marker >= 0xc0 && marker <= 0xc3) ||
          (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) ||
          (marker >= 0xcd && marker <= 0xcf);

        if (isSof) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    // WebP:
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const chunkType = buffer.toString('ascii', 12, 16);
      if (chunkType === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
      if (chunkType === 'VP8L' && buffer.length >= 25) {
        const b1 = buffer[21],
          b2 = buffer[22],
          b3 = buffer[23],
          b4 = buffer[24];
        const width = 1 + (((b2 & 0x3f) << 8) | b1);
        const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
        return { width, height };
      }
    }
  } catch {
    // Non-fatal if header parsing encounters unconventional metadata
    return null;
  }

  return null;
}

/**
 * Validates dimensions against strict limits (16x16 to 4096x4096)
 */
export function validateImageDimensions(buffer: Buffer): { width?: number; height?: number } {
  const dimensions = getImageDimensions(buffer);
  if (!dimensions) return {};

  if (
    dimensions.width > 4096 ||
    dimensions.height > 4096 ||
    dimensions.width < 16 ||
    dimensions.height < 16
  ) {
    throw new ApiError(
      400,
      `Image dimensions (${dimensions.width}x${dimensions.height}px) exceed acceptable bounds (16x16 to 4096x4096px).`
    );
  }

  return dimensions;
}

/**
 * Validates a target URL against SSRF rules:
 * 1. Must be https:
 * 2. Standard HTTPS port only (443 / 8443)
 * 3. No credentials
 * 4. Resolves DNS and verifies all target IPs are public
 */
export async function validateSafeHttpsUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ApiError(400, 'Invalid image URL provided.');
  }

  if (parsed.protocol !== 'https:') {
    throw new ApiError(400, 'Insecure protocol: Image URL must use secure HTTPS.');
  }

  // Restrict allowed ports to standard HTTPS (443, 8443)
  if (parsed.port && parsed.port !== '443' && parsed.port !== '8443') {
    throw new ApiError(400, 'Security violation: Only standard HTTPS ports (443) are permitted.');
  }

  if (parsed.username || parsed.password) {
    throw new ApiError(400, 'Security violation: Image URLs with embedded credentials are not permitted.');
  }

  const hostname = parsed.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new ApiError(400, 'Security violation: Access to local domains is forbidden.');
  }

  // Direct IP in URL check
  if (net.isIP(hostname)) {
    if (isPrivateOrRestrictedIp(hostname)) {
      throw new ApiError(400, 'Security violation: Access to private or internal network addresses is forbidden.');
    }
  }

  // DNS lookup to verify resolved IP addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new ApiError(400, 'Image URL domain could not be resolved.');
    }

    for (const record of addresses) {
      if (isPrivateOrRestrictedIp(record.address)) {
        logger.warn({ hostname, address: record.address }, 'SSRF attempt blocked: Resolved to restricted IP');
        throw new ApiError(400, 'Security violation: Target host resolves to a private or restricted network address.');
      }
    }
  } catch (err: any) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, `Failed to resolve image URL domain: ${err.message || 'DNS lookup failed'}`);
  }

  return parsed;
}

/**
 * Safely downloads an image from an external HTTPS URL with SSRF protection,
 * redirect restrictions (max 2 redirects), size limits (5MB), and content verification.
 * Then uploads the image to Cloudinary to guarantee durable CDN serving.
 */
export async function downloadAndUploadUrlImage(
  targetUrl: string,
  quizTopic: string
): Promise<{ url: string; source: 'url'; metadata: Record<string, any> }> {
  let currentUrl = targetUrl;
  let redirectsFollowed = 0;
  const maxRedirects = 2;

  while (redirectsFollowed <= maxRedirects) {
    const validatedUrl = await validateSafeHttpsUrl(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    let response: Response;
    try {
      response = await fetch(validatedUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Quizzy-Image-Validator/1.0',
          Accept: 'image/jpeg,image/png,image/webp,image/gif;q=0.9,*/*;q=0.5',
        },
        redirect: 'manual', // Manual redirect control to prevent SSRF redirect bypass
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        throw new ApiError(408, 'Image download timed out.');
      }
      throw new ApiError(400, `Failed to fetch image from URL: ${fetchErr.message || 'Network error'}`);
    } finally {
      clearTimeout(timeout);
    }

    // Handle redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectsFollowed++;
      if (redirectsFollowed > maxRedirects) {
        throw new ApiError(400, 'Too many redirects encountered while fetching image.');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new ApiError(400, 'Redirect response missing location header.');
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new ApiError(
        400,
        `Image download failed with status ${response.status} (${response.statusText}).`
      );
    }

    // Validate Content-Type
    const contentTypeHeader = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_MIME_TYPES.has(contentTypeHeader)) {
      throw new ApiError(
        400,
        `Unsupported content type (${contentTypeHeader || 'unknown'}). Must be JPEG, PNG, or WebP.`
      );
    }

    // Validate Content-Length if present
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      throw new ApiError(400, 'Image file exceeds maximum allowable size of 5MB.');
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length < 24) {
      throw new ApiError(400, 'Invalid image file: Image payload is corrupted or empty.');
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new ApiError(400, 'Image file exceeds maximum allowable size of 5MB.');
    }

    const detectedMime = validateImageMagicBytes(buffer);
    const dimensions = validateImageDimensions(buffer);

    // Upload to Cloudinary to store permanently
    const slug = quizTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    const uploadRes = await mediaService.uploadImageWithMetadata(buffer, {
      folder: 'quizzy/thumbnails/urls',
      publicId: `url-${slug}-${Date.now()}`,
    });

    return {
      url: uploadRes.url,
      source: 'url',
      metadata: {
        originalUrl: targetUrl,
        mimeType: detectedMime,
        sizeBytes: buffer.length,
        width: dimensions.width,
        height: dimensions.height,
        publicId: uploadRes.publicId,
        uploadedAt: uploadRes.uploadedAt,
      },
    };
  }

  throw new ApiError(400, 'Failed to complete image download.');
}

/**
 * Validates and uploads an uploaded image buffer or base64 string to Cloudinary.
 */
export async function processAndUploadImageFile(
  base64Data: string,
  mimeType: string,
  quizTopic: string
): Promise<{ url: string; source: 'upload'; metadata: Record<string, any> }> {
  if (!base64Data) {
    throw new ApiError(400, 'No image data provided for upload.');
  }

  // Strip data:image/...;base64, prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length < 24) {
    throw new ApiError(400, 'Invalid image file: Image payload is corrupted or empty.');
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new ApiError(400, 'Uploaded image exceeds maximum allowable size of 5MB.');
  }

  const detectedMime = validateImageMagicBytes(buffer);
  const dimensions = validateImageDimensions(buffer);

  const slug = quizTopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const uploadRes = await mediaService.uploadImageWithMetadata(buffer, {
    folder: 'quizzy/thumbnails/uploads',
    publicId: `upload-${slug}-${Date.now()}`,
  });

  return {
    url: uploadRes.url,
    source: 'upload',
    metadata: {
      mimeType: detectedMime,
      sizeBytes: buffer.length,
      width: dimensions.width,
      height: dimensions.height,
      publicId: uploadRes.publicId,
      uploadedAt: uploadRes.uploadedAt,
    },
  };
}
