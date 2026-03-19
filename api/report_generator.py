"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/report_generator.py
Purpose : Generate a professional wildfire incident report from prediction data.
          Template-based — no external API needed, works instantly, zero cost.
          Produces a report structured like a real CAL FIRE incident document.
"""

from __future__ import annotations

import datetime
import logging
import random
import string

log = logging.getLogger(__name__)

NIMS_RESOURCES = {
    "HIGH":   {"Personnel": 500, "Engines": 70,  "Helicopters": 14, "Dozers": 10, "WaterTenders": 18},
    "MEDIUM": {"Personnel": 200, "Engines": 28,  "Helicopters": 5,  "Dozers": 4,  "WaterTenders": 7 },
    "LOW":    {"Personnel": 50,  "Engines": 8,   "Helicopters": 1,  "Dozers": 1,  "WaterTenders": 2 },
}


def _incident_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return "CA-" + datetime.datetime.now().strftime("%Y%m%d") + "-" + suffix


def _spread_estimate(pct: float, acres: int) -> str:
    if pct >= 75:   return "minimal — fire is well-contained under current conditions"
    elif pct >= 50: return f"moderate — potential 50% growth within 24 hours without resource escalation"
    elif pct >= 25: return f"high — fire may double to ~{acres*2:,} acres within 12 hours"
    elif pct >= 10: return f"critical — fire could double to ~{acres*2:,} acres within 6 hours"
    else:           return f"extreme — fire could double to ~{acres*2:,} acres within 2 hours; maximum response required"


def _resource_gap(deployed: dict, risk: str) -> tuple[str, bool]:
    """Returns (gap analysis text, has_shortfall)."""
    nims = NIMS_RESOURCES.get(risk, NIMS_RESOURCES["HIGH"])
    lines = []
    has_gap = False

    mapping = {
        "PersonnelInvolved": ("Personnel",    "Personnel"),
        "Engines":           ("Engines",      "Fire Engines"),
        "Helicopters":       ("Helicopters",  "Helicopters"),
        "Dozers":            ("Dozers",       "Bulldozers"),
        "WaterTenders":      ("WaterTenders", "Water Tenders"),
    }

    for key, (nims_key, label) in mapping.items():
        dep = int(deployed.get(key, 0))
        rec = nims[nims_key]
        if dep >= rec:
            lines.append(f"{label}: {dep} deployed ({rec} required) — ADEQUATE")
        else:
            lines.append(f"{label}: {dep} deployed ({rec} required) — SHORTFALL of {rec - dep}")
            has_gap = True

    return "\n".join(lines), has_gap


def generate_incident_report(prediction: dict) -> dict:
    """
    Generate a professional incident report from prediction data.
    Returns {success, report_text, report_html, error}.
    """
    try:
        risk      = prediction.get("risk_level",  "UNKNOWN")
        conf      = round(prediction.get("confidence", 0) * 100, 1)
        acres     = prediction.get("acres_est",   0)
        feats     = prediction.get("input_features", {})
        lat       = float(feats.get("Latitude",          39.0))
        lng       = float(feats.get("Longitude",        -122.0))
        pct       = float(feats.get("PercentContained",    0))
        personnel = int(feats.get("PersonnelInvolved",     0))
        engines   = int(feats.get("Engines",               0))
        helicopters = int(feats.get("Helicopters",         0))
        dozers    = int(feats.get("Dozers",                0))
        water     = int(feats.get("WaterTenders",          0))
        major     = bool(feats.get("MajorIncident",        0))

        iid        = _incident_id()
        timestamp  = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")
        date_only  = datetime.datetime.now().strftime("%B %d, %Y")
        time_only  = datetime.datetime.now().strftime("%H%M hours")

        nims       = {"HIGH": "Type 1 — Major Incident", "MEDIUM": "Type 3 — Extended Attack",
                      "LOW": "Type 5 — Initial Attack"}.get(risk, "Type 1")
        evac_km    = {"HIGH": 25, "MEDIUM": 10, "LOW": 5}.get(risk, 25)
        priority   = {"HIGH": "IMMEDIATE — Priority 1", "MEDIUM": "URGENT — Priority 2",
                      "LOW": "ROUTINE — Priority 3"}.get(risk, "IMMEDIATE")

        # Resource gap analysis
        gap_text, has_gap = _resource_gap(feats, risk)
        mutual_aid = "Mutual aid request recommended immediately." if has_gap else "Current deployment meets NIMS minimum standards."

        # Spread estimate
        spread = _spread_estimate(pct, acres)

        # Carbon
        co2     = acres * 200
        trees   = acres * 150
        reforest_cost = acres * 400
        prev_cost     = acres * 50
        ratio   = round(reforest_cost / prev_cost) if prev_cost else 8

        def fmt(n):
            if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
            if n >= 1_000:     return f"{n/1_000:.0f}K"
            return str(n)

        # ── Build plain text report ─────────────────────────────
        report_text = f"""GEOAI FOREST FIRE RISK INTELLIGENCE SYSTEM
