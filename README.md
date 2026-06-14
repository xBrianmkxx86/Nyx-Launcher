# Nyx Launcher Server

## Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/health` | No | Verificar si el servidor está online |
| POST | `/register` | No | Crear cuenta |
| POST | `/login` | No | Iniciar sesión → devuelve token JWT |
| POST | `/skin/upload` | Bearer token | Subir skin (.png) |
| GET | `/skin/:username` | No | Obtener URL de skin |
| GET | `/news` | No | Obtener noticias del launcher |
| GET | `/skins/:username.png` | No | Descargar skin directo |

## Deploy en Railway

1. Crea cuenta en [railway.app](https://railway.app)
2. Nuevo proyecto → **Deploy from GitHub repo** (sube este código a GitHub primero)
3. En Variables de entorno agrega:
   - `JWT_SECRET` = cualquier string largo y aleatorio
   - `PORT` = 3000 (Railway lo pone automático)
4. Copia la URL que te da Railway (ej: `https://nyx-server-production.up.railway.app`)

## Deploy en Render

1. Crea cuenta en [render.com](https://render.com)
2. New → **Web Service** → conecta tu repo de GitHub
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Agrega la variable `JWT_SECRET`

## Configurar el launcher

En `NyxServerClient.cs`, cambia esta línea por tu URL real:

```csharp
public static string ServerUrl { get; set; } = "https://TU-URL-AQUI.railway.app";
```

## Local (pruebas)

```bash
cp .env.example .env
# Edita .env con tu JWT_SECRET
npm start
# Servidor en http://localhost:3000
```
