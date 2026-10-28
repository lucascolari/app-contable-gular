# Contable Gular 💵

App web (PWA) para llevar la contabilidad interna de Gular: ingresos, egresos,
saldo en caja, resumen por mes, filtros, multimoneda (ARS/USD) y comprobantes.
Multiusuario: entrás vos y tu socio, cada uno con su cuenta, y queda registrado
quién cargó cada movimiento.

- **Frontend:** HTML + CSS + JavaScript puro (sin frameworks → liviano y rápido).
- **Backend:** Supabase (login, base de datos compartida y guardado de archivos).
- **Seguridad:** Row Level Security — solo los miembros de Gular ven/tocan los datos.

---

## Puesta en marcha (una sola vez, ~10 minutos)

### 1) Crear el proyecto en Supabase
1. Entrá a **https://supabase.com** y creá una cuenta (gratis).
2. **New project** → ponele nombre (ej. `contable-gular`), elegí una contraseña
   para la base y la región más cercana (ej. *South America (São Paulo)*).
3. Esperá ~2 min a que termine de crearse.

### 2) Crear las tablas y la seguridad
1. En el menú de la izquierda: **SQL Editor** → **New query**.
2. Abrí el archivo [`db/schema.sql`](db/schema.sql) de este proyecto, copiá **todo**
   el contenido, pegalo y apretá **Run**.
3. Tiene que decir *Success*. Esto crea las tablas, los índices y las reglas de acceso.

### 3) Crear el bucket de comprobantes
1. Menú izquierdo: **Storage** → **New bucket**.
2. Nombre: `comprobantes`. **Public: NO** (dejalo privado). Crear.
   > Las reglas de acceso del bucket ya quedaron creadas por el `schema.sql`.

### 4) Dar de alta los usuarios (vos y tu socio)
1. Menú izquierdo: **Authentication** → **Users** → **Add user** →
   *Create new user*. Poné email + contraseña (una para vos, otra para tu socio).
   Marcá **Auto Confirm User** para que no haga falta confirmar por mail.
2. Volvé al **SQL Editor** y corré esto (cambiá nombre/email por los reales):

   ```sql
   insert into public.profiles (id, nombre, email)
   select id, 'Lucas', email from auth.users
   where email = 'lucascolari@hotmail.com'
   on conflict (id) do nothing;

   insert into public.profiles (id, nombre, email)
   select id, 'Socio', email from auth.users
   where email = 'EMAIL_DE_TU_SOCIO'
   on conflict (id) do nothing;
   ```
   > ⚠️ Importante: si alguien se autentica pero **no** está en `profiles`,
   > la app lo rechaza. Así solo entran los miembros de Gular.

3. (Recomendado) **Authentication → Providers → Email**: desactivá
   *"Allow new users to sign up"* para que nadie pueda registrarse solo.

### 5) Conectar la app con tus claves
1. En Supabase: **Settings** (⚙) → **API**.
2. Copiá:
   - **Project URL**
   - En *Project API keys*, la clave **`anon` `public`**
3. Abrí [`js/config.js`](js/config.js) y pegá esos dos valores.
   > La clave `anon public` es segura de poner ahí. **Nunca** pongas la
   > `service_role` (esa es secreta).

---

## Probar la app

Como usa módulos de JavaScript, hay que servirla con un servidor local
(abrir el `index.html` directo con doble clic no alcanza). Desde esta carpeta:

```bash
npx serve .
```
Después abrí la dirección que te muestra (ej. `http://localhost:3000`).

---

## Instalar en el celular

1. Subí la app a un hosting (ej. **Netlify**: arrastrás esta carpeta y listo).
2. Abrí la URL en el celu con **Chrome** (Android) o **Safari** (iPhone).
3. Menú del navegador → **"Agregar a pantalla de inicio"**.
4. Queda como una app más, a pantalla completa.

---

## Qué hace la app

- **Saldo en caja** siempre visible, en ARS y USD por separado.
- **Resumen del mes:** cuánto entró, cuánto salió, el neto, y en qué categorías
  se fue la plata (con barras). Navegás entre meses con ‹ ›.
- **Movimientos:** lista con buscador y filtros por tipo, categoría, proyecto,
  quién lo cargó y mes.
- **Cargar movimiento:** botón **+**. Ingreso/egreso, monto, moneda, fecha,
  descripción, categoría, proyecto y **comprobante** (foto o PDF).
- **Ajustes:** crear/borrar categorías y proyectos.

## Ideas para más adelante (no incluidas todavía)
- Gráficos (torta de gastos, evolución del saldo mes a mes).
- Exportar a Excel/PDF para el contador.
- Sincronización en vivo entre los dos celulares (Supabase Realtime).
- Cotización del dólar para ver un total unificado.
