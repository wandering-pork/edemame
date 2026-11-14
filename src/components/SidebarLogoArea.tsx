import React from 'react';
import { BrandSlogan } from './BrandSlogan';
import { BrandImage } from './BrandImage';

export const SidebarLogoArea: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center w-full">
      <BrandImage variant="logo" alt="Edamame" className="w-[150px] h-auto" />
      <div className="text-center mt-1">
        <BrandSlogan text="Have a Great Day!" />
      </div>
    </div>
  );
};
