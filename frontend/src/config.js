/**
 * GSTGPT Dynamic API Configuration
 * Automatically resolves API host matching current browser location (localhost vs VPS IP / Domain)
 */

export const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:5000/api`;
};

export const getFastApiUrl = () => {
  if (process.env.REACT_APP_FASTAPI_URL) return process.env.REACT_APP_FASTAPI_URL;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return `${protocol}//${hostname}:5000/api`;
};
