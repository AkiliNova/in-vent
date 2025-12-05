import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    supportFile: 'cypress/support/e2e.ts', // <- adjust if your file is index.ts
    baseUrl: 'http://localhost:8080',
  },
})