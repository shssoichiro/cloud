import type { Images } from '@/lib/images-schema';

type ImageInfo = {
  filename: string;
  path: string;
};

function buildImageContext(images: ImageInfo[]): string {
  if (images.length === 0) return '';

  const imageElements = images
    .map(img => `  <image filename="${img.filename}" sourcePath="${img.path}" />`)
    .join('\n');

  return '\n\n<available_images>\n' + imageElements + '\n</available_images>';
}

function buildImageContextFromAttachments(images: Images | undefined): string {
  if (!images) return '';
  return buildImageContext(
    images.files.map(filename => ({
      filename,
      path: `${images.path}/${filename}`,
    }))
  );
}

export { buildImageContext, buildImageContextFromAttachments };
