import React from 'react';
import { LogoBrand } from './LogoBrand';
import { BrandSlogan } from './BrandSlogan';

interface LogoProps {
  className?: string;
  src?: string | null;
  showText?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ className = "", src, showText = true }) => {
  if (src) {
    return (
      <img 
        src={src} 
        alt="Company Logo" 
        className={`object-contain ${className}`} 
      />
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Scaled both sizes by 1.25 (140->175, 40->50) */}
      <LogoBrand size={showText ? 175 : 50} />
      
      {showText && (
        <div className="flex flex-col justify-center">
          <BrandSlogan className="text-[10px] mt-0.5" />
        </div>
      )}
    </div>
  );
};