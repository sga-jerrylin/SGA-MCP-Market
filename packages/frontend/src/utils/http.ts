import axios from 'axios';

const http = axios.create({
  baseURL: '/api'
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('sga_market_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default http;
