import React, { useEffect, useRef } from 'react';

const GradientInfoPanel = ({ 
  title, 
  subtitle, 
  features,
  icon,
  primaryColor = "orange", // Default color
  secondaryColor = "red",   // Default secondary color
}) => {
  // Map color names to tailwind gradient classes
  const colorMap = {
    blue: "from-blue-600 via-purple-600 to-indigo-800",
    green: "from-green-600 via-teal-500 to-emerald-800",
    orange: "from-orange-500 via-amber-500 to-rose-600",
    red: "from-red-600 via-rose-500 to-red-800",
    purple: "from-purple-600 via-violet-600 to-indigo-800"
  };
  
  const gradientClass = colorMap[primaryColor] || colorMap.orange;
  const iconRef = useRef(null);
  const dotsRef = useRef(null);
  
  // Animation effect for floating icon
  useEffect(() => {
    const iconElement = iconRef.current;
    let animationFrame;
    let startTime = null;
    
    const floatAnimation = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      
      // Simple floating animation
      const yPosition = Math.sin(elapsed / 1000) * 8;
      if (iconElement) {
        iconElement.style.transform = `translateY(${yPosition}px)`;
      }
      
      animationFrame = requestAnimationFrame(floatAnimation);
    };
    
    animationFrame = requestAnimationFrame(floatAnimation);
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, []);
  
  // Animation effect for moving dots
  useEffect(() => {
    const dotsElement = dotsRef.current;
    if (!dotsElement) return;
    
    let position = 0;
    const interval = setInterval(() => {
      position = (position + 1) % 60;
      dotsElement.style.backgroundPosition = `${position}px ${position}px`;
    }, 100);
    
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className={`hidden rounded-xl lg:flex lg:w-1/3 xl:w-2/5 bg-gradient-to-br ${gradientClass} relative overflow-hidden`}>
      {/* Background Pattern - Animated */}
      <div className="absolute inset-0 bg-black bg-opacity-20"></div>
      <div 
        ref={dotsRef}
        className="absolute inset-0 transition-all duration-1000 ease-in-out" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      ></div>
      
      {/* Content */}
      <div className="relative z-10 flex flex-col justify-center items-start p-12 text-white">
        {/* Icon - Animated */}
        <div ref={iconRef} className="mb-8 transition-transform duration-300 ease-in-out">
          <div className="w-20 h-20 bg-white bg-opacity-20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            {icon || (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            )}
          </div>
        </div>
        
        {/* Title with animation */}
        <h1 className="text-5xl font-bold mb-4 leading-tight opacity-0 animate-fade-in-up">
          {title || "Registration"}
        </h1>
        
        {/* Subtitle with animation */}
        <p className="text-xl text-white/90 mb-8 leading-relaxed opacity-0 animate-fade-in-up animation-delay-200">
          {subtitle || "Complete the form to register new entity"}
        </p>
        
        {/* Features List with animation */}
        <div className="space-y-4">
          {(features || []).map((feature, index) => (
            <div key={index} className="flex items-center opacity-0 animate-fade-in-up" style={{ animationDelay: `${(index + 2) * 200}ms` }}>
              <div className="w-2 h-2 bg-white rounded-full mr-4"></div>
              <span className="text-white/90">{feature}</span>
            </div>
          ))}
        </div>
        
        {/* Decorative Elements */}
        <div className="absolute bottom-8 left-12">
          <div className="w-32 h-1 bg-gradient-to-r from-white to-transparent opacity-60"></div>
        </div>
      </div>
    </div>
  );
};

export default GradientInfoPanel;