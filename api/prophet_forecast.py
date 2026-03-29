"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/prophet_forecast.py
Purpose : Time-series forecasting of monthly wildfire incident counts
          using Meta's Prophet library.
          Returns 12-month forward forecast + historical actuals +
          monthly seasonality component for the fire-season calendar.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np

log = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_PATH     = PROJECT_ROOT / "data" / "raw" / "California_Fire_Incidents.csv"
PROC_PATH    = PROJECT_ROOT / "data" / "processed" / "clean_fire_data.csv"


def _load_monthly_series() -> pd.DataFrame:
    """
    Load fire incident data and aggregate to monthly incident counts.
    Tries raw CSV first (has 'Started' dates), falls back to processed.
    Returns a DataFrame with columns ['ds', 'y'] ready for Prophet.
    """
    df = None

    # --- Raw path: has a 'Started' date column ---
    if RAW_PATH.exists():
        try:
            raw = pd.read_csv(RAW_PATH, usecols=["Started", "AcresBurned"],
                              low_memory=False)
            raw["Started"] = pd.to_datetime(raw["Started"], errors="coerce")
            raw = raw.dropna(subset=["Started"])
            raw["month"] = raw["Started"].dt.to_period("M")
            monthly = (
                raw.groupby("month")
                .agg(incident_count=("AcresBurned", "count"),
                     total_acres=("AcresBurned", "sum"))
                .reset_index()
            )
            monthly["ds"] = monthly["month"].dt.to_timestamp()
            monthly["y"]  = monthly["incident_count"].astype(float)
            df = monthly[["ds", "y", "total_acres"]].copy()
        except Exception as e:
            log.warning("Failed to read raw CSV: %s", e)

    # --- Processed fallback: use ArchiveYear if no dated series ---
    if df is None and PROC_PATH.exists():
        try:
            proc = pd.read_csv(PROC_PATH, low_memory=False)
            if "ArchiveYear" in proc.columns:
                yearly = (
                    proc.groupby("ArchiveYear")
                    .size()
                    .reset_index(name="y")
                )
                yearly["ds"] = pd.to_datetime(
                    yearly["ArchiveYear"].astype(int).astype(str) + "-01-01"
                )
                yearly["total_acres"] = proc.groupby("ArchiveYear")["AcresBurned"].sum().values
                df = yearly[["ds", "y", "total_acres"]].copy()
        except Exception as e:
            log.warning("Failed to read processed CSV: %s", e)

    if df is None:
        raise FileNotFoundError("No fire data found. Run preprocessing.py first.")

    # Sort and remove months with no data at the tail (partial months)
    df = df.sort_values("ds").reset_index(drop=True)
    return df