OFFICIAL WILDFIRE INCIDENT REPORT
================================================================================
INCIDENT ID:     {iid}
DATE / TIME:     {date_only} / {time_only}
CLASSIFICATION:  {risk} SEVERITY | NIMS {nims}
PRIORITY:        {priority}
MAJOR INCIDENT:  {"YES" if major else "NO"}
GENERATED BY:    GeoAI ML System (Gradient Boosting · Confidence: {conf}%)
================================================================================

1. INCIDENT SUMMARY:
A wildfire incident has been detected and classified as {risk} severity by the GeoAI
Forest Fire Risk Intelligence System with {conf}% model confidence. The fire is estimated
to affect approximately {acres:,} acres and is currently {pct:.0f}% contained. Incident
coordinates are {lat:.4f}N, {abs(lng):.4f}W. This incident has been classified under
NIMS {nims} standards. {'This is a declared major incident requiring unified command.' if major else 'This incident has not been declared a major incident at this time.'}

2. SITUATION ASSESSMENT:
Current containment stands at {pct:.0f}%, with {personnel:,} personnel deployed on scene.
Spread risk is {spread}. Based on current containment rate and historical CAL FIRE
incident data, immediate resource escalation {'is strongly recommended' if pct < 25 else 'should be evaluated'}
to prevent further spread. The {evac_km}km evacuation radius has been established around
the fire centre. {'All available aerial assets should be deployed immediately.' if risk == 'HIGH' else 'Aerial assets are on standby pending assessment.'}

3. CURRENT RESOURCE DEPLOYMENT:
Personnel Involved:  {personnel:,}
Fire Engines:        {engines}
Helicopters:         {helicopters}
Bulldozers:          {dozers}
Water Tenders:       {water}

Resource adequacy vs NIMS {nims.split('—')[0].strip()} standards:
{gap_text}

{mutual_aid}

4. AI PREDICTION ANALYSIS:
The GeoAI Gradient Boosting classifier, trained on 1,636 historical California wildfire
incidents, has assessed this fire at {risk} severity with {conf}% confidence.
Class probability breakdown: LOW={prediction.get('probabilities', {}).get('LOW', 0):.1%},
MEDIUM={prediction.get('probabilities', {}).get('MEDIUM', 0):.1%},
HIGH={prediction.get('probabilities', {}).get('HIGH', 0):.1%}.
The model's primary predictive factors for this classification are geographic location,
containment percentage, and resource intensity deployed relative to fire size.
This prediction should be used as a decision-support input alongside ground truth reports.

5. RECOMMENDED IMMEDIATE ACTIONS:
{'— ACTIVATE NIMS Type 1 unified command structure without delay.' if risk == 'HIGH' else f'— Activate NIMS {nims} incident command structure.'}
— Launch aerial assets (helicopters and air tankers) for suppression and reconnaissance.
— Establish incident command post at least {evac_km}km from fire perimeter.
{'— REQUEST MUTUAL AID from adjacent county and state fire agencies immediately.' if has_gap else '— Monitor resource levels and maintain current deployment.'}
— Coordinate with CHP for evacuation route management and road closures.
— Assign dedicated Safety Officer and establish personnel accountability system.
— {'Initiate public notification and evacuation procedures for all communities within ' + str(evac_km) + 'km.' if risk in ('HIGH', 'MEDIUM') else 'Issue precautionary advisory for communities within ' + str(evac_km) + 'km.'}

6. EVACUATION AND PUBLIC SAFETY STATUS:
Mandatory evacuation order recommended for all residents within {evac_km}km of coordinates
({lat:.3f}N, {abs(lng):.3f}W). Emergency shelters should be activated at local schools,
community centres, and county fairgrounds. Wireless Emergency Alert (WEA) notifications
should be issued to all affected zip codes. Air quality monitoring is in effect —
N95 masks should be distributed at evacuation centres. Family reunification centre
to be established at primary shelter location.

7. ENVIRONMENTAL IMPACT ASSESSMENT:
Estimated CO2 release:      {fmt(co2)} tonnes
Estimated trees destroyed:  {fmt(trees)}
Trees required to offset:   {fmt(int((co2*1000)/22))} (over 1 year)
Reforestation cost est.:    ${fmt(reforest_cost)}
Prevention cost was:        ${fmt(prev_cost)} ({ratio}x less than reforestation)

Early intervention and rapid containment remain the most cost-effective and
environmentally responsible course of action. Each hour of delay compounds
both the ecological damage and the economic cost of recovery.

