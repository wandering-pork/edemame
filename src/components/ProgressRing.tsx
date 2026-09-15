import React, { useEffect, useState } from 'react';

interface ProgressRingProps {
  percentage: number; // 0-100
  size?: number; // diameter in pixels
  strokeWidth?: number;
  className?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  percentage,
  size = 96,
  strokeWidth = 3,
  className = ''
}) => {
  const [displayPercentage, setDisplayPercentage] = useState(0);

  useEffect(() => {
    // Animate percentage on mount
    const timer = setTimeout(() => setDisplayPercentage(percentage), 50);
    return () => clearTimeout(timer);
  }, [percentage]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (displayPercentage / 100) * circumference;

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-ink-soft/30 dark:text-plate-ink-soft/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-edamame-500 transition-all duration-700 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-ink dark:text-plate-ink font-ibm-serif">
          {displayPercentage}%
        </span>
      </div>
    </div>
  );
};
