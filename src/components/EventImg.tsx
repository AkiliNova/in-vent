import { useState } from 'react';

// Generic event poster placeholder — royalty-free Unsplash image
// Colorful stage lights, no specific event/performer
const PLACEHOLDER = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80';

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
