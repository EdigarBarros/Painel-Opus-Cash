import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/sora/wght.css'
import '@fontsource/montserrat/latin-700.css'
import './estilo.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
