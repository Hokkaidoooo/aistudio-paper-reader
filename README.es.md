# Modo de lectura para AI Studio

[简体中文](README.md) · [English](README.en.md) · **Español** · [日本語](README.ja.md)

Lee las respuestas largas de Google AI Studio con menos distracciones y guarda una pregunta y su respuesta en Markdown para Typora u Obsidian. La interfaz de la extensión está en chino.

## Instalar o actualizar

1. Descarga el ZIP de la extensión desde [Releases](https://github.com/Hokkaidoooo/aistudio-paper-reader/releases/latest) y descomprímelo en una carpeta que vayas a conservar.
2. En Chrome o Edge, abre `chrome://extensions` o `edge://extensions`, activa el **Modo de desarrollador** y elige **Cargar descomprimida**. Selecciona la carpeta que contiene `manifest.json`. También puedes cargar directamente la [carpeta `extension`](extension) del repositorio.
3. Si tienes instalado el antiguo script de Tampermonkey **AI Studio 纸间阅读**, desactívalo. Guarda los borradores antes de refrescar las páginas abiertas de AI Studio. Para actualizar, sustituye los archivos de la extensión, vuelve a cargarla y refresca esas páginas.

## Leer y guardar una nota

- Pulsa **阅读** (Leer) en la página o el icono de la barra. Elige entre cuatro temas y ajusta la letra, el interlineado, el ancho y el ajuste de líneas de código. **恢复原版** recupera la vista original.
- Pulsa **记录问答** (Guardar pregunta y respuesta), elige un intercambio y revisa el título, las etiquetas y el Markdown. Selecciona **选择位置并保存** (Elegir ubicación y guardar) o **下载 Markdown** (Descargar Markdown).
- Las notas admiten encabezados, enlaces, listas, código, tablas y fórmulas si está disponible su código LaTeX. El panel indica qué elementos faltan. Si una tabla no se puede extraer completa, se detiene la extracción y se conserva el borrador anterior. Si falta una tabla en una exportación antigua, vuelve a guardar el intercambio a partir de la respuesta original.
- Las notas Markdown incluyen por defecto el enlace de la conversación; puedes desactivarlo. Los borradores para blogs omiten el enlace por defecto e incluyen `draft: true`.

## Privacidad y permisos

La extensión solo solicita `storage` para guardar las preferencias de lectura. El script se limita a `aistudio.google.com` y el modo lectura aparece en las páginas de conversación. La extensión no hace peticiones de red ni llama a API de modelos. Tú decides cuándo guardar, descargar o copiar. Los borradores permanecen en la memoria de la página al cerrar el panel; guárdalos antes de refrescar o cerrar la página.

## Reparar citas de una exportación antigua

Usa Node.js 22 o posterior. Ejecuta estos comandos en la raíz del repositorio, sustituyendo las rutas de ejemplo por la de una nota existente y la de un archivo nuevo:

```powershell
npm ci
npm run repair:citations -- "nota.md" "nota-corregida.md"
```

La herramienta corrige los corchetes escapados alrededor de los enlaces de cita y conserva el archivo original, el código y las fórmulas. `npm run build` genera el ZIP y la suma SHA-256 en `dist`.

## Licencia

Creado por Hokkaidoooo y publicado bajo la [licencia MIT](LICENSE).
