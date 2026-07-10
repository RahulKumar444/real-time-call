import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('syncspace_token'));
  const [loading, setLoading] = useState(true);

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      const storedToken = localStorage.getItem('syncspace_token');
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await API.get('/api/auth/me');
        setUser(data.user || data);
        setToken(storedToken);
      } catch {
        localStorage.removeItem('syncspace_token');
        localStorage.removeItem('syncspace_user');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    validateToken();
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await API.post('/api/auth/login', { email, password });
    const newToken = data.token;
    const newUser = data.user;
    localStorage.setItem('syncspace_token', newToken);
    localStorage.setItem('syncspace_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { data } = await API.post('/api/auth/register', { name, email, password });
    const newToken = data.token;
    const newUser = data.user;
    localStorage.setItem('syncspace_token', newToken);
    localStorage.setItem('syncspace_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('syncspace_token');
    localStorage.removeItem('syncspace_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = {
    user,
    token,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user && !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
