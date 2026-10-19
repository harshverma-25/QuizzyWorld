import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { buildThumbnailPrompt, ThumbnailPromptContext } from './thumbnail-prompt.builder.js';

export class MediaService {
  private isCloudinaryConfigured: boolean = false;
  private isCloudflareAiConfigured: boolean = false;
  private mockAiGenerator:
    | ((subjectName: string, categoryName?: string, options?: any) => Promise<Buffer>)
    | null = null;
  private mockUploader:
    | ((
        input: string | Buffer,
        options?: any
      ) => Promise<{
        url: string;
        publicId: string;
        format?: string;
        bytes?: number;
        width?: number;
        height?: number;
      }>)
    | null = null;

  constructor() {
    // Configure Cloudinary with explicit credentials or URL
    if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      this.isCloudinaryConfigured = true;
    } else if (env.CLOUDINARY_URL) {
      // Parse cloudinary://key:secret@cloud_name if provided
      try {
        const parsed = new URL(env.CLOUDINARY_URL);
        cloudinary.config({
          cloud_name: parsed.hostname,
          api_key: parsed.username,
          api_secret: parsed.password,
          secure: true,
        });
        this.isCloudinaryConfigured = true;
      } catch {
        cloudinary.config({ secure: true });
        this.isCloudinaryConfigured = true;
      }
    }

