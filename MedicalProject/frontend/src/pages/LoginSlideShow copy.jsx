import React, { useState, useEffect } from 'react';

const LoginSlideshow = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Define slides with real Unsplash images
  const slides = [
    {
      title: "Experts on the go!",
      subtitle: "Around The World.",
      description: "Access to global specialists and comprehensive healthcare resources.",
      color: "bg-gradient-to-br from-blue-500 to-blue-600",
      image: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
    },
    {
      title: "Multiple Laboratories",
      subtitle: "Precision & Accuracy",
      description: "State-of-the-art lab equipment and experienced technicians for reliable results.",
      color: "bg-gradient-to-br from-teal-500 to-teal-600",
      image: "https://images.unsplash.com/photo-1582750433449-648ed127bb54?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
    },
    {
      title: "Secure Medical Records",
      subtitle: "Easy Access Anywhere",
      description: "Your patient data is always secure yet accessible when needed.",
      color: "bg-gradient-to-br from-indigo-500 to-indigo-600",
      image: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
    },
    {
      title: "Expert Medical Care",
      subtitle: "Professional Excellence",
      description: "Dedicated healthcare professionals committed to your wellbeing.",
      color: "bg-gradient-to-br from-purple-500 to-purple-600",
      image: "https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1000&q=80"
    },
    
  ];

  // Auto-rotate slides
  useEffect(() => {
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentSlide]);

  const nextSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
      setIsTransitioning(false);
    }, 300);
  };

  const goToSlide = (index) => {
    if (index !== currentSlide) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSlide(index);
        setIsTransitioning(false);
      }, 300);
    }
  };

  return (
    <div className={`relative h-full w-full overflow-hidden ${slides[currentSlide].color} transition-all duration-1000`}>
      {/* Branding */}
      <div className="absolute top-8 left-8 z-30 flex items-center">
        <div className="bg-white/20 backdrop-blur-sm rounded-lg p-1.5">
          <span className="text-white text-xl font-bold"></span>
        </div>
        <div className="ml-2 text-white text-sm">
          <div className="font-bold text-4xl">Star Radiology</div>
          <div className="text-white/70 text-xs"></div>
        </div>
      </div>

      {/* Circular Image Container */}
      <div className="absolute top-1/2 right-16 transform -translate-y-1/2 z-20">
        <div className="relative">
          {/* Main circular image */}
          <div className="w-80 h-80 rounded-full overflow-hidden border-8 border-white/20 shadow-2xl">
            <img 
              src={slides[currentSlide].image}
              alt={slides[currentSlide].title}
              className={`w-full h-full object-cover transition-all duration-500 ${
                isTransitioning ? 'scale-110 opacity-0' : 'scale-100 opacity-100'
              }`}
            />
          </div>
          
          {/* Decorative ring */}
          <div className="absolute inset-0 rounded-full border-4 border-white/30 animate-pulse"></div>
          
          {/* Small floating images around the main circle */}
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full overflow-hidden border-4 border-white/40 shadow-lg animate-float">
            <img 
              src={slides[(currentSlide + 1) % slides.length].image}
              alt="Next slide preview"
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full overflow-hidden border-4 border-white/40 shadow-lg animate-float-slow">
            <img 
              src={slides[(currentSlide + 2) % slides.length].image}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
          
          <div className="absolute top-20 -left-8 w-12 h-12 rounded-full overflow-hidden border-3 border-white/40 shadow-lg animate-bounce-slow">
            <img 
              src={slides[(currentSlide + 3) % slides.length].image}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="absolute inset-0 flex flex-col justify-center px-12 z-20 max-w-2xl">
        <div 
          className={`transition-all duration-500 ${
            isTransitioning ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
          }`}
        >
          <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
            {slides[currentSlide].title}
          </h1>
          <h2 className="text-3xl font-bold text-white mb-6">
            {slides[currentSlide].subtitle}
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-lg">
            {slides[currentSlide].description}
          </p>
          
          {/* Call to action button */}
          <button className="bg-white/20 backdrop-blur-sm text-white px-6 py-3 rounded-lg hover:bg-white/30 transition-all duration-300 font-medium">
            Learn More
          </button>
        </div>

        {/* Navigation Dots */}
        <div className="flex space-x-3 mt-12">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-3 rounded-full transition-all duration-300 hover:bg-white/80 ${
                index === currentSlide ? 'bg-white w-12' : 'bg-white/40 w-3'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Animated Background Elements */}
      <div className="absolute inset-0 z-10 overflow-hidden">
        {/* Floating geometric shapes */}
        <div className="absolute top-[15%] left-[10%] animate-float-slow">
          <div className="w-8 h-8 bg-white/10 rounded-lg rotate-12"></div>
        </div>
        
        <div className="absolute top-[35%] left-[15%] animate-float" style={{animationDelay: '1s'}}>
          <div className="w-6 h-6 bg-white/15 rounded-full"></div>
        </div>
        
        <div className="absolute top-[60%] left-[8%] animate-bounce-slow" style={{animationDelay: '1.5s'}}>
          <div className="w-10 h-10 bg-white/10 rounded-md rotate-45"></div>
        </div>
        
        <div className="absolute bottom-[20%] left-[20%] animate-float-slow" style={{animationDelay: '2s'}}>
          <div className="w-12 h-12 bg-white/10 rounded-full"></div>
        </div>
        
        {/* Background gradient orbs */}
        <div className="absolute top-[10%] left-[5%] w-32 h-32 rounded-full bg-white/5 blur-xl"></div>
        <div className="absolute bottom-[15%] left-[10%] w-40 h-40 rounded-full bg-white/5 blur-xl"></div>
      </div>

      {/* Navigation arrows */}
      <button 
        onClick={nextSlide}
        className="absolute bottom-8 right-8 z-30 bg-white/20 backdrop-blur-sm p-3 rounded-full hover:bg-white/30 transition-all duration-300"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-25px) rotate(-5deg); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: float-slow 6s ease-in-out infinite;
        }
        .animate-bounce-slow {
          animation: bounce-slow 5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default LoginSlideshow;