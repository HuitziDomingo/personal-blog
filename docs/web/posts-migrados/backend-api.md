![Fragmento de código JavaScript con las funciones arrayConcat y arrayPush](/img/blog/arreglos-portada.webp)

Hola, amigo: este tutorial es para que puedas aprender a configurar tu backend con las tecnologías del stack MERN.

En mi caso, siempre prefiero usar TypeScript como lenguaje de backend y JavaScript como lenguaje de frontend, y hoy estoy emocionado de mostrarte cómo configuro mi backend a la hora de desarrollar. Así que empecemos.

**Ingredientes:**

- Docker Desktop
- Table Plus o MongoDB Compass

## Inicio

Primero que todo, debemos generar nuestro archivo `package.json` e inicializar el proyecto. Para eso abriremos la terminal y escribiremos el siguiente comando.

```sh
yarn init -y
```

![Terminal con el resultado de yarn init -y](/img/blog/init.webp)

## Scripts de arranque

Ahora agregaremos los siguientes scripts para configurar nuestro archivo `package.json`. Esto sirve para desarrollar y compilar nuestro backend.

```json
"scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
```

## Instalando Express y Mongoose

Ahora vamos a instalar las librerías y paquetes necesarios para desarrollar cualquier API de Node, básica o avanzada. Al hacer esto también se nos instalarán los módulos de Node.

```sh
yarn add express cors dotenv mongoose morgan bcryptjs jsonwebtoken helmet
```

Ahora vamos a instalar las `devDependencies` y los `@types`. A su vez, instalaremos los módulos de `ts-node-dev` y `typescript`.

```sh
yarn add @types/express @types/cors @types/morgan @types/bcryptjs @types/jsonwebtoken @types/helmet ts-node-dev typescript -D
```

Por último, vamos a instalar el archivo `tsconfig.json`. Existen dos formas: una es usando `npx`, en caso de no tener `tsc` instalado, y la otra es usar el comando de la siguiente manera.

```sh
tsc --init
```

O también, en caso de no tener instalado el comando, usaremos `npx`.

```sh
npx tsc --init
```

Hasta ahora, algo así debe quedarnos nuestro proyecto, con los archivos y configuraciones necesarias.

![Explorador de archivos del proyecto después de la configuración inicial](/img/blog/conf1.webp)

## Configurando tsconfig.json

Ahora vamos a configurar y descomentar las siguientes propiedades de nuestro archivo `tsconfig.json`.

```json
"rootDir": "./src",
"resolveJsonModule": true,
"outDir": "./dist",
```

## Configurando directorios

Crearemos una carpeta `src` y dentro crearemos dos archivos, `app.ts` e `index.ts`. Algo así se debe ver nuestro explorador de archivos.

![Carpeta src con los archivos app.ts e index.ts](/img/blog/srcdir.webp)

En el archivo `app.ts` vamos a poner el siguiente código. Estas configuraciones son necesarias para hacer un proyecto mediano o grande; si no comprendes del todo el código, no te preocupes, confía en mí: en el futuro lo comprenderás.

```ts
import express, { Request, Response } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import helmet from 'helmet'
import pkg from '../package.json'

import * as dotenv from 'dotenv';

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())//Ver los datos en consola como JSON
app.use(morgan('dev'))//Ver las peticiones en consola
app.use(helmet())//Seguridad en la peticiones

app.set('pkg', pkg)

app.get('/', (req: Request, res: Response) => {
    res.json({
        author: app.get('pkg').author,
        name: app.get('pkg').name,
        description: app.get('pkg').description,
    })
})

export default app
```

En el archivo `index.ts` vamos a poner el siguiente código.

```ts
import app from "./app"

app.listen(process.env.PORT || 4000, () => console.log('Hola EXPRESS corriendo en el puerto: 4000' ))
```

Ahora arrancamos el proyecto con el siguiente código. Si todo sale bien, habrás levantado tu servidor en Express.

```sh
yarn dev
```

## Configuración de docker-compose y MongoDB

Crearemos un archivo en la raíz llamado `docker-compose.yaml`; este archivo creará nuestra base de datos en Docker. Así que, una vez creado, pondremos el siguiente código.

```yaml
version: '3.8'

services:

  db:
    image: mongo:6
    restart: always
    ports:
      - 27017:27017
    environment:
      MONGODB_DATABASE: mongo
    volumes:
      - ./mongo:/data/db
```

Ahora, para construir la base de datos, usaremos el siguiente comando.

```sh
docker compose up -d
```

Y para dejar corriendo la base de datos usaremos el comando.

```sh
docker compose up
```

## Último paso: conectar Express con MongoDB

En este último paso modificaremos el archivo `index.ts` y lo dejaremos de esta forma.

```ts
import app from "./app"
import mongoose from 'mongoose'

mongoose.set('strictQuery', false)

app.listen(process.env.PORT || 4000, () => console.log('Hola EXPRESS corriendo en el puerto: 4000' ))
mongoose.connect('mongodb://localhost:27017/mongo')
.then(() => console.log('Conexion a MONGO establecida'))
.catch(() => console.log('Error en la conexion a MONGO'))
```

Por último, usaremos Table Plus para tener un entorno gráfico de nuestros datos. Basta con poner los mismos datos que en la imagen en el campo de la URL para conectarnos con Table Plus: `mongodb://localhost:27017/mongo`.

![Conexión a MongoDB en Table Plus con la URL mongodb://localhost:27017/mongo](/img/blog/tableplus.webp)
