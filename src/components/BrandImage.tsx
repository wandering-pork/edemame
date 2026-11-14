import React from 'react';

interface BrandImageProps {
  /** `logo` = pod mark + EDAMAME wordmark; `mark` = the pod mark alone (collapsed sidebar, Edie's avatar). */
  variant: 'logo' | 'mark';
  /** Pass "" when the image sits next to visible text that already names it. */
  alt: string;
  className?: string;
}

/**
 * The raster brand logo (`public/images/brand/`), with a light-ink version for
 * dark mode. Both images are rendered and toggled with `dark:` classes, so the
 * swap follows the app's class-based theme without reading it in JS.
 */
export const BrandImage: React.FC<BrandImageProps> = ({ variant, alt, className = '' }) => (
  <>
    <img
      src={`/images/brand/edamame-${variant}-light.webp`}
      alt={alt}
      draggable={false}
      className={`dark:hidden ${className}`}
    />
    <img
      src={`/images/brand/edamame-${variant}-dark.webp`}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      draggable={false}
      className={`hidden dark:block ${className}`}
    />
  </>
);

export default BrandImage;
