import { useState, useEffect } from 'react';

// Tikooh-branded default for events with no image (and broken image links).
const PLACEHOLDER = '/default-event-cover.svg';

interface Props {
  src?: string;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  title?: string;
}

export default function EventImg({ src, alt, className = '', placeholderClassName, title }: Props) {
  const [imgSrc, setImgSrc] = useState(src || PLACEHOLDER);
  const [triedPlaceholder, setTriedPlaceholder] = useState(!src);

  // Sync when the src prop changes (e.g. banner rotation)
  useEffect(() => {
    setImgSrc(src || PLACEHOLDER);
    setTriedPlaceholder(!src);
  }, [src]);

  const handleError = () => {
    if (!triedPlaceholder) {
      setTriedPlaceholder(true);
      setImgSrc(PLACEHOLDER);
    }
  };

  return (
    <img
      src={imgSrc}
      alt={alt || title || 'Event'}
      className={triedPlaceholder && placeholderClassName ? placeholderClassName : className}
      onError={handleError}
    />
  );
}
