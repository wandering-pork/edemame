import React from 'react';

interface BrandSloganProps {
  className?: string;
  text?: string;
}

/**
 * BrandSlogan - Renders the slogan with theme-aware coloring.
 * In dark mode, it uses edamame-300 to complement the green logo.
 */
export const BrandSlogan: React.FC<BrandSloganProps> = ({ 
  className = "", 
  text = "Have a Great Day!" 
}) => {
  return (
    <p className={`font-fredoka text-sm text-black/80 dark:text-edamame-300 transition-colors duration-300 ${className}`}>
      {text}
    </p>
  );
};