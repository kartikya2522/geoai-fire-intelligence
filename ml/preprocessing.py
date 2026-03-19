"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : ml/preprocessing.py
Purpose : End-to-end preprocessing pipeline for California wildfire data.
Usage   : python ml/preprocessing.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import LabelEncoder

# ---------------------------------------------------------------------------
# Paths  (resolve relative to this file so the script works from any cwd)
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DATA_PATH = PROJECT_ROOT / "data" / "raw" / "California_Fire_Incidents.csv"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_PATH = PROCESSED_DIR / "clean_fire_data.csv"

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Columns that carry no predictive / analytical value
# ---------------------------------------------------------------------------
IRRELEVANT_COLUMNS = [
    "UniqueId",
    "CalFireIncident",
    "ConditionStatement",
    "FinalStatementPosted",
    "SearchKeywords",
    "Status",
    "Url",
    "Updated",            # meta timestamp, not a fire property
]

# Geo / coordinate columns to coerce to numeric
GEO_COLUMNS = ["Latitude", "Longitude"]

# Categorical columns to label-encode
# NOTE: raw dataset uses "Counties" — we encode it and rename to "County"
# so downstream train.py and the API use a consistent short name.
CATEGORICAL_COLUMNS = ["Counties", "ArchiveYear"]


# ---------------------------------------------------------------------------
# 1. Load
# ---------------------------------------------------------------------------
def load_dataset(path: Path) -> pd.DataFrame:
    """Load raw CSV and print basic diagnostics."""
    log.info("Loading dataset from: %s", path)
    if not path.exists():
        raise FileNotFoundError(f"Raw data file not found: {path}")

    df = pd.read_csv(path, low_memory=False)

    log.info("Dataset shape      : %s rows × %s columns", *df.shape)
    log.info("Column names:\n  %s", "\n  ".join(df.columns.tolist()))
    return df


# ---------------------------------------------------------------------------
# 2. Remove duplicates
# ---------------------------------------------------------------------------
def remove_duplicates(df: pd.DataFrame) -> pd.DataFrame:
    """Drop exact duplicate rows and report how many were removed."""
    before = len(df)
    df = df.drop_duplicates()
    removed = before - len(df)
    log.info("Duplicate rows removed : %d  (rows remaining: %d)", removed, len(df))
    return df


# ---------------------------------------------------------------------------
# 3. Drop irrelevant columns
# ---------------------------------------------------------------------------
def drop_irrelevant_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove columns that are identifiers or carry no analytical value."""
    cols_to_drop = [c for c in IRRELEVANT_COLUMNS if c in df.columns]
    df = df.drop(columns=cols_to_drop)
    log.info("Irrelevant columns dropped : %s", cols_to_drop)
    return df


# ---------------------------------------------------------------------------
# 4. Handle missing values
# ---------------------------------------------------------------------------
def handle_missing_values(df: pd.DataFrame) -> pd.DataFrame:
    """
    Impute missing values:
      - Numerical columns  → median
      - Categorical columns → most frequent (mode)
    """
    num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    # Numerical → median
    for col in num_cols:
        n_missing = df[col].isna().sum()
        if n_missing:
            median_val = df[col].median()
            df[col] = df[col].fillna(median_val)
            log.info("  [NUM ] %-30s → filled %4d NaN with median (%.4f)",
                     col, n_missing, median_val)

    # Categorical → mode
    for col in cat_cols:
        n_missing = df[col].isna().sum()
        if n_missing:
            mode_val = df[col].mode(dropna=True)
            fill_val = mode_val.iloc[0] if not mode_val.empty else "Unknown"
            df[col] = df[col].fillna(fill_val)
            log.info("  [CAT ] %-30s → filled %4d NaN with mode ('%s')",
                     col, n_missing, fill_val)

    # Columns that are entirely NaN (like StructuresEvacuated) get 0
    # — median of an all-NaN column is NaN, so we clean them up here.
    all_nan_cols = [c for c in df.columns if df[c].isna().all()]
    if all_nan_cols:
        df[all_nan_cols] = df[all_nan_cols].fillna(0)
        log.info("All-NaN columns filled with 0 : %s", all_nan_cols)

    remaining = df.isna().sum().sum()
    log.info("Missing values after imputation : %d", remaining)
    return df


# ---------------------------------------------------------------------------
# 5. Convert geo columns to numeric
# ---------------------------------------------------------------------------
def convert_geo_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Coerce Latitude / Longitude to float; invalid entries become NaN → 0."""
    for col in GEO_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
            log.info("Geo column converted to numeric : %s", col)
    return df


# ---------------------------------------------------------------------------
# 6. Encode categorical variables
# ---------------------------------------------------------------------------
def encode_categorical_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Label-encode known categorical columns; skip if absent.
    'Counties' is renamed to 'County' after encoding for a consistent
    short name used by train.py and the API.
    """
    for col in CATEGORICAL_COLUMNS:
        if col not in df.columns:
            log.warning("Categorical column '%s' not found — skipping.", col)
            continue
        le = LabelEncoder()
        df[col] = le.fit_transform(df[col].astype(str))
        log.info("Label-encoded column : %s  (%d unique classes)", col,
                 len(le.classes_))

    # Rename Counties → County (consistent short name for all downstream code)
    if "Counties" in df.columns:
        df = df.rename(columns={"Counties": "County"})
        log.info("Renamed column       : Counties → County")

    return df


# ---------------------------------------------------------------------------
# 7. Outlier capping on AcresBurned (IQR method)
# ---------------------------------------------------------------------------
def cap_outliers_iqr(df: pd.DataFrame, column: str = "AcresBurned") -> pd.DataFrame:
    """
    Cap extreme outliers using the 1.5 × IQR rule.
    Values below the lower fence → lower fence.
    Values above the upper fence → upper fence.

    IMPORTANT: If IQR == 0 (column is constant, e.g. all filled with same
    median), capping is skipped entirely. Capping a zero-IQR column would
    collapse every value to a single point, destroying all signal the model
    needs to distinguish low-resource from high-resource fire incidents.
    """
    if column not in df.columns:
        log.warning("Column '%s' not found — outlier capping skipped.", column)
        return df

    q1  = df[column].quantile(0.25)
    q3  = df[column].quantile(0.75)
    iqr = q3 - q1

    if iqr == 0:
        log.warning(
            "Outlier capping on '%s' SKIPPED — IQR=0 (column has no spread, "
            "likely imputed with a single median value). Preserving variance.",
            column,
        )
        return df

    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr

    n_lower = (df[column] < lower_fence).sum()
    n_upper = (df[column] > upper_fence).sum()

    df[column] = df[column].clip(lower=lower_fence, upper=upper_fence)
    log.info(
        "Outlier capping on '%s' | IQR=%.2f | fence=[%.2f, %.2f] | "
        "capped_low=%d | capped_high=%d",
        column, iqr, lower_fence, upper_fence, n_lower, n_upper,
    )
    return df


# ---------------------------------------------------------------------------
# 8. Feature engineering
# ---------------------------------------------------------------------------
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create domain-informed derived features:

    resource_intensity      = PersonnelInvolved / (Engines + 1)
        → How many personnel are deployed per engine unit.

    suppression_power       = Helicopters + Dozers
        → Combined aerial + ground mechanical suppression assets.

    containment_efficiency  = PercentContained / (PersonnelInvolved + 1)
        → Containment gained per unit of human resource deployed.
    """
    required = {
        "resource_intensity"     : ["PersonnelInvolved", "Engines"],
        "suppression_power"      : ["Helicopters", "Dozers"],
        "containment_efficiency" : ["PercentContained", "PersonnelInvolved"],
    }

    for feature, deps in required.items():
        missing_deps = [d for d in deps if d not in df.columns]
        if missing_deps:
            log.warning(
                "Skipping '%s' — missing source columns: %s", feature, missing_deps
            )
            continue

        if feature == "resource_intensity":
            df[feature] = df["PersonnelInvolved"] / (df["Engines"] + 1)

        elif feature == "suppression_power":
            df[feature] = df["Helicopters"] + df["Dozers"]

        elif feature == "containment_efficiency":
            df[feature] = df["PercentContained"] / (df["PersonnelInvolved"] + 1)

        log.info("Engineered feature created : %s", feature)

    return df


# ---------------------------------------------------------------------------
# 9. Save processed data
# ---------------------------------------------------------------------------
def save_processed_data(df: pd.DataFrame, output_path: Path) -> None:
    """Persist the cleaned DataFrame to CSV."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    log.info("Cleaned dataset saved → %s  (%d rows × %d cols)",
             output_path, *df.shape)


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("=" * 65)
    log.info("  GeoAI Forest Fire Risk Intelligence — Preprocessing Pipeline")
    log.info("=" * 65)

    # Step 1 — Load
    df = load_dataset(RAW_DATA_PATH)

    # Step 2 — Remove duplicates
    df = remove_duplicates(df)

    # Step 3 — Drop irrelevant columns
    df = drop_irrelevant_columns(df)

    # Step 4 — Impute missing values
    df = handle_missing_values(df)

    # Step 5 — Convert geo columns
    df = convert_geo_columns(df)

    # Step 6 — Encode categoricals
    df = encode_categorical_columns(df)

    # Step 7 — Cap outliers in FEATURE columns only (never the target AcresBurned)
    # We cap PersonnelInvolved and Engines which can have extreme values that
    # would skew the engineered features without adding signal.
    for col in ["PersonnelInvolved", "Engines", "Helicopters", "WaterTenders"]:
        df = cap_outliers_iqr(df, column=col)

    # Step 8 — Engineer features
    df = engineer_features(df)

    # Step 9 — Save
    save_processed_data(df, OUTPUT_PATH)

    log.info("=" * 65)
    log.info("  Pipeline complete.")
    log.info("=" * 65)


if __name__ == "__main__":
    main()