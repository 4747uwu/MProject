import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import LoginSlideshow from './LoginSlideShow';
import logoImage from '../assets/starradiology_logo-1 (1).png';
import ShinyText from '../components/creative/shinnyText';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [activeInput, setActiveInput] = useState(null);
  const [rememberMe, setRememberMe] = useState(false);
  
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if there's a message from redirect (like from change password)
    if (location.state?.message) {
      setSuccessMessage(location.state.message);
      // Clear the message after 5 seconds
      setTimeout(() => {
        setSuccessMessage('');
      }, 5000);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const user = await login(email, password);
      // Redirect based on user role
      switch (user.role) {
        case 'admin':
          navigate('/admin/dashboard');
          break;
        case 'lab_staff':
          navigate('/lab/dashboard');
          break;
        case 'doctor_account':
          navigate('/doctor/dashboard');
          break;
        default:
          navigate('/');
      }
    } catch (err) {
      console.error("Login error", err);
    } finally {
      setIsLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT PANEL - SLIDESHOW (60% on desktop) */}
      
      <div className="hidden lg:block lg:w-[60%] border-l border-r border-[10px]">
        <LoginSlideshow />
      </div>
      

      {/* RIGHT PANEL - LOGIN FORM (40% on desktop) */}
      <div className="w-full lg:w-[40%] flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-blue-100 via-purple-50 to-indigo-100">
        
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400 rounded-full animate-ping opacity-75"></div>
          <div className="absolute top-3/4 right-1/3 w-1 h-1 bg-indigo-400 rounded-full animate-pulse"></div>
          <div className="absolute bottom-1/4 left-1/3 w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
        </div>

        {/* Floating decorative elements */}
        <div className="absolute top-10 right-10 w-20 h-20 rounded-full bg-gradient-to-r from-blue-200 to-indigo-200 blur-2xl opacity-60 animate-pulse"></div>
        <div className="absolute bottom-10 left-10 w-24 h-24 rounded-full bg-gradient-to-r from-purple-200 to-pink-200 blur-2xl opacity-60 animate-pulse" style={{animationDelay: '1s'}}></div>
        
        {/* Content wrapper */}
        <div className="w-full max-w-md p-8 relative z-10">
          
          {/* 🔧 UPDATED: Simple form header with clean logo */}
          <div className="mb-8 text-center">
            {/* Simple Logo Container */}
            <div className="mb-6">
              <img 
                src={logoImage} 
                alt="Star Radiology" 
                className="h-16 w-auto mx-auto object-contain"
                onError={(e) => {
                  // Fallback if image fails to load
                  console.error('Logo failed to load:', e);
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'block';
                }}
              />
              {/* Fallback text (hidden by default, shown if image fails) */}
              <div className="hidden">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg mx-auto">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>
            
            <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
              Welcome Back
            </h2>
            <p className="text-gray-600 text-sm">
              Sign in to your medical dashboard
            </p>
          </div>
          
          {/* Enhanced Success/Error messages */}
          {successMessage && (
            <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 text-green-700 rounded-xl shadow-sm">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>{successMessage}</p>
              </div>
            </div>
          )}
          
          {error && (
            <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 text-red-700 rounded-xl shadow-sm">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Enhanced Login form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Enhanced Email field */}
            <div className="relative group">
              <div className={`absolute left-3 top-3 transition-all duration-300 pointer-events-none z-10 ${
                activeInput === 'email' || email 
                  ? '-translate-y-7 scale-85 text-blue-600 font-medium' 
                  : 'text-gray-500'
              }`}>
                <div className={`flex items-center px-2 py-1 rounded ${
                  activeInput === 'email' || email 
                    ? 'bg-gradient-to-br from-blue-100 via-purple-50 to-indigo-100' 
                    : 'bg-transparent'
                }`}>
                  {(activeInput === 'email' || email) && (
                    <svg className="w-4 h-4 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  Email Address
                </div>
              </div>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setActiveInput('email')}
                onBlur={() => setActiveInput(null)}
                className={`w-full px-4 py-4 pb-3 pt-5 rounded-xl transition-all duration-300 outline-none border-2 ${
                  activeInput === 'email' 
                    ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-200/50' 
                    : 'border-gray-200 bg-white'
                } hover:border-blue-300 hover:shadow-md`}
                placeholder={activeInput === 'email' ? "Enter your email address" : ""}
                required
              />
              
              {/* Enhanced animated line */}
              <div className={`h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 absolute bottom-0 left-0 transition-all duration-500 ${
                activeInput === 'email' ? 'w-full opacity-100' : 'w-0 opacity-0'
              }`}></div>
            </div>
            
            {/* Enhanced Password field */}
            <div className="relative group">
              <div className={`absolute left-3 top-3 transition-all duration-300 pointer-events-none z-10 ${
                activeInput === 'password' || password 
                  ? '-translate-y-7 scale-85 text-blue-600 font-medium' 
                  : 'text-gray-500'
              }`}>
                <div className={`flex items-center px-2 py-1 rounded ${
                  activeInput === 'password' || password 
                    ? 'bg-gradient-to-br from-blue-100 via-purple-50 to-indigo-100' 
                    : 'bg-transparent'
                }`}>
                  {(activeInput === 'password' || password) && (
                    <svg className="w-4 h-4 mr-1 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                  Password
                </div>
              </div>
              
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setActiveInput('password')}
                  onBlur={() => setActiveInput(null)}
                  className={`w-full px-4 py-4 pb-3 pt-5 rounded-xl transition-all duration-300 pr-12 outline-none border-2 ${
                    activeInput === 'password' 
                      ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-200/50' 
                      : 'border-gray-200 bg-white'
                  } hover:border-blue-300 hover:shadow-md`}
                  placeholder={activeInput === 'password' ? "Enter your password" : ""}
                  required
                />
                
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-600 hover:text-blue-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              
              {/* Enhanced animated line */}
              <div className={`h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 absolute bottom-0 left-0 transition-all duration-500 ${
                activeInput === 'password' ? 'w-full opacity-100' : 'w-0 opacity-0'
              }`}></div>
            </div>

            {/* Remember me and Forgot password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-5 h-5 rounded border-2 transition-all duration-200 ${
                    rememberMe 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'border-gray-300 group-hover:border-blue-400'
                  }`}>
                    {rememberMe && (
                      <svg className="w-3 h-3 text-white absolute top-0.5 left-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-gray-600 group-hover:text-gray-800">Remember me</span>
              </label>
              
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
                Forgot password?
              </Link>
            </div>
            
            {/* Enhanced Login button */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full relative overflow-hidden group py-4 px-6 rounded-xl text-white font-medium text-base transition-all duration-300 transform ${
                  isLoading 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-600 hover:from-blue-700 hover:via-blue-800 hover:to-indigo-700 hover:shadow-xl hover:shadow-blue-500/25 hover:-translate-y-1 active:translate-y-0'
                }`}
              >
                {/* Button glow effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75 group-hover:opacity-100 transition-opacity duration-300"></div>
                
                <span className="relative z-10 flex items-center justify-center">
                  {isLoading ? (
                    <>
                      <svg className="animate-spin mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Signing In...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                      </svg>
                      Sign In to Dashboard
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>

          {/* Enhanced Support contact */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center">
              <div className="flex items-center space-x-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Need help? <a href="#" className="text-blue-600 font-medium hover:text-blue-700 transition-colors">Contact support</a></span>
              </div>
            </div>
          </div>

          <div className="mt-8 mb-6 flex items-center justify-center">
            <a
              href="https://www.xcentic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-2 hover:underline"
              title="Visit XCENTIC"
            >
              <span className="text-gray-400 text-sm">Powered by</span>
              <ShinyText 
                text="XCENTIC" 
                speed={3}
                className="text-lg font-bold tracking-wider"
              />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;