import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { syncDevToken } from './api'
import App from './App'
import './index.css'

syncDevToken()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