8. RESOURCE REQUIREMENTS AND GAPS:
{'CRITICAL RESOURCE SHORTFALL IDENTIFIED — immediate mutual aid request required.' if has_gap else 'Current deployment meets NIMS minimum resource standards.'}
Based on NIMS {nims.split('—')[0].strip()} standards for a {risk} severity incident
of approximately {acres:,} acres, the following assessment applies:
{gap_text}

9. INCIDENT COMMANDER NOTES:
This report was generated automatically by the GeoAI Forest Fire Risk Intelligence
System at {timestamp}. All data is derived from ML prediction output and should be
validated against current ground truth before operational decisions are finalised.
Incident ID {iid} should be referenced in all subsequent communications, mutual aid
requests, and after-action reviews related to this event. This system provides
decision support — final operational authority rests with the designated incident
commander in accordance with NIMS protocols.

================================================================================
END OF REPORT — INCIDENT {iid}
Generated: {timestamp}
System: GeoAI Forest Fire Risk Intelligence | Gradient Boosting ML | NIMS Standards
================================================================================"""

        # ── Build HTML version ──────────────────────────────────
        report_html = _to_html(report_text, risk, timestamp, conf, iid)

        log.info("Incident report generated — %s (%d chars)", iid, len(report_text))
        return {
            "success":     True,
            "report_text": report_text,
            "report_html": report_html,
            "error":       None,
            "skipped":     False,
        }

    except Exception as e:
        log.error("Report generation failed: %s", e)
        return {
            "success":     False,
            "report_text": None,
            "report_html": None,
            "error":       str(e),
            "skipped":     False,
        }


def _to_html(text: str, risk: str, timestamp: str, conf: float, iid: str) -> str:
    """Convert plain-text report to styled HTML."""
    color = {"HIGH": "#dc2626", "MEDIUM": "#d97706", "LOW": "#16a34a"}.get(risk, "#dc2626")

    lines = text.strip().split("\n")
    html_parts = []

    for line in lines:
        s = line.strip()
        if not s:
            html_parts.append('<div style="height:6px"></div>')
        elif s.startswith("="):
            html_parts.append(f'<div style="height:1px;background:#e2e8f0;margin:8px 0"></div>')
        elif s.startswith("GEOAI FOREST") or s.startswith("OFFICIAL WILDFIRE"):
            html_parts.append(f'<div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px">{s}</div>')
        elif s[:2].isdigit() and ". " in s[:4] and s.endswith(":"):
            html_parts.append(
                f'<div style="font-size:11px;font-weight:700;color:{color};letter-spacing:2px;'
                f'text-transform:uppercase;margin:14px 0 6px;padding-bottom:4px;'
                f'border-bottom:1px solid #e2e8f0">{s}</div>'
            )
        elif ":" in s and len(s) < 50 and s.split(":")[0].isupper():
            parts = s.split(":", 1)
            html_parts.append(
                f'<div style="display:flex;gap:8px;margin-bottom:4px">'
                f'<span style="font-size:12px;color:#64748b;min-width:180px;flex-shrink:0">{parts[0]}:</span>'
                f'<span style="font-size:12px;font-weight:600;color:#0f172a">{parts[1].strip()}</span>'
                f'</div>'
            )
        elif s.startswith("—"):
            html_parts.append(
                f'<div style="display:flex;gap:8px;margin-bottom:4px;padding-left:8px">'
                f'<span style="color:{color};font-weight:700;flex-shrink:0">→</span>'
                f'<span style="font-size:12px;color:#374151;line-height:1.5">{s[1:].strip()}</span>'
                f'</div>'
            )
        else:
            html_parts.append(
                f'<p style="margin:0 0 6px;font-size:12px;color:#374151;line-height:1.7">{s}</p>'
            )

    body = "\n".join(html_parts)

    return f"""<div style="font-family:Arial,Helvetica,sans-serif">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);padding:18px 22px;border-radius:8px 8px 0 0">
    <div style="font-size:9px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-bottom:3px">
      GeoAI Forest Fire Risk Intelligence System
    </div>
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:6px">Official Wildfire Incident Report</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap">
      <span style="font-size:11px;color:{color};font-weight:600">&#9632; {risk} SEVERITY</span>
      <span style="font-size:11px;color:#94a3b8">ID: {iid}</span>
      <span style="font-size:11px;color:#94a3b8">{timestamp}</span>
      <span style="font-size:11px;color:#94a3b8">Confidence: {conf}%</span>
    </div>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:18px 22px;border-radius:0 0 8px 8px">
    {body}
  </div>
  <div style="margin-top:10px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
    <p style="margin:0;font-size:10px;color:#94a3b8;line-height:1.6">
      &#129302; Generated by GeoAI Forest Fire Risk Intelligence System using Gradient Boosting ML
      trained on 1,636 CA wildfire incidents. NIMS standards applied. Decision-support tool only —
      final authority rests with the incident commander. Incident ID: {iid}
    </p>
  </div>
</div>"""
