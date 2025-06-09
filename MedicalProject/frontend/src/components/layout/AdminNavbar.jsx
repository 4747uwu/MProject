import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
// 🆕 ADD: Import the logo
import starRadiologyLogo from '../../assets/starradiology_logo-1 (1).png';
import RadiantStatus from '../../components/admin/RadiantStatus';


const UniversalNavbar = () => {
  const { currentUser, logout } = useAuth();
  const [greeting, setGreeting] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Set greeting based on time of day
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) {
        setGreeting('Good morning');
      } else if (hour >= 12 && hour < 18) {
        setGreeting('Good afternoon');
      } else {
        setGreeting('Good evening');
      }
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Get role-based configurations
  const getRoleConfig = () => {
    switch (currentUser?.role) {
      case 'admin':
        return {
          title: 'Star-Radiology', // Keep for alt text and fallback
          subtitle: 'Administration',
          brandColor: 'text-blue-500',
          accentColor: 'bg-blue-500',
          hoverColor: 'hover:text-blue-600',
          activeColor: 'text-blue-600 bg-blue-50',
          links: [
            { to: '/admin/dashboard', label: 'Dashboard', icon: 'dashboard', exact: true },
            { to: '/admin/doctors', label: 'Doctors', icon: 'doctors' },
            { to: '/reports/tat', label: 'TAT Reports', icon: 'reports' },
          ]
        };
      case 'doctor_account':
        return {
          title: 'Star-Radiology',
          subtitle: 'Doctor Portal',
          brandColor: 'text-emerald-500',
          accentColor: 'bg-emerald-500',
          hoverColor: 'hover:text-emerald-600',
          activeColor: 'text-emerald-600 bg-emerald-50',
          links: [
            { to: '/doctor', label: 'Dashboard', icon: 'dashboard', exact: true },
          ]
        };
      case 'lab_staff':
        return {
          title: 'Star-Radiology',
          subtitle: 'Lab Portal',
          brandColor: 'text-orange-500',
          accentColor: 'bg-orange-500',
          hoverColor: 'hover:text-orange-600',
          activeColor: 'text-orange-600 bg-orange-50',
          links: [
            { to: '/lab', label: 'Dashboard', icon: 'dashboard', exact: true },
          ]
        };
      default:
        return {
          title: 'MedPortal',
          subtitle: 'Medical System',
          brandColor: 'text-slate-500',
          accentColor: 'bg-slate-500',
          hoverColor: 'hover:text-slate-600',
          activeColor: 'text-slate-600 bg-slate-50',
          links: []
        };
    }
  };

  const config = getRoleConfig();

  // Icon component for navigation items
  const NavIcon = ({ type, className = "w-5 h-5" }) => {
    const icons = {
      dashboard: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6H8V5z" />
        </svg>
      ),
      doctors: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
          <g data-name="29-doctor">
            <path d="M34 13h3v3.77a2.965 2.965 0 0 0-2-.77h-1zM11 13h3v3h-1a2.965 2.965 0 0 0-2 .77z" style={{fill: "#2b3e5b"}} />
            <path d="M14.04 21c.03.33.07.66.12.98L14 22h-1a3 3 0 0 1-3-3 3.011 3.011 0 0 1 3-3h1v4c0 .34.01.67.04 1z" style={{fill: "#faa68e"}} />
            <path d="M37 16.77A2.94 2.94 0 0 1 38 19a3 3 0 0 1-3 3h-1v-6h1a2.965 2.965 0 0 1 2 .77z" style={{fill: "#ffcdbe"}} />
            <path d="M37 16.77a2.965 2.965 0 0 0-2-.77h-1a3 3 0 0 1 0 6h1a3 3 0 0 0 3-3 2.94 2.94 0 0 0-1-2.23z" style={{fill: "#fdddd7"}} />
            <path d="M11 16.77a2.965 2.965 0 0 1 2-.77h1a3 3 0 0 0 0 6h-1a3 3 0 0 1-3-3 2.94 2.94 0 0 1 1-2.23zM30.89 35.08l-7.13 4.75-6.65-4.75a2.017 2.017 0 0 0 .89-1.66V29l.09-.12a9.3 9.3 0 0 0 11.82 0L30 29v4.42a2.017 2.017 0 0 0 .89 1.66zM34 13v7c0 .34-.01.67-.04 1H14.04c-.03-.33-.04-.66-.04-1v-7h20z" style={{fill: "#ffcdbe"}} />
            <path d="M14.04 21h19.92a11.475 11.475 0 0 1-2.89 6.78 10.944 10.944 0 0 1-1.16 1.1 9.3 9.3 0 0 1-11.82 0 11.241 11.241 0 0 1-3.93-6.9c-.05-.32-.09-.65-.12-.98zM32 13H11c0-7.18 5.82-12 13-12a13.658 13.658 0 0 1 9.19 3.31A11.416 11.416 0 0 1 37 13h-5z" style={{fill: "#64e1dc"}} />
            <path d="m23.76 39.83 7.13-4.75a2 2 0 0 0 .65.28l4.02.95L23 45v2h-4v-4z" style={{fill: "#00a0aa"}} />
            <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-7.13 4.75L19 43v4h2v-3z" style={{fill: "#1cadb5"}} />
            <path d="M47 43.75V47H23v-2l12.56-8.69 6.81 1.6A6.009 6.009 0 0 1 47 43.75zM23.76 39.83 19 43v4H1v-3.25a6.009 6.009 0 0 1 4.63-5.84l10.83-2.55a2 2 0 0 0 .65-.28z" style={{fill: "#64e1dc"}} />
            <path d="M17.11 35.08a2 2 0 0 1-.65.28l-1.473.347 5.773 4.123L17 42v5h2v-4l4.76-3.17zM30.391 38l1.749.677 3.42-2.367-2.574-.608-2.999 2.076.404.222z" style={{fill: "#00c8c8"}} />
            <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-2.631 1.753 1.728.945z" style={{fill: "#64e1dc"}} />
            <path d="M47 43.75a6.009 6.009 0 0 0-4.63-5.84l-6.81-1.6-3.42 2.367.065.025 2.35.608 6.218 1.6A5.923 5.923 0 0 1 45 46.75V47h2zM7.227 40.91 17.609 38l.333-.183-2.955-2.11 1.473-.347-10.83 2.55A6.009 6.009 0 0 0 1 43.75V47h2v-.25a5.923 5.923 0 0 1 4.227-5.84z" style={{fill: "#96ebe6"}} />
            <path d="m17.942 37.817 1.7-.93-2.532-1.807a2 2 0 0 1-.65.28l-1.473.347z" style={{fill: "#64e1dc"}} />
            <path style={{fill: "#1cadb5"}} d="M19 10h2v3h-2zM23 10h2v3h-2zM27 10h2v3h-2zM31 10h2v3h-2zM15 10h2v3h-2z" />
            <path d="M18 15h16v-2H14v7c0 .34.01.67.04 1h2c-.03-.33-.04-.66-.04-1v-3a2 2 0 0 1 2-2z" style={{fill: "#ffbeaa"}} />
            <path d="M32 20c0 .34-.01.67-.04 1h2c.03-.33.04-.66.04-1v-7h-2v7z" style={{fill: "#fdddd7"}} />
            <path d="M29.07 27.78a10.944 10.944 0 0 1-1.16 1.1A9.443 9.443 0 0 1 23 30.939 9.193 9.193 0 0 0 24 31a9.389 9.389 0 0 0 5.91-2.12 10.944 10.944 0 0 0 1.16-1.1A11.273 11.273 0 0 0 33.62 23h-2a11.273 11.273 0 0 1-2.55 4.78z" style={{fill: "#96ebe6"}} />
            <path d="M31.96 21a12 12 0 0 1-.34 2h2a12 12 0 0 0 .34-2z" style={{fill: "#00c8c8"}} />
            <path d="M14.16 21.98q.087.519.217 1.02H31.62a12 12 0 0 0 .34-2H14.04c.03.33.07.66.12.98z" style={{fill: "#1cadb5"}} />
            <path d="M16.377 23h-2a11.144 11.144 0 0 0 3.713 5.88A9.389 9.389 0 0 0 24 31a9.193 9.193 0 0 0 1-.061 9.443 9.443 0 0 1-4.91-2.059A11.144 11.144 0 0 1 16.377 23z" style={{fill: "#00c8c8"}} />
            <path d="M16.16 21.98c-.05-.32-.09-.65-.12-.98h-2c.03.33.07.66.12.98q.087.519.217 1.02h2q-.129-.5-.217-1.02z" style={{fill: "#00a0aa"}} />
            <path style={{fill: "#192b44"}} d="M11 13h3v2h-3zM34 13h3v2h-3z" />
            <path d="M24 33a9.177 9.177 0 0 1-2.548-.365 8 8 0 0 0 5.476 5.085l3.962-2.64a2.017 2.017 0 0 1-.89-1.66V30.8l-.09.079A9.389 9.389 0 0 1 24 33z" style={{fill: "#fdddd7"}} />
            <path d="M21.452 32.635a7.99 7.99 0 0 1-.427-2.136 9.636 9.636 0 0 1-2.935-1.619L18 29v1.8c.031.025.059.055.09.08a9.6 9.6 0 0 0 3.362 1.755z" style={{fill: "#ffbeaa"}} />
            <path d="M29.91 28.88A9.389 9.389 0 0 1 24 31a9.191 9.191 0 0 1-2.975-.5 7.99 7.99 0 0 0 .427 2.136A9.177 9.177 0 0 0 24 33a9.389 9.389 0 0 0 5.91-2.12l.09-.079V29z" style={{fill: "#ffcdbe"}} />
            <path style={{fill: "#00c8c8"}} d="M17 12h2v1h-2zM21 12h2v1h-2z" />
            <path d="M27.857 10H29v.247c.651.128 1.315.244 2 .341V10h2v.82c1.236.112 2.515.171 3.823.176A11.262 11.262 0 0 0 33.19 4.31 13.658 13.658 0 0 0 24 1a14.306 14.306 0 0 0-6.92 1.712C17.634 5.9 21.855 8.609 27.857 10z" style={{fill: "#96ebe6"}} />
            <path style={{fill: "#00c8c8"}} d="M25 12h2v1h-2zM11.051 12c-.026.33-.051.66-.051 1h4v-1zM33 12v1h4c0-.34-.025-.67-.051-1zM29 12h2v1h-2z" />
            <path style={{fill: "#1cadb5"}} d="M19 10h2v2h-2z" />
            <path style={{fill: "#00a0aa"}} d="M19 12v1h2v-1h-2z" />
            <path style={{fill: "#1cadb5"}} d="M23 10h2v2h-2z" />
            <path style={{fill: "#00a0aa"}} d="M23 12v1h2v-1h-2z" />
            <path d="M27.857 10H27v2h2v-1.753c-.389-.076-.767-.16-1.143-.247z" style={{fill: "#1cadb5"}} />
            <path style={{fill: "#00a0aa"}} d="M27 12v1h2v-1h-2zM31 12v1h2v-1h-2z" />
            <path d="M31 10.588V12h2v-1.18q-1.02-.093-2-.232z" style={{fill: "#1cadb5"}} />
            <path d="M33 10h-2v.588q.979.138 2 .232z" style={{fill: "#64e1dc"}} />
            <path style={{fill: "#1cadb5"}} d="M15 10h2v2h-2z" />
            <path style={{fill: "#00a0aa"}} d="M15 12v1h2v-1h-2z" />
            <ellipse cx="29.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
            <ellipse cx="18.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
            <ellipse cx="28" cy="4" rx=".825" ry="1.148" transform="rotate(-45.02 28 4)" style={{fill: "#f6fafd"}} />
            <ellipse cx="41" cy="39" rx=".825" ry="1.148" transform="rotate(-45.02 41 39)" style={{fill: "#f6fafd"}} />
            <ellipse cx="31.003" cy="6.987" rx="1.642" ry="2.286" transform="rotate(-45.02 31.003 6.987)" style={{fill: "#f6fafd"}} />
            <ellipse cx="38.746" cy="38.5" rx=".413" ry=".574" transform="rotate(-45.02 38.746 38.5)" style={{fill: "#f6fafd"}} />
          </g>
        </svg>
      ),
      admin: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className={className}>
          <g data-name="admin-icon">
            {/* Head/Face */}
            <circle cx="24" cy="16" r="8" style={{fill: "#ffcdbe"}} />
            <path d="M16 16c0-4.4 3.6-8 8-8s8 3.6 8 8c0 2.2-.9 4.2-2.3 5.7" style={{fill: "#fdddd7"}} />
            
            {/* Hair */}
            <path d="M24 8c-4.4 0-8 3.6-8 8 0 1.1.2 2.1.6 3.1C18.1 16.4 20.9 14 24 14s5.9 2.4 7.4 5.1c.4-1 .6-2 .6-3.1 0-4.4-3.6-8-8-8z" style={{fill: "#8b4513"}} />
            <path d="M16.6 19.1c1.2 2.1 3.1 3.7 5.4 4.5.6.2 1.3.3 2 .4.6 0 1.3-.1 2-.4 2.3-.8 4.2-2.4 5.4-4.5-.4 1-.9 1.9-1.6 2.7-1.5 1.8-3.7 2.9-6.2 2.9s-4.7-1.1-6.2-2.9c-.7-.8-1.2-1.7-1.6-2.7z" style={{fill: "#654321"}} />
            
            {/* Eyes */}
            <ellipse cx="20" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
            <ellipse cx="28" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
            
            {/* Glasses Frame */}
            <path d="M18 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
            <path d="M26 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
            <path d="M22 14h4" style={{stroke: "#2b3e5b", strokeWidth: "1.5"}} />
            
            {/* Body/Suit */}
            <path d="M24 24c-6 0-11 4-13 10v10c0 2 1.6 3.6 3.6 3.6h18.8c2 0 3.6-1.6 3.6-3.6V34c-2-6-7-10-13-10z" style={{fill: "#1a365d"}} />
            <path d="M24 24c-3 0-5.8 1.2-8 3.2v20.4c0 2 1.6 3.6 3.6 3.6h8.8c2 0 3.6-1.6 3.6-3.6V27.2c-2.2-2-5-3.2-8-3.2z" style={{fill: "#2a4a6b"}} />
            
            {/* Shirt/Tie */}
            <rect x="22" y="28" width="4" height="16" style={{fill: "#dc2626"}} />
            <path d="M22 28l2-2 2 2v16l-2-2-2 2V28z" style={{fill: "#b91c1c"}} />
            
            {/* Collar */}
            <path d="M20 26l4 2 4-2v4l-4 2-4-2v-4z" style={{fill: "#ffffff"}} />
            
            {/* Briefcase/Documents */}
            <rect x="8" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
            <rect x="9" y="34" width="4" height="1" style={{fill: "#654321"}} />
            <rect x="9" y="36" width="4" height="1" style={{fill: "#654321"}} />
            <rect x="34" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
            <rect x="35" y="34" width="4" height="1" style={{fill: "#654321"}} />
            <rect x="35" y="36" width="4" height="1" style={{fill: "#654321"}} />
            
            {/* Arms */}
            <ellipse cx="14" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(-20 14 30)" />
            <ellipse cx="34" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(20 34 30)" />
            
            {/* Hands */}
            <circle cx="10" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
            <circle cx="38" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
            
            {/* Management Symbol - Gear */}
            <circle cx="24" cy="40" r="3" style={{fill: "#fbbf24"}} />
            <path d="M24 37c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3zm0 4c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" style={{fill: "#f59e0b"}} />
            
            {/* Gear teeth */}
            <path d="M24 36l.5-1 .5 1h1l-.5.5v1l-.5-.5-.5.5v-1l-.5-.5h1z" style={{fill: "#fbbf24"}} />
            <path d="M27 39l1-.5-1-.5v-1l.5.5h1l-.5.5.5.5h-1l-.5-.5v1z" style={{fill: "#fbbf24"}} />
            <path d="M24 44l-.5 1-.5-1h-1l.5-.5v-1l.5.5.5-.5v1l.5.5h-1z" style={{fill: "#fbbf24"}} />
            <path d="M21 41l-1 .5 1 .5v1l-.5-.5h-1l.5-.5-.5-.5h1l.5.5v-1z" style={{fill: "#fbbf24"}} />
            
            {/* Badge/ID */}
            <rect x="18" y="32" width="3" height="4" rx="0.5" style={{fill: "#e5e7eb"}} />
            <rect x="18.5" y="32.5" width="2" height="1" style={{fill: "#3b82f6"}} />
            <rect x="18.5" y="34" width="2" height="0.5" style={{fill: "#6b7280"}} />
            <rect x="18.5" y="35" width="2" height="0.5" style={{fill: "#6b7280"}} />
            
            {/* Chart/Analytics Symbol */}
            <rect x="27" y="32" width="3" height="4" style={{fill: "#ffffff"}} />
            <rect x="27.2" y="34.5" width="0.4" height="1.3" style={{fill: "#3b82f6"}} />
            <rect x="27.8" y="33.8" width="0.4" height="2" style={{fill: "#10b981"}} />
            <rect x="28.4" y="33.2" width="0.4" height="2.6" style={{fill: "#f59e0b"}} />
            
            {/* Highlights */}
            <ellipse cx="20" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
            <ellipse cx="28" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
            <circle cx="26" cy="38" r="0.5" style={{fill: "#ffffff", opacity: "0.6"}} />
          </g>
        </svg>
      ),
      labs: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      reports: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      studies: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      upload: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      ),
      patients: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      profile: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    };
    return icons[type] || icons.dashboard;
  };

  // Check if a nav item is active
  const isActive = (path, exact = false) => {
    if (exact) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const handleChangePassword = () => {
    navigate('/change-password');
    setIsDropdownOpen(false);
  };

  const handleLogout = () => {
    logout();
    setIsDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.user-dropdown')) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      {/* Modern Glass-morphism Navbar */}
      <nav className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* 🔧 UPDATED: Left - Brand with Logo */}
            <div className="flex items-center space-x-4">
              {/* Logo Container */}
              <div className="flex items-center space-x-3">
                {/* Logo Image */}
                <div className="flex items-center justify-center">
                  <img 
                    src={starRadiologyLogo} 
                    alt="Star Radiology" 
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      // Fallback if image fails to load
                      console.error('Logo failed to load:', e);
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'block';
                    }}
                  />
                  {/* Fallback text (hidden by default, shown if image fails) */}
                  <div className="hidden">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${config.accentColor} shadow-lg`}>
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                
                {/* Subtitle (Desktop only) */}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-600">{config.subtitle}</p>
                </div>
              </div>
            </div>

            {/* Center - Navigation (Desktop) */}
            <div className="hidden lg:flex items-center space-x-1">
              {config.links.map((link, index) => (
                <Link
                  key={index}
                  to={link.to}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive(link.to, link.exact)
                      ? `${config.activeColor} shadow-sm`
                      : `text-gray-600 hover:text-gray-900 hover:bg-gray-50`
                  }`}
                >
                  <NavIcon type={link.icon} className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>

            {/* Right - User Menu */}
            <div className="flex items-center space-x-4">
            <div className="hidden md:block">
              <RadiantStatus showDetails={true} />
            </div>
              {/* Greeting (Desktop) */}
              <div className="hidden md:block text-right">
                <p className="text-sm font-medium text-gray-900">
                  {greeting}, {currentUser?.firstName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {currentUser?.role?.replace('_', ' ')}
                </p>
              </div>

              {/* Mobile menu button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* User Avatar with Dropdown */}
              <div className="relative user-dropdown">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-3 p-2 rounded-xl hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {/* Role-specific avatars */}
                  {currentUser?.role === 'doctor_account' ? (
                    <div className="w-8 h-8 rounded-lg bg-white border-2 border-emerald-200 flex items-center justify-center shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-6 h-6">
                        <g data-name="29-doctor">
                          <path d="M34 13h3v3.77a2.965 2.965 0 0 0-2-.77h-1zM11 13h3v3h-1a2.965 2.965 0 0 0-2 .77z" style={{fill: "#2b3e5b"}} />
                          <path d="M14.04 21c.03.33.07.66.12.98L14 22h-1a3 3 0 0 1-3-3 3.011 3.011 0 0 1 3-3h1v4c0 .34.01.67.04 1z" style={{fill: "#faa68e"}} />
                          <path d="M37 16.77A2.94 2.94 0 0 1 38 19a3 3 0 0 1-3 3h-1v-6h1a2.965 2.965 0 0 1 2 .77z" style={{fill: "#ffcdbe"}} />
                          <path d="M37 16.77a2.965 2.965 0 0 0-2-.77h-1a3 3 0 0 1 0 6h1a3 3 0 0 0 3-3 2.94 2.94 0 0 0-1-2.23z" style={{fill: "#fdddd7"}} />
                          <path d="M11 16.77a2.965 2.965 0 0 1 2-.77h1a3 3 0 0 0 0 6h-1a3 3 0 0 1-3-3 2.94 2.94 0 0 1 1-2.23zM30.89 35.08l-7.13 4.75-6.65-4.75a2.017 2.017 0 0 0 .89-1.66V29l.09-.12a9.3 9.3 0 0 0 11.82 0L30 29v4.42a2.017 2.017 0 0 0 .89 1.66zM34 13v7c0 .34-.01.67-.04 1H14.04c-.03-.33-.04-.66-.04-1v-7h20z" style={{fill: "#ffcdbe"}} />
                          <path d="M14.04 21h19.92a11.475 11.475 0 0 1-2.89 6.78 10.944 10.944 0 0 1-1.16 1.1 9.3 9.3 0 0 1-11.82 0 11.241 11.241 0 0 1-3.93-6.9c-.05-.32-.09-.65-.12-.98zM32 13H11c0-7.18 5.82-12 13-12a13.658 13.658 0 0 1 9.19 3.31A11.416 11.416 0 0 1 37 13h-5z" style={{fill: "#64e1dc"}} />
                          <path d="m23.76 39.83 7.13-4.75a2 2 0 0 0 .65.28l4.02.95L23 45v2h-4v-4z" style={{fill: "#00a0aa"}} />
                          <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-7.13 4.75L19 43v4h2v-3z" style={{fill: "#1cadb5"}} />
                          <path d="M47 43.75V47H23v-2l12.56-8.69 6.81 1.6A6.009 6.009 0 0 1 47 43.75zM23.76 39.83 19 43v4H1v-3.25a6.009 6.009 0 0 1 4.63-5.84l10.83-2.55a2 2 0 0 0 .65-.28z" style={{fill: "#64e1dc"}} />
                          <path d="M17.11 35.08a2 2 0 0 1-.65.28l-1.473.347 5.773 4.123L17 42v5h2v-4l4.76-3.17zM30.391 38l1.749.677 3.42-2.367-2.574-.608-2.999 2.076.404.222z" style={{fill: "#00c8c8"}} />
                          <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-2.631 1.753 1.728.945z" style={{fill: "#64e1dc"}} />
                          <path d="M47 43.75a6.009 6.009 0 0 0-4.63-5.84l-6.81-1.6-3.42 2.367.065.025 2.35.608 6.218 1.6A5.923 5.923 0 0 1 45 46.75V47h2zM7.227 40.91 17.609 38l.333-.183-2.955-2.11 1.473-.347-10.83 2.55A6.009 6.009 0 0 0 1 43.75V47h2v-.25a5.923 5.923 0 0 1 4.227-5.84z" style={{fill: "#96ebe6"}} />
                          <path d="m17.942 37.817 1.7-.93-2.532-1.807a2 2 0 0 1-.65.28l-1.473.347z" style={{fill: "#64e1dc"}} />
                          <path style={{fill: "#1cadb5"}} d="M19 10h2v3h-2zM23 10h2v3h-2zM27 10h2v3h-2zM31 10h2v3h-2zM15 10h2v3h-2z" />
                          <path d="M18 15h16v-2H14v7c0 .34.01.67.04 1h2c-.03-.33-.04-.66-.04-1v-3a2 2 0 0 1 2-2z" style={{fill: "#ffbeaa"}} />
                          <path d="M32 20c0 .34-.01.67-.04 1h2c.03-.33.04-.66.04-1v-7h-2v7z" style={{fill: "#fdddd7"}} />
                          <path d="M29.07 27.78a10.944 10.944 0 0 1-1.16 1.1A9.443 9.443 0 0 1 23 30.939 9.193 9.193 0 0 0 24 31a9.389 9.389 0 0 0 5.91-2.12 10.944 10.944 0 0 0 1.16-1.1A11.273 11.273 0 0 0 33.62 23h-2a11.273 11.273 0 0 1-2.55 4.78z" style={{fill: "#96ebe6"}} />
                          <path d="M31.96 21a12 12 0 0 1-.34 2h2a12 12 0 0 0 .34-2z" style={{fill: "#00c8c8"}} />
                          <path d="M14.16 21.98q.087.519.217 1.02H31.62a12 12 0 0 0 .34-2H14.04c.03.33.07.66.12.98z" style={{fill: "#1cadb5"}} />
                          <path d="M16.377 23h-2a11.144 11.144 0 0 0 3.713 5.88A9.389 9.389 0 0 0 24 31a9.193 9.193 0 0 0 1-.061 9.443 9.443 0 0 1-4.91-2.059A11.144 11.144 0 0 1 16.377 23z" style={{fill: "#00c8c8"}} />
                          <path d="M16.16 21.98c-.05-.32-.09-.65-.12-.98h-2c.03.33.07.66.12.98q.087.519.217 1.02h2q-.129-.5-.217-1.02z" style={{fill: "#00a0aa"}} />
                          <path style={{fill: "#192b44"}} d="M11 13h3v2h-3zM34 13h3v2h-3z" />
                          <path d="M24 33a9.177 9.177 0 0 1-2.548-.365 8 8 0 0 0 5.476 5.085l3.962-2.64a2.017 2.017 0 0 1-.89-1.66V30.8l-.09.079A9.389 9.389 0 0 1 24 33z" style={{fill: "#fdddd7"}} />
                          <path d="M21.452 32.635a7.99 7.99 0 0 1-.427-2.136 9.636 9.636 0 0 1-2.935-1.619L18 29v1.8c.031.025.059.055.09.08a9.6 9.6 0 0 0 3.362 1.755z" style={{fill: "#ffbeaa"}} />
                          <path d="M29.91 28.88A9.389 9.389 0 0 1 24 31a9.191 9.191 0 0 1-2.975-.5 7.99 7.99 0 0 0 .427 2.136A9.177 9.177 0 0 0 24 33a9.389 9.389 0 0 0 5.91-2.12l.09-.079V29z" style={{fill: "#ffcdbe"}} />
                          <path style={{fill: "#00c8c8"}} d="M17 12h2v1h-2zM21 12h2v1h-2z" />
                          <path d="M27.857 10H29v.247c.651.128 1.315.244 2 .341V10h2v.82c1.236.112 2.515.171 3.823.176A11.262 11.262 0 0 0 33.19 4.31 13.658 13.658 0 0 0 24 1a14.306 14.306 0 0 0-6.92 1.712C17.634 5.9 21.855 8.609 27.857 10z" style={{fill: "#96ebe6"}} />
                          <path style={{fill: "#00c8c8"}} d="M25 12h2v1h-2zM11.051 12c-.026.33-.051.66-.051 1h4v-1zM33 12v1h4c0-.34-.025-.67-.051-1zM29 12h2v1h-2z" />
                          <path style={{fill: "#1cadb5"}} d="M19 10h2v2h-2z" />
                          <path style={{fill: "#00a0aa"}} d="M19 12v1h2v-1h-2z" />
                          <path style={{fill: "#1cadb5"}} d="M23 10h2v2h-2z" />
                          <path style={{fill: "#00a0aa"}} d="M23 12v1h2v-1h-2z" />
                          <path d="M27.857 10H27v2h2v-1.753c-.389-.076-.767-.16-1.143-.247z" style={{fill: "#1cadb5"}} />
                          <path style={{fill: "#00a0aa"}} d="M27 12v1h2v-1h-2zM31 12v1h2v-1h-2z" />
                          <path d="M31 10.588V12h2v-1.18q-1.02-.093-2-.232z" style={{fill: "#1cadb5"}} />
                          <path d="M33 10h-2v.588q.979.138 2 .232z" style={{fill: "#64e1dc"}} />
                          <path style={{fill: "#1cadb5"}} d="M15 10h2v2h-2z" />
                          <path style={{fill: "#00a0aa"}} d="M15 12v1h2v-1h-2z" />
                          <ellipse cx="29.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
                          <ellipse cx="18.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
                          <ellipse cx="28" cy="4" rx=".825" ry="1.148" transform="rotate(-45.02 28 4)" style={{fill: "#f6fafd"}} />
                          <ellipse cx="41" cy="39" rx=".825" ry="1.148" transform="rotate(-45.02 41 39)" style={{fill: "#f6fafd"}} />
                          <ellipse cx="31.003" cy="6.987" rx="1.642" ry="2.286" transform="rotate(-45.02 31.003 6.987)" style={{fill: "#f6fafd"}} />
                          <ellipse cx="38.746" cy="38.5" rx=".413" ry=".574" transform="rotate(-45.02 38.746 38.5)" style={{fill: "#f6fafd"}} />
                        </g>
                      </svg>
                    </div>
                  ) : currentUser?.role === 'admin' ? (
                    <div className="w-8 h-8 rounded-lg bg-white border-2 border-blue-200 flex items-center justify-center shadow-md">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-6 h-6">
                        <g data-name="admin-icon">
                          {/* Head/Face */}
                          <circle cx="24" cy="16" r="8" style={{fill: "#ffcdbe"}} />
                          <path d="M16 16c0-4.4 3.6-8 8-8s8 3.6 8 8c0 2.2-.9 4.2-2.3 5.7" style={{fill: "#fdddd7"}} />
                          
                          {/* Hair */}
                          <path d="M24 8c-4.4 0-8 3.6-8 8 0 1.1.2 2.1.6 3.1C18.1 16.4 20.9 14 24 14s5.9 2.4 7.4 5.1c.4-1 .6-2 .6-3.1 0-4.4-3.6-8-8-8z" style={{fill: "#8b4513"}} />
                          <path d="M16.6 19.1c1.2 2.1 3.1 3.7 5.4 4.5.6.2 1.3.3 2 .4.6 0 1.3-.1 2-.4 2.3-.8 4.2-2.4 5.4-4.5-.4 1-.9 1.9-1.6 2.7-1.5 1.8-3.7 2.9-6.2 2.9s-4.7-1.1-6.2-2.9c-.7-.8-1.2-1.7-1.6-2.7z" style={{fill: "#654321"}} />
                          
                          {/* Eyes */}
                          <ellipse cx="20" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
                          <ellipse cx="28" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
                          
                          {/* Glasses Frame */}
                          <path d="M18 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                          <path d="M26 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                          <path d="M22 14h4" style={{stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                          
                          {/* Body/Suit */}
                          <path d="M24 24c-6 0-11 4-13 10v10c0 2 1.6 3.6 3.6 3.6h18.8c2 0 3.6-1.6 3.6-3.6V34c-2-6-7-10-13-10z" style={{fill: "#1a365d"}} />
                          <path d="M24 24c-3 0-5.8 1.2-8 3.2v20.4c0 2 1.6 3.6 3.6 3.6h8.8c2 0 3.6-1.6 3.6-3.6V27.2c-2.2-2-5-3.2-8-3.2z" style={{fill: "#2a4a6b"}} />
                          
                          {/* Shirt/Tie */}
                          <rect x="22" y="28" width="4" height="16" style={{fill: "#dc2626"}} />
                          <path d="M22 28l2-2 2 2v16l-2-2-2 2V28z" style={{fill: "#b91c1c"}} />
                          
                          {/* Collar */}
                          <path d="M20 26l4 2 4-2v4l-4 2-4-2v-4z" style={{fill: "#ffffff"}} />
                          
                          {/* Briefcase/Documents */}
                          <rect x="8" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
                          <rect x="9" y="34" width="4" height="1" style={{fill: "#654321"}} />
                          <rect x="9" y="36" width="4" height="1" style={{fill: "#654321"}} />
                          <rect x="34" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
                          <rect x="35" y="34" width="4" height="1" style={{fill: "#654321"}} />
                          <rect x="35" y="36" width="4" height="1" style={{fill: "#654321"}} />
                          
                          {/* Arms */}
                          <ellipse cx="14" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(-20 14 30)" />
                          <ellipse cx="34" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(20 34 30)" />
                          
                          {/* Hands */}
                          <circle cx="10" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
                          <circle cx="38" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
                          
                          {/* Management Symbol - Gear */}
                          <circle cx="24" cy="40" r="3" style={{fill: "#fbbf24"}} />
                          <path d="M24 37c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3zm0 4c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" style={{fill: "#f59e0b"}} />
                          
                          {/* Gear teeth */}
                          <path d="M24 36l.5-1 .5 1h1l-.5.5v1l-.5-.5-.5.5v-1l-.5-.5h1z" style={{fill: "#fbbf24"}} />
                          <path d="M27 39l1-.5-1-.5v-1l.5.5h1l-.5.5.5.5h-1l-.5-.5v1z" style={{fill: "#fbbf24"}} />
                          <path d="M24 44l-.5 1-.5-1h-1l.5-.5v-1l.5.5.5-.5v1l.5.5h-1z" style={{fill: "#fbbf24"}} />
                          <path d="M21 41l-1 .5 1 .5v1l-.5-.5h-1l.5-.5-.5-.5h1l.5.5v-1z" style={{fill: "#fbbf24"}} />
                          
                          {/* Badge/ID */}
                          <rect x="18" y="32" width="3" height="4" rx="0.5" style={{fill: "#e5e7eb"}} />
                          <rect x="18.5" y="32.5" width="2" height="1" style={{fill: "#3b82f6"}} />
                          <rect x="18.5" y="34" width="2" height="0.5" style={{fill: "#6b7280"}} />
                          <rect x="18.5" y="35" width="2" height="0.5" style={{fill: "#6b7280"}} />
                          
                          {/* Chart/Analytics Symbol */}
                          <rect x="27" y="32" width="3" height="4" style={{fill: "#ffffff"}} />
                          <rect x="27.2" y="34.5" width="0.4" height="1.3" style={{fill: "#3b82f6"}} />
                          <rect x="27.8" y="33.8" width="0.4" height="2" style={{fill: "#10b981"}} />
                          <rect x="28.4" y="33.2" width="0.4" height="2.6" style={{fill: "#f59e0b"}} />
                          
                          {/* Highlights */}
                          <ellipse cx="20" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
                          <ellipse cx="28" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
                          <circle cx="26" cy="38" r="0.5" style={{fill: "#ffffff", opacity: "0.6"}} />
                        </g>
                      </svg>
                    </div>
                  ) : (
                    <div className={`w-8 h-8 rounded-lg ${config.accentColor} flex items-center justify-center text-white font-semibold text-sm shadow-md`}>
                      {currentUser?.firstName?.charAt(0)?.toUpperCase()}
                      {currentUser?.lastName?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-200/50 py-2 z-50 transform transition-all duration-200 origin-top-right">
                    {/* User Info Header */}
                    <div className="px-4 py-4 border-b border-gray-100">
                      <div className="flex items-center space-x-3">
                        {/* Also update the dropdown header avatar */}
                        {currentUser?.role === 'doctor_account' ? (
                          <div className="w-12 h-12 rounded-xl bg-white border-2 border-emerald-200 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-8 h-8">
                              <g data-name="29-doctor">
                                <path d="M34 13h3v3.77a2.965 2.965 0 0 0-2-.77h-1zM11 13h3v3h-1a2.965 2.965 0 0 0-2 .77z" style={{fill: "#2b3e5b"}} />
                                <path d="M14.04 21c.03.33.07.66.12.98L14 22h-1a3 3 0 0 1-3-3 3.011 3.011 0 0 1 3-3h1v4c0 .34.01.67.04 1z" style={{fill: "#faa68e"}} />
                                <path d="M37 16.77A2.94 2.94 0 0 1 38 19a3 3 0 0 1-3 3h-1v-6h1a2.965 2.965 0 0 1 2 .77z" style={{fill: "#ffcdbe"}} />
                                <path d="M37 16.77a2.965 2.965 0 0 0-2-.77h-1a3 3 0 0 1 0 6h1a3 3 0 0 0 3-3 2.94 2.94 0 0 0-1-2.23z" style={{fill: "#fdddd7"}} />
                                <path d="M11 16.77a2.965 2.965 0 0 1 2-.77h1a3 3 0 0 0 0 6h-1a3 3 0 0 1-3-3 2.94 2.94 0 0 1 1-2.23zM30.89 35.08l-7.13 4.75-6.65-4.75a2.017 2.017 0 0 0 .89-1.66V29l.09-.12a9.3 9.3 0 0 0 11.82 0L30 29v4.42a2.017 2.017 0 0 0 .89 1.66zM34 13v7c0 .34-.01.67-.04 1H14.04c-.03-.33-.04-.66-.04-1v-7h20z" style={{fill: "#ffcdbe"}} />
                                <path d="M14.04 21h19.92a11.475 11.475 0 0 1-2.89 6.78 10.944 10.944 0 0 1-1.16 1.1 9.3 9.3 0 0 1-11.82 0 11.241 11.241 0 0 1-3.93-6.9c-.05-.32-.09-.65-.12-.98zM32 13H11c0-7.18 5.82-12 13-12a13.658 13.658 0 0 1 9.19 3.31A11.416 11.416 0 0 1 37 13h-5z" style={{fill: "#64e1dc"}} />
                                <path d="m23.76 39.83 7.13-4.75a2 2 0 0 0 .65.28l4.02.95L23 45v2h-4v-4z" style={{fill: "#00a0aa"}} />
                                <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-7.13 4.75L19 43v4h2v-3z" style={{fill: "#1cadb5"}} />
                                <path d="M47 43.75V47H23v-2l12.56-8.69 6.81 1.6A6.009 6.009 0 0 1 47 43.75zM23.76 39.83 19 43v4H1v-3.25a6.009 6.009 0 0 1 4.63-5.84l10.83-2.55a2 2 0 0 0 .65-.28z" style={{fill: "#64e1dc"}} />
                                <path d="M17.11 35.08a2 2 0 0 1-.65.28l-1.473.347 5.773 4.123L17 42v5h2v-4l4.76-3.17zM30.391 38l1.749.677 3.42-2.367-2.574-.608-2.999 2.076.404.222z" style={{fill: "#00c8c8"}} />
                                <path d="m32.986 35.7-1.446-.34a2 2 0 0 1-.65-.28l-2.631 1.753 1.728.945z" style={{fill: "#64e1dc"}} />
                                <path d="M47 43.75a6.009 6.009 0 0 0-4.63-5.84l-6.81-1.6-3.42 2.367.065.025 2.35.608 6.218 1.6A5.923 5.923 0  a 0 1 45 46.75V47h2zM7.227 40.91 17.609 38l.333-.183-2.955-2.11 1.473-.347-10.83 2.55A6.009 6.009 0 0 0 1 43.75V47h2v-.25a5.923 5.923 0 0 1 4.227-5.84z" style={{fill: "#96ebe6"}} />
                                <path d="m17.942 37.817 1.7-.93-2.532-1.807a2 2 0 0 1-.65.28l-1.473.347z" style={{fill: "#64e1dc"}} />
                                <path style={{fill: "#1cadb5"}} d="M19 10h2v3h-2zM23 10h2v3h-2zM27 10h2v3h-2zM31 10h2v3h-2zM15 10h2v3h-2z" />
                                <path d="M18 15h16v-2H14v7c0 .34.01.67.04 1h2c-.03-.33-.04-.66-.04-1v-3a2 2 0 0 1 2-2z" style={{fill: "#ffbeaa"}} />
                                <path d="M32 20c0 .34-.01.67-.04 1h2c.03-.33.04-.66.04-1v-7h-2v7z" style={{fill: "#fdddd7"}} />
                                <path d="M29.07 27.78a10.944 10.944 0 0 1-1.16 1.1A9.443 9.443 0 0 1 23 30.939 9.193 9.193 0 0 0 24 31a9.389 9.389 0 0 0 5.91-2.12 10.944 10.944 0 0 0 1.16-1.1A11.273 11.273 0 0 0 33.62 23h-2a11.273 11.273 0 0 1-2.55 4.78z" style={{fill: "#96ebe6"}} />
                                <path d="M31.96 21a12 12 0 0 1-.34 2h2a12 12 0 0 0 .34-2z" style={{fill: "#00c8c8"}} />
                                <path d="M14.16 21.98q.087.519.217 1.02H31.62a12 12 0 0 0 .34-2H14.04c.03.33.07.66.12.98z" style={{fill: "#1cadb5"}} />
                                <path d="M16.377 23h-2a11.144 11.144 0 0 0 3.713 5.88A9.389 9.389 0 0 0 24 31a9.193 9.193 0 0 0 1-.061 9.443 9.443 0 0 1-4.91-2.059A11.144 11.144 0 0 1 16.377 23z" style={{fill: "#00c8c8"}} />
                                <path d="M16.16 21.98c-.05-.32-.09-.65-.12-.98h-2c.03.33.07.66.12.98q.087.519.217 1.02h2q-.129-.5-.217-1.02z" style={{fill: "#00a0aa"}} />
                                <path style={{fill: "#192b44"}} d="M11 13h3v2h-3zM34 13h3v2h-3z" />
                                <path d="M24 33a9.177 9.177 0 0 1-2.548-.365 8 8 0 0 0 5.476 5.085l3.962-2.64a2.017 2.017 0 0 1-.89-1.66V30.8l-.09.079A9.389 9.389 0 0 1 24 33z" style={{fill: "#fdddd7"}} />
                                <path d="M21.452 32.635a7.99 7.99 0 0 1-.427-2.136 9.636 9.636 0 0 1-2.935-1.619L18 29v1.8c.031.025.059.055.09.08a9.6 9.6 0 0 0 3.362 1.755z" style={{fill: "#ffbeaa"}} />
                                <path d="M29.91 28.88A9.389 9.389 0 0 1 24 31a9.191 9.191 0 0 1-2.975-.5 7.99 7.99 0 0 0 .427 2.136A9.177 9.177 0 0 0 24 33a9.389 9.389 0 0 0 5.91-2.12l.09-.079V29z" style={{fill: "#ffcdbe"}} />
                                <path style={{fill: "#00c8c8"}} d="M17 12h2v1h-2zM21 12h2v1h-2z" />
                                <path d="M27.857 10H29v.247c.651.128 1.315.244 2 .341V10h2v.82c1.236.112 2.515.171 3.823.176A11.262 11.262 0 0 0 33.19 4.31 13.658 13.658 0 0 0 24 1a14.306 14.306 0 0 0-6.92 1.712C17.634 5.9 21.855 8.609 27.857 10z" style={{fill: "#96ebe6"}} />
                                <path style={{fill: "#00c8c8"}} d="M25 12h2v1h-2zM11.051 12c-.026.33-.051.66-.051 1h4v-1zM33 12v1h4c0-.34-.025-.67-.051-1zM29 12h2v1h-2z" />
                                <path style={{fill: "#1cadb5"}} d="M19 10h2v2h-2z" />
                                <path style={{fill: "#00a0aa"}} d="M19 12v1h2v-1h-2z" />
                                <path style={{fill: "#1cadb5"}} d="M23 10h2v2h-2z" />
                                <path style={{fill: "#00a0aa"}} d="M23 12v1h2v-1h-2z" />
                                <path d="M27.857 10H27v2h2v-1.753c-.389-.076-.767-.16-1.143-.247z" style={{fill: "#1cadb5"}} />
                                <path style={{fill: "#00a0aa"}} d="M27 12v1h2v-1h-2zM31 12v1h2v-1h-2z" />
                                <path d="M31 10.588V12h2v-1.18q-1.02-.093-2-.232z" style={{fill: "#1cadb5"}} />
                                <path d="M33 10h-2v.588q.979.138 2 .232z" style={{fill: "#64e1dc"}} />
                                <path style={{fill: "#1cadb5"}} d="M15 10h2v2h-2z" />
                                <path style={{fill: "#00a0aa"}} d="M15 12v1h2v-1h-2z" />
                                <ellipse cx="29.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
                                <ellipse cx="18.5" cy="17" rx=".5" ry="2" style={{fill: "#2b3e5b"}} />
                                <ellipse cx="28" cy="4" rx=".825" ry="1.148" transform="rotate(-45.02 28 4)" style={{fill: "#f6fafd"}} />
                                <ellipse cx="41" cy="39" rx=".825" ry="1.148" transform="rotate(-45.02 41 39)" style={{fill: "#f6fafd"}} />
                                <ellipse cx="31.003" cy="6.987" rx="1.642" ry="2.286" transform="rotate(-45.02 31.003 6.987)" style={{fill: "#f6fafd"}} />
                                <ellipse cx="38.746" cy="38.5" rx=".413" ry=".574" transform="rotate(-45.02 38.746 38.5)" style={{fill: "#f6fafd"}} />
                              </g>
                            </svg>
                          </div>
                        ) : currentUser?.role === 'admin' ? (
                          <div className="w-12 h-12 rounded-xl bg-white border-2 border-blue-200 flex items-center justify-center shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-8 h-8">
                              <g data-name="admin-icon">
                                {/* Head/Face */}
                                <circle cx="24" cy="16" r="8" style={{fill: "#ffcdbe"}} />
                                <path d="M16 16c0-4.4 3.6-8 8-8s8 3.6 8 8c0 2.2-.9 4.2-2.3 5.7" style={{fill: "#fdddd7"}} />
                                
                                {/* Hair */}
                                <path d="M24 8c-4.4 0-8 3.6-8 8 0 1.1.2 2.1.6 3.1C18.1 16.4 20.9 14 24 14s5.9 2.4 7.4 5.1c.4-1 .6-2 .6-3.1 0-4.4-3.6-8-8-8z" style={{fill: "#8b4513"}} />
                                <path d="M16.6 19.1c1.2 2.1 3.1 3.7 5.4 4.5.6.2 1.3.3 2 .4.6 0 1.3-.1 2-.4 2.3-.8 4.2-2.4 5.4-4.5-.4 1-.9 1.9-1.6 2.7-1.5 1.8-3.7 2.9-6.2 2.9s-4.7-1.1-6.2-2.9c-.7-.8-1.2-1.7-1.6-2.7z" style={{fill: "#654321"}} />
                                
                                {/* Eyes */}
                                <ellipse cx="20" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
                                <ellipse cx="28" cy="15" rx="1" ry="1.5" style={{fill: "#2b3e5b"}} />
                                
                                {/* Glasses Frame */}
                                <path d="M18 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                                <path d="M26 14c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z" style={{fill: "none", stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                                <path d="M22 14h4" style={{stroke: "#2b3e5b", strokeWidth: "1.5"}} />
                                
                                {/* Body/Suit */}
                                <path d="M24 24c-6 0-11 4-13 10v10c0 2 1.6 3.6 3.6 3.6h18.8c2 0 3.6-1.6 3.6-3.6V34c-2-6-7-10-13-10z" style={{fill: "#1a365d"}} />
                                <path d="M24 24c-3 0-5.8 1.2-8 3.2v20.4c0 2 1.6 3.6 3.6 3.6h8.8c2 0 3.6-1.6 3.6-3.6V27.2c-2.2-2-5-3.2-8-3.2z" style={{fill: "#2a4a6b"}} />
                                
                                {/* Shirt/Tie */}
                                <rect x="22" y="28" width="4" height="16" style={{fill: "#dc2626"}} />
                                <path d="M22 28l2-2 2 2v16l-2-2-2 2V28z" style={{fill: "#b91c1c"}} />
                                
                                {/* Collar */}
                                <path d="M20 26l4 2 4-2v4l-4 2-4-2v-4z" style={{fill: "#ffffff"}} />
                                
                                {/* Briefcase/Documents */}
                                <rect x="8" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
                                <rect x="9" y="34" width="4" height="1" style={{fill: "#654321"}} />
                                <rect x="9" y="36" width="4" height="1" style={{fill: "#654321"}} />
                                <rect x="34" y="32" width="6" height="8" rx="1" style={{fill: "#8b5a2b"}} />
                                <rect x="35" y="34" width="4" height="1" style={{fill: "#654321"}} />
                                <rect x="35" y="36" width="4" height="1" style={{fill: "#654321"}} />
                                
                                {/* Arms */}
                                <ellipse cx="14" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(-20 14 30)" />
                                <ellipse cx="34" cy="30" rx="3" ry="8" style={{fill: "#1a365d"}} transform="rotate(20 34 30)" />
                                
                                {/* Hands */}
                                <circle cx="10" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
                                <circle cx="38" cy="35" r="2.5" style={{fill: "#ffcdbe"}} />
                                
                                {/* Management Symbol - Gear */}
                                <circle cx="24" cy="40" r="3" style={{fill: "#fbbf24"}} />
                                <path d="M24 37c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3zm0 4c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z" style={{fill: "#f59e0b"}} />
                                
                                {/* Gear teeth */}
                                <path d="M24 36l.5-1 .5 1h1l-.5.5v1l-.5-.5-.5.5v-1l-.5-.5h1z" style={{fill: "#fbbf24"}} />
                                <path d="M27 39l1-.5-1-.5v-1l.5.5h1l-.5.5.5.5h-1l-.5-.5v1z" style={{fill: "#fbbf24"}} />
                                <path d="M24 44l-.5 1-.5-1h-1l.5-.5v-1l.5.5.5-.5v1l.5.5h-1z" style={{fill: "#fbbf24"}} />
                                <path d="M21 41l-1 .5 1 .5v1l-.5-.5h-1l.5-.5-.5-.5h1l.5.5v-1z" style={{fill: "#fbbf24"}} />
                                
                                {/* Badge/ID */}
                                <rect x="18" y="32" width="3" height="4" rx="0.5" style={{fill: "#e5e7eb"}} />
                                <rect x="18.5" y="32.5" width="2" height="1" style={{fill: "#3b82f6"}} />
                                <rect x="18.5" y="34" width="2" height="0.5" style={{fill: "#6b7280"}} />
                                <rect x="18.5" y="35" width="2" height="0.5" style={{fill: "#6b7280"}} />
                                
                                {/* Chart/Analytics Symbol */}
                                <rect x="27" y="32" width="3" height="4" style={{fill: "#ffffff"}} />
                                <rect x="27.2" y="34.5" width="0.4" height="1.3" style={{fill: "#3b82f6"}} />
                                <rect x="27.8" y="33.8" width="0.4" height="2" style={{fill: "#10b981"}} />
                                <rect x="28.4" y="33.2" width="0.4" height="2.6" style={{fill: "#f59e0b"}} />
                                
                                {/* Highlights */}
                                <ellipse cx="20" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
                                <ellipse cx="28" cy="12" rx="1" ry="1.5" style={{fill: "#ffffff", opacity: "0.3"}} />
                                <circle cx="26" cy="38" r="0.5" style={{fill: "#ffffff", opacity: "0.6"}} />
                              </g>
                            </svg>
                          </div>
                        ) : (
                          <div className={`w-12 h-12 rounded-xl ${config.accentColor} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                            {currentUser?.firstName?.charAt(0)?.toUpperCase()}
                            {currentUser?.lastName?.charAt(0)?.toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">
                            {currentUser?.firstName} {currentUser?.lastName}
                          </p>
                          <p className="text-sm text-gray-500">{currentUser?.email}</p>
                          <p className="text-xs text-gray-400 capitalize mt-1 px-2 py-1 bg-gray-100 rounded-full inline-block">
                            {currentUser?.role?.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Menu Items */}
                    <div className="py-2">
                      <button
                        onClick={handleChangePassword}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Change Password</p>
                          <p className="text-xs text-gray-500">Update your security credentials</p>
                        </div>
                      </button>

                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Sign Out</p>
                          <p className="text-xs text-gray-500">Sign out of your account</p>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200/50 bg-white/95 backdrop-blur-md">
            <div className="px-4 py-4 space-y-2">
              {config.links.map((link, index) => (
                <Link
                  key={index}
                  to={link.to}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive(link.to, link.exact)
                      ? `${config.activeColor} shadow-sm`
                      : `text-gray-600 hover:text-gray-900 hover:bg-gray-50`
                  }`}
                >
                  <NavIcon type={link.icon} className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </>
  );
};

export default UniversalNavbar;