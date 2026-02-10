'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI, policiesAPI } from '@/lib/api';
import { User } from '@/lib/types';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, role: string[], policyAcceptances?: string[]) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await authAPI.login({ email, password });
      const { token, user: userData } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      toast.success('Login successful!');
    } catch (error: any) {
      const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error');
      const message = isNetworkError
        ? 'Cannot reach the server. Start the backend: cd backend && npm run dev'
        : (error.response?.data?.error || 'Login failed');
      toast.error(message);
      throw error;
    }
  };

  const register = async (name: string, email: string, password: string, role: string[], acceptSlugs: string[] = []) => {
    try {
      const response = await authAPI.register({ name, email, password, role });
      const { token, user: userData } = response.data;

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      // Record policy acceptances for ToS/Privacy when provided
      if (acceptSlugs.length > 0) {
        try {
          await policiesAPI.acceptPolicies(acceptSlugs, { source: 'register' });
        } catch (acceptErr) {
          // Non-blocking: log to console; UI already shows success
          console.error('Failed to record policy acceptance', acceptErr);
        }
      }
      
      toast.success('Registration successful!');
    } catch (error: any) {
      const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error');
      const message = isNetworkError
        ? 'Cannot reach the server. Start the backend: cd backend && npm run dev'
        : (error.response?.data?.error || 'Registration failed');
      toast.error(message);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    toast.success('Logged out successfully');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