    if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_API_TOKEN) {
      this.isCloudflareAiConfigured = true;
    }
  }

  /**
   * Set a mock image generator for deterministic testing without external API calls.
   */
  public setMockAiGenerator(
    fn: ((subjectName: string, categoryName?: string, options?: any) => Promise<Buffer>) | null
  ): void {
    this.mockAiGenerator = fn;
  }

  /**
   * Set a mock Cloudinary uploader for deterministic testing without external API calls.
   */
  public setMockUploader(
    fn:
      | ((
          input: string | Buffer,
          options?: any
        ) => Promise<{
          url: string;
          publicId: string;
          format?: string;
          bytes?: number;
          width?: number;
          height?: number;
        }>)
      | null
  ): void {
    this.mockUploader = fn;
  }

  /**
   * Check configuration status
   */
  getStatus() {
    return {
      cloudinaryConfigured: this.isCloudinaryConfigured,
      cloudflareAiConfigured: this.isCloudflareAiConfigured,
      aiModel: env.CLOUDFLARE_AI_MODEL,
    };
  }

  /**
   * Upload an image to Cloudinary and return full storage metadata.
   */
  async uploadImageWithMetadata(
    input: string | Buffer,
    options: { folder?: string; publicId?: string } = {}
  ): Promise<{
    url: string;
    publicId: string;
    format?: string;
    bytes?: number;
    width?: number;
    height?: number;
    uploadedAt: string;
  }> {
    if (this.mockUploader) {
      const mockRes = await this.mockUploader(input, options);
      return {
        ...mockRes,
        uploadedAt: new Date().toISOString(),
      };
    }

    if (!this.isCloudinaryConfigured) {
      if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
        logger.warn('Cloudinary not configured in .env. Falling back to original image URL directly.');
        return {
          url: input,
          publicId: options.publicId || 'fallback_external',
          uploadedAt: new Date().toISOString(),
        };
      }
      throw new Error(
        'Cloudinary credentials are not configured in server .env. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
      );
    }

    const folder = options.folder || 'quizzy/thumbnails';
    const uploadOptions: any = {
      folder,
      public_id: options.publicId,
      transformation: [
        { width: 600, height: 600, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
      resource_type: 'image',
    };

    if (Buffer.isBuffer(input)) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
          if (error || !result) {
            logger.error({ err: error }, 'Cloudinary buffer upload failed');
            return reject(new Error(error?.message || 'Failed to upload image buffer to Cloudinary'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            uploadedAt: new Date().toISOString(),
          });
        });
        stream.end(input);
      });
    }

    // Input is a URL string or data:image base64 string
    const result: UploadApiResponse = await cloudinary.uploader.upload(input, uploadOptions);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Upload an image (base64 string, image URL, or Buffer) to Cloudinary with auto optimization
   */
  async uploadImage(
    input: string | Buffer,
    options: { folder?: string; publicId?: string } = {}
  ): Promise<string> {
    const res = await this.uploadImageWithMetadata(input, options);
    return res.url;
  }

  /**
   * Generate an image using Cloudflare Workers AI Text-to-Image API with category-specific prompt guidance
   */
  async generateSubjectImage(
    subjectName: string,
    categoryName?: string,
    options: {
      categorySlug?: string;
      description?: string;
      sampleQuestionTopics?: string[];
    } = {}
  ): Promise<Buffer> {
    if (this.mockAiGenerator) {
      return this.mockAiGenerator(subjectName, categoryName, options);
    }

    if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
      throw new Error(
        'Cloudflare Workers AI credentials missing in server .env. Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.'
      );
    }

    const model = env.CLOUDFLARE_AI_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0';
    const prompt = buildThumbnailPrompt({
      subjectName,
      categoryName,
      categorySlug: options.categorySlug,
      description: options.description,
      sampleQuestionTopics: options.sampleQuestionTopics,
    });

    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;

    logger.info({ subjectName, categoryName, model, prompt }, 'Generating image with Cloudflare Workers AI...');

    const isMultipartModel = model.includes('flux-2') || model.includes('multipart');
    const maxAttempts = 2; // Bounded retry strategy
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 16000); // 16s timeout

      try {
        let response: Response;

        if (isMultipartModel) {
          const formData = new FormData();
          formData.append('prompt', prompt);

          response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
            },
            body: formData,
            signal: controller.signal,
          });
        } else {
          // Standard JSON models (SDXL, Flux-1-schnell, etc.)
          response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt,
            }),
            signal: controller.signal,
          });

          // If model returned 400 requiring multipart, retry with FormData transparently
          if (!response.ok && response.status === 400) {
            const cloned = response.clone();
            const errJson: any = await cloned.json().catch(() => null);
            if (errJson?.errors?.[0]?.message?.includes('multipart')) {
              logger.info({ model }, 'Model requires multipart form data, retrying with FormData...');
              const retryFormData = new FormData();
              retryFormData.append('prompt', prompt);
              response = await fetch(url, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                },
                body: retryFormData,
                signal: controller.signal,
              });
            }
          }
        }

        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          logger.error({ status: response.status, errText, attempt }, 'Cloudflare Workers AI generation failed');
          throw new Error(`Cloudflare AI error (${response.status}): ${errText || response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json: any = await response.json();
          if (json.result?.image) {
            return Buffer.from(json.result.image, 'base64');
          }
          if (typeof json.result === 'string') {
            return Buffer.from(json.result, 'base64');
          }
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (err: any) {
        clearTimeout(timeout);
        lastError = err;
        logger.warn({ attempt, err: err.message }, 'Cloudflare AI generation attempt failed');
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError || new Error('Failed to generate image with Cloudflare Workers AI');
  }

  /**
   * End-to-end: Generate image with Cloudflare Workers AI and upload directly to Cloudinary for fast CDN delivery
   */
  async generateAndUploadSubjectThumbnail(
    subjectName: string,
    categoryName?: string,
    options: {
      categorySlug?: string;
      description?: string;
      sampleQuestionTopics?: string[];
    } = {}
  ): Promise<string> {
    const res = await this.generateAndUploadSubjectThumbnailWithMetadata(subjectName, categoryName, options);
    return res.url;
  }

  /**
   * End-to-end: Generate image with Cloudflare Workers AI and upload directly to Cloudinary, returning metadata.
   */
  async generateAndUploadSubjectThumbnailWithMetadata(
    subjectName: string,
    categoryName?: string,
    options: {
      categorySlug?: string;
      description?: string;
      sampleQuestionTopics?: string[];
    } = {}
  ): Promise<{
    url: string;
    publicId: string;
    metadata: Record<string, any>;
  }> {
    logger.info({ subjectName, categoryName }, 'Auto-generating thumbnail via Cloudflare AI and Cloudinary...');
    const imageBuffer = await this.generateSubjectImage(subjectName, categoryName, options);
    const sanitizedSlug = subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const uploadRes = await this.uploadImageWithMetadata(imageBuffer, {
      folder: 'quizzy/thumbnails',
      publicId: `thumb-${sanitizedSlug}-${Date.now()}`,
    });

    return {
      url: uploadRes.url,
      publicId: uploadRes.publicId,
      metadata: {
        provider: 'cloudflare-ai',
        model: env.CLOUDFLARE_AI_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0',
        publicId: uploadRes.publicId,
        bytes: uploadRes.bytes,
        format: uploadRes.format,
        width: uploadRes.width,
        height: uploadRes.height,
        generatedAt: uploadRes.uploadedAt,
      },
    };
  }
}

export const mediaService = new MediaService();