def get_forecast(periods: int = 12) -> dict[str, Any]:
    """
    Fit a Prophet model on monthly incident counts and forecast `periods`
    months into the future.

    Returns
    -------
    dict with keys:
      - historical   : list[{ds, y, total_acres}]    historical actuals
      - forecast     : list[{ds, yhat, yhat_lower, yhat_upper}]  future only
      - full_forecast: list[{ds, yhat, yhat_lower, yhat_upper}]  all rows
      - seasonality  : list[{month, index}]  monthly relative risk index (1-12)
      - trend_direction: "increasing" | "decreasing" | "stable"
      - peak_month   : str  e.g. "August"
      - model_type   : "prophet" | "fallback"
    """
    df = _load_monthly_series()

    # ── Attempt Prophet fit ──────────────────────────────────────────────
    try:
        from prophet import Prophet  # lazy import — not always installed

        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            seasonality_mode="multiplicative",
            changepoint_prior_scale=0.15,
            interval_width=0.80,
        )
        model.fit(df[["ds", "y"]])

        # Future dataframe
        future = model.make_future_dataframe(periods=periods, freq="MS")
        forecast_df = model.predict(future)

        # Extract historical rows (rows that align with historical ds)
        hist_ds_set = set(df["ds"].astype(str))
        full = forecast_df[["ds", "yhat", "yhat_lower", "yhat_upper"]].copy()
        full["yhat"]       = full["yhat"].clip(lower=0)
        full["yhat_lower"] = full["yhat_lower"].clip(lower=0)

        historical_rows = []
        for _, row in df.iterrows():
            historical_rows.append({
                "ds":           row["ds"].strftime("%Y-%m-%d"),
                "y":            int(row["y"]),
                "total_acres":  int(row.get("total_acres", 0)),
            })

        future_rows = full[~full["ds"].astype(str).str[:10].isin(
            {d[:7] for d in hist_ds_set}
        )].head(periods)

        forecast_rows = []
        for _, row in future_rows.iterrows():
            forecast_rows.append({
                "ds":          row["ds"].strftime("%Y-%m-%d"),
                "yhat":        round(float(row["yhat"]), 1),
                "yhat_lower":  round(float(row["yhat_lower"]), 1),
                "yhat_upper":  round(float(row["yhat_upper"]), 1),
            })

        full_rows = []
        for _, row in full.iterrows():
            full_rows.append({
                "ds":          row["ds"].strftime("%Y-%m-%d"),
                "yhat":        round(float(row["yhat"]), 1),
                "yhat_lower":  round(float(row["yhat_lower"]), 1),
                "yhat_upper":  round(float(row["yhat_upper"]), 1),
            })

        # ── Monthly seasonality index ────────────────────────────────────
        # Synthesise a full year of dates and extract the yearly component
        synth = pd.date_range("2020-01-01", periods=12, freq="MS")
        synth_df = pd.DataFrame({"ds": synth})
        synth_pred = model.predict(synth_df)

        # Multiplicative yearly component → relative risk index
        seasonal_vals = synth_pred["yearly"].values
        # Normalise so minimum = 0, peak = 100
        s_min, s_max = seasonal_vals.min(), seasonal_vals.max()
        if s_max > s_min:
            normed = (seasonal_vals - s_min) / (s_max - s_min) * 100
        else:
            normed = np.full(12, 50.0)

        month_names = ["Jan","Feb","Mar","Apr","May","Jun",
                       "Jul","Aug","Sep","Oct","Nov","Dec"]
        seasonality = [
            {"month": month_names[i], "month_num": i + 1, "index": round(float(normed[i]), 1)}
            for i in range(12)
        ]

        peak_idx = int(np.argmax(normed))
        peak_month = ["January","February","March","April","May","June",
                      "July","August","September","October","November","December"][peak_idx]

        # Trend direction from first vs last historical yhat
        hist_full = full[full["ds"].astype(str).str[:7].isin(
            {d[:7] for d in hist_ds_set}
        )]
        if len(hist_full) >= 4:
            first_q = hist_full["yhat"].iloc[:len(hist_full)//3].mean()
            last_q  = hist_full["yhat"].iloc[-len(hist_full)//3:].mean()
            delta   = (last_q - first_q) / (first_q + 1) * 100
            trend = "increasing" if delta > 5 else "decreasing" if delta < -5 else "stable"
        else:
            trend = "stable"

        return {
            "historical":      historical_rows,
            "forecast":        forecast_rows,
            "full_forecast":   full_rows,
            "seasonality":     seasonality,
            "trend_direction": trend,
            "peak_month":      peak_month,
            "model_type":      "prophet",
            "periods":         periods,
        }

    except ImportError:
        log.warning("Prophet not installed — using statistical fallback forecast")
        return _fallback_forecast(df, periods)

    except Exception as e:
        log.warning("Prophet failed: %s — using statistical fallback", e)
        return _fallback_forecast(df, periods)


def _fallback_forecast(df: pd.DataFrame, periods: int) -> dict[str, Any]:
    """
    Fallback forecast using simple seasonal decomposition when Prophet
    is unavailable. Uses trailing 3-year monthly average as 'forecast'.
    """
    df = df.copy()
    df["month_num"] = df["ds"].dt.month

    # Monthly average from historical
    monthly_avg = df.groupby("month_num")["y"].mean()

    # Historical rows
    historical_rows = []
    for _, row in df.iterrows():
        historical_rows.append({
            "ds":           row["ds"].strftime("%Y-%m-%d"),
            "y":            int(row["y"]),
            "total_acres":  int(row.get("total_acres", 0)),
        })

    # Forecast: next `periods` months
    last_date = df["ds"].max()
    forecast_rows = []
    full_rows = [{
        "ds": r["ds"], "yhat": float(r["y"]),
        "yhat_lower": max(0, float(r["y"]) * 0.7),
        "yhat_upper": float(r["y"]) * 1.3
    } for r in historical_rows]

    for i in range(1, periods + 1):
        next_d  = last_date + pd.DateOffset(months=i)
        mon     = next_d.month
        yhat    = float(monthly_avg.get(mon, df["y"].mean()))
        yhat_lo = max(0, yhat * 0.65)
        yhat_hi = yhat * 1.35
        row_dict = {
            "ds":          next_d.strftime("%Y-%m-%d"),
            "yhat":        round(yhat, 1),
            "yhat_lower":  round(yhat_lo, 1),
            "yhat_upper":  round(yhat_hi, 1),
        }
        forecast_rows.append(row_dict)
        full_rows.append(row_dict)

    # Seasonality from monthly averages
    month_names = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]
    vals = np.array([monthly_avg.get(m+1, 0) for m in range(12)], dtype=float)
    v_min, v_max = vals.min(), vals.max()
    normed = (vals - v_min) / (v_max - v_min + 1) * 100
    seasonality = [
        {"month": month_names[i], "month_num": i + 1, "index": round(float(normed[i]), 1)}
        for i in range(12)
    ]
    peak_idx = int(np.argmax(normed))
    peak_month = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"][peak_idx]

    return {
        "historical":      historical_rows,
        "forecast":        forecast_rows,
        "full_forecast":   full_rows,
        "seasonality":     seasonality,
        "trend_direction": "stable",
        "peak_month":      peak_month,
        "model_type":      "fallback_statistical",
        "periods":         periods,
    }


def get_fire_calendar() -> dict[str, Any]:
    """
    Compute per-month risk scores (0–100) from historical incidents.
    Returns 12 months with composite risk scores and supporting stats.
    """
    df = _load_monthly_series()
    df["month_num"] = df["ds"].dt.month

    month_names = ["January","February","March","April","May","June",
                   "July","August","September","October","November","December"]
    month_abbr  = ["Jan","Feb","Mar","Apr","May","Jun",
                   "Jul","Aug","Sep","Oct","Nov","Dec"]

    # Load richer data for HIGH severity proportions
    high_by_month: dict[int, float] = {}
    avg_acres_by_month: dict[int, float] = {}

    if RAW_PATH.exists():
        try:
            raw = pd.read_csv(RAW_PATH, usecols=["Started", "AcresBurned"],
                              low_memory=False)
            raw["Started"] = pd.to_datetime(raw["Started"], errors="coerce")
            raw = raw.dropna(subset=["Started"])
            raw["month_num"] = raw["Started"].dt.month
            raw["is_high"]   = (raw["AcresBurned"] > 10_000).astype(int)

            grp = raw.groupby("month_num").agg(
                count=("AcresBurned", "count"),
                total_acres=("AcresBurned", "sum"),
                avg_acres=("AcresBurned", "mean"),
                high_count=("is_high", "sum"),
            ).reset_index()

            for _, row in grp.iterrows():
                m = int(row["month_num"])
                avg_acres_by_month[m] = float(row["avg_acres"])
                high_by_month[m]      = float(row["high_count"] / row["count"]) if row["count"] > 0 else 0
        except Exception:
            pass

    # Monthly incident counts from series
    monthly_counts = df.groupby("month_num")["y"].mean()

    # Composite risk score: 50% incident frequency + 30% avg acres + 20% HIGH %
    count_vals  = np.array([monthly_counts.get(m+1, 0) for m in range(12)])
    acres_vals  = np.array([avg_acres_by_month.get(m+1, 0) for m in range(12)])
    high_vals   = np.array([high_by_month.get(m+1, 0) for m in range(12)])

    def norm(arr):
        mn, mx = arr.min(), arr.max()
        return (arr - mn) / (mx - mn + 1e-9) * 100

    composite = 0.5 * norm(count_vals) + 0.3 * norm(acres_vals) + 0.2 * (high_vals * 100)
    # Re-normalise composite to 0-100
    composite = norm(composite)

    def risk_label(score: float) -> str:
        if score >= 75: return "EXTREME"
        if score >= 50: return "HIGH"
        if score >= 25: return "MODERATE"
        return "LOW"

    months = []
    for i in range(12):
        m = i + 1
        score = round(float(composite[i]), 1)
        months.append({
            "month_num":   m,
            "month":       month_names[i],
            "abbr":        month_abbr[i],
            "risk_score":  score,
            "risk_label":  risk_label(score),
            "avg_incidents": round(float(count_vals[i]), 1),
            "avg_acres":     round(float(acres_vals[i]), 0),
            "pct_high":      round(float(high_vals[i]) * 100, 1),
        })

    peak = max(months, key=lambda x: x["risk_score"])
    fire_season_months = [m["month"] for m in months if m["risk_score"] >= 50]

    return {
        "months":             months,
        "peak_month":         peak["month"],
        "fire_season":        fire_season_months,
        "risk_label_thresholds": {"EXTREME": 75, "HIGH": 50, "MODERATE": 25, "LOW": 0},
    }
