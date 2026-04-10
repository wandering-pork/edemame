import React from 'react';
import { LogoBrand } from './LogoBrand';
import { BrandSlogan } from './BrandSlogan';

export const SidebarLogoArea: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center w-full">
      {/* Resized to 225 (180 * 1.25) */}
      <LogoBrand size={225} />
      {/* Adjusted negative margin for larger size to keep slogan close */}
      <div className="text-center -mt-7">
        <BrandSlogan text="Have a Great Day!" />
      </div>
    </div>
  );
};