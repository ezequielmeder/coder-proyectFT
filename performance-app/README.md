# FT Performance Orchestrator (MVP)

Aplicación web base para orquestar herramientas de valoración del rendimiento en fútbol.

## Objetivo

- Cargar y procesar automáticamente datos desde archivos CSV.
- Integrar información de plataforma de fuerza, GPS y otras fuentes.
- Generar KPIs de apoyo para toma de decisiones del departamento de performance.

## Uso rápido (front-end)

1. Abrir `index.html` en el navegador.
2. Cargar uno o más archivos CSV en los campos de carga.
3. Click en **Procesar datos**.
4. Revisar KPIs y tabla integrada.

## Formato esperado de CSV

### Plataforma de fuerza (ejemplo)

```csv
player,date,jump_cm,peak_force_n
Jugador 1,2026-04-10,39.2,3540
Jugador 2,2026-04-10,42.1,3788
```

### GPS (ejemplo)

```csv
player,date,distance_km,high_speed_m
Jugador 1,2026-04-10,8.42,612
Jugador 2,2026-04-10,9.11,701
```

### Otra herramienta (ejemplo)

```csv
player,date,rpe,wellness_score
Jugador 1,2026-04-10,6,8
Jugador 2,2026-04-10,7,7
```

## Nueva etapa: Data Engineering en Python

Se agregó una etapa previa al dashboard para limpiar y modelar datos de forma versátil usando Python.

Ruta: `data_engineering/pipeline.py`

### ¿Qué hace el pipeline?

1. **Ingesta** de `force.csv`, `gps.csv`, `other.csv`.
2. **Limpieza**:
   - estandariza nombres de columnas con aliases,
   - normaliza `player` y `date`,
   - convierte métricas numéricas,
   - elimina duplicados por `player + date`.
3. **Modelado analítico**:
   - `dim_players.csv`
   - `dim_dates.csv`
   - `fact_force.csv`
   - `fact_gps.csv`
   - `fact_other.csv`
   - `fact_integrated_daily.csv`
4. **Salida staging** limpia:
   - `stg_force.csv`, `stg_gps.csv`, `stg_other.csv`.

### Ejecución

```bash
cd performance-app/data_engineering
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python pipeline.py --input-dir ../sample_input --output-dir ../processed_output
```

Puedes adaptar aliases/columnas requeridas con:

```bash
python pipeline.py \
  --input-dir ../sample_input \
  --output-dir ../processed_output \
  --config config.example.json
```

## KPIs incluidos en este MVP

- Jugadores integrados.
- Salto promedio (cm).
- Pico de fuerza promedio (N).
- Distancia total GPS (km).
- Metros de alta velocidad totales (m).

## Próximos pasos recomendados

- Persistencia en base de datos (PostgreSQL o similar).
- Gestión de usuarios y roles (jefe de performance, analista, cuerpo técnico).
- Dashboard histórico y alertas por umbrales.
- Conectores con APIs de proveedores de GPS/plataformas de fuerza.
