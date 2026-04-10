import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export const ProtectedRoute: React.FC = () => {
  const storageMode = localStorage.getItem('edamame_storage_mode');
  if (!storageMode) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
};
