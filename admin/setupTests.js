// import '@testing-library/jest-dom';
require('@testing-library/jest-dom');
process.env.VITE_BACKEND_URL = "http://localhost:3000";
process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = "test-anon-key";
globalThis.__IMPORT_META__ = {
  env: {
    DEV: true,
    VITE_BACKEND_URL: process.env.VITE_BACKEND_URL,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  },
};
