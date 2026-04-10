import React from 'react';

interface BrandNameProps {
  className?: string;
  text?: string;
}

export const BrandName: React.FC<BrandNameProps> = ({ 
  className = "", 
  text = "Edamame" 
}) => {
  return (
    <h1 className={`font-fredoka text-4xl font-semibold text-black dark:text-white tracking-wide leading-none ${className}`}>
      {text}
    </h1>
  );
};