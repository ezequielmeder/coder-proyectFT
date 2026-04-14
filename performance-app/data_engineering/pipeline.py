#!/usr/bin/env python3
"""Pipeline de Data Engineering para FT Performance Orchestrator.

Etapas:
1) Ingesta de CSVs (fuerza, gps, other)
2) Limpieza y estandarización de columnas
3) Modelado analítico (dimensiones + hechos)
4) Exportación de datasets listos para consumo
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd


SOURCE_FILES = {
    "force": "force.csv",
    "gps": "gps.csv",
    "other": "other.csv",
}


DEFAULT_CONFIG = {
    "columns": {
        "player": ["player", "jugador", "athlete", "name"],
        "date": ["date", "fecha", "session_date"],
        "jump_cm": ["jump_cm", "jump", "salto_cm"],
        "peak_force_n": ["peak_force_n", "peak_force", "fuerza_pico_n"],
        "distance_km": ["distance_km", "distance", "distancia_km"],
        "high_speed_m": ["high_speed_m", "high_speed", "metros_alta_velocidad"],
        "rpe": ["rpe"],
        "wellness_score": ["wellness_score", "wellness", "bienestar"],
    },
    "required": {
        "force": ["player", "date"],
        "gps": ["player", "date"],
        "other": ["player", "date"],
    },
}


def load_config(config_path: Path | None) -> dict:
    if config_path is None:
        return DEFAULT_CONFIG

    with config_path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def rename_by_aliases(df: pd.DataFrame, alias_map: Dict[str, List[str]]) -> pd.DataFrame:
    current_cols = {col.lower().strip(): col for col in df.columns}
    rename_map = {}

    for canonical, aliases in alias_map.items():
        for alias in aliases:
            key = alias.lower().strip()
            if key in current_cols:
                rename_map[current_cols[key]] = canonical
                break

    return df.rename(columns=rename_map)


def normalize_player(series: pd.Series) -> pd.Series:
    return (
        series.fillna("")
        .astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
        .str.title()
    )


def normalize_date(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", utc=False)
    return parsed.dt.date


def coerce_numeric(df: pd.DataFrame, numeric_cols: Iterable[str]) -> pd.DataFrame:
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def clean_source(df: pd.DataFrame, source: str, config: dict) -> pd.DataFrame:
    aliases = config.get("columns", {})
    required = config.get("required", {}).get(source, ["player", "date"])

    df = rename_by_aliases(df, aliases)

    for col in required:
        if col not in df.columns:
            df[col] = pd.NA

    df["player"] = normalize_player(df["player"])
    df["date"] = normalize_date(df["date"])

    metric_candidates = [
        "jump_cm",
        "peak_force_n",
        "distance_km",
        "high_speed_m",
        "rpe",
        "wellness_score",
    ]
    df = coerce_numeric(df, metric_candidates)

    df = df.dropna(subset=["player", "date"])
    df = df[df["player"] != ""]
    df = df.drop_duplicates(subset=["player", "date"], keep="last")

    preferred_columns = ["player", "date"] + [
        c for c in metric_candidates if c in df.columns
    ]
    extra_cols = [c for c in df.columns if c not in preferred_columns]

    return df[preferred_columns + extra_cols].reset_index(drop=True)


def build_dimensions(force_df: pd.DataFrame, gps_df: pd.DataFrame, other_df: pd.DataFrame):
    all_players = pd.concat(
        [force_df[["player"]], gps_df[["player"]], other_df[["player"]]],
        ignore_index=True,
    ).dropna()
    dim_players = all_players.drop_duplicates().sort_values("player").reset_index(drop=True)
    dim_players["player_id"] = dim_players.index + 1
    dim_players = dim_players[["player_id", "player"]]

    all_dates = pd.concat(
        [force_df[["date"]], gps_df[["date"]], other_df[["date"]]],
        ignore_index=True,
    ).dropna()
    dim_dates = all_dates.drop_duplicates().sort_values("date").reset_index(drop=True)
    dim_dates["date_id"] = dim_dates.index + 1
    dim_dates["year"] = pd.to_datetime(dim_dates["date"]).dt.year
    dim_dates["month"] = pd.to_datetime(dim_dates["date"]).dt.month
    dim_dates["day"] = pd.to_datetime(dim_dates["date"]).dt.day
    dim_dates = dim_dates[["date_id", "date", "year", "month", "day"]]

    return dim_players, dim_dates


def attach_keys(df: pd.DataFrame, dim_players: pd.DataFrame, dim_dates: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    out = df.merge(dim_players, how="left", on="player")
    out = out.merge(dim_dates, how="left", on="date")
    return out


def build_integrated_fact(force_fact: pd.DataFrame, gps_fact: pd.DataFrame, other_fact: pd.DataFrame):
    base_cols = ["player_id", "date_id", "player", "date"]

    def pick(df: pd.DataFrame, cols: List[str], prefix: str):
        if df.empty:
            return pd.DataFrame(columns=base_cols + cols)
        subset = df[base_cols + [c for c in cols if c in df.columns]].copy()
        for c in cols:
            if c in subset.columns:
                subset.rename(columns={c: f"{prefix}_{c}"}, inplace=True)
        return subset

    force_sub = pick(force_fact, ["jump_cm", "peak_force_n"], "force")
    gps_sub = pick(gps_fact, ["distance_km", "high_speed_m"], "gps")
    other_sub = pick(other_fact, ["rpe", "wellness_score"], "other")

    merged = force_sub.merge(gps_sub, on=base_cols, how="outer")
    merged = merged.merge(other_sub, on=base_cols, how="outer")

    return merged.sort_values(["date", "player"]).reset_index(drop=True)


def read_source_csv(input_dir: Path, file_name: str) -> pd.DataFrame:
    file_path = input_dir / file_name
    if not file_path.exists():
        return pd.DataFrame(columns=["player", "date"])
    return pd.read_csv(file_path)


def write_csv(df: pd.DataFrame, output_dir: Path, file_name: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_dir / file_name, index=False)


def run_pipeline(input_dir: Path, output_dir: Path, config: dict) -> None:
    force_raw = read_source_csv(input_dir, SOURCE_FILES["force"])
    gps_raw = read_source_csv(input_dir, SOURCE_FILES["gps"])
    other_raw = read_source_csv(input_dir, SOURCE_FILES["other"])

    force_clean = clean_source(force_raw, "force", config)
    gps_clean = clean_source(gps_raw, "gps", config)
    other_clean = clean_source(other_raw, "other", config)

    dim_players, dim_dates = build_dimensions(force_clean, gps_clean, other_clean)

    fact_force = attach_keys(force_clean, dim_players, dim_dates)
    fact_gps = attach_keys(gps_clean, dim_players, dim_dates)
    fact_other = attach_keys(other_clean, dim_players, dim_dates)

    fact_integrated = build_integrated_fact(fact_force, fact_gps, fact_other)

    write_csv(force_clean, output_dir, "stg_force.csv")
    write_csv(gps_clean, output_dir, "stg_gps.csv")
    write_csv(other_clean, output_dir, "stg_other.csv")

    write_csv(dim_players, output_dir, "dim_players.csv")
    write_csv(dim_dates, output_dir, "dim_dates.csv")

    write_csv(fact_force, output_dir, "fact_force.csv")
    write_csv(fact_gps, output_dir, "fact_gps.csv")
    write_csv(fact_other, output_dir, "fact_other.csv")
    write_csv(fact_integrated, output_dir, "fact_integrated_daily.csv")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Data Engineering pipeline FT Performance")
    parser.add_argument(
        "--input-dir",
        type=Path,
        required=True,
        help="Directorio con CSVs de entrada (force.csv, gps.csv, other.csv)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        required=True,
        help="Directorio donde se guardarán staging/dims/facts",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Ruta a config JSON de aliases y columnas requeridas",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    run_pipeline(args.input_dir, args.output_dir, config)
    print(f"Pipeline ejecutado correctamente. Salida en: {args.output_dir}")


if __name__ == "__main__":
    main()
