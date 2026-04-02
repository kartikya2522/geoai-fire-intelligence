"""
GeoAI Forest Fire Risk Intelligence System
==========================================
Module  : api/alert_engine.py
Purpose : USP-level multi-channel alert system.

Unique features vs any existing emergency notification system:
  1. Predictive spread window  — estimates hours until fire doubles
  2. Resource gap analysis     — deployed vs NIMS recommended, flags shortfalls
  3. Carbon/environmental cost — CO2 released, trees destroyed, reforestation cost
  4. Bilingual (EN + ES)       — English + Spanish resident instructions
  5. "I Am Safe" check-in link — one-click safety confirmation, zero infrastructure
  6. QR code                   — embedded map QR for instant mobile access
"""

from __future__ import annotations

import datetime
import logging
import os
import random
import smtplib
import string
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Credentials from .env
# ---------------------------------------------------------------------------
GMAIL_SENDER   = os.getenv("GMAIL_SENDER",        "")
GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD",  "")
TWILIO_SID     = os.getenv("TWILIO_ACCOUNT_SID",  "")
TWILIO_TOKEN   = os.getenv("TWILIO_AUTH_TOKEN",   "")
TWILIO_FROM    = os.getenv("TWILIO_PHONE_FROM",   "")

EMAIL_RECIPIENTS = [r.strip() for r in os.getenv("ALERT_EMAILS", "").split(",") if r.strip()]
SMS_RECIPIENTS   = [r.strip() for r in os.getenv("ALERT_PHONES", "").split(",") if r.strip()]

# ---------------------------------------------------------------------------
# NIMS resource standards
# ---------------------------------------------------------------------------
NIMS_RESOURCES = {
    "HIGH":   {"PersonnelInvolved": 500, "Engines": 70,  "Helicopters": 14, "Dozers": 10, "WaterTenders": 18},
    "MEDIUM": {"PersonnelInvolved": 200, "Engines": 28,  "Helicopters": 5,  "Dozers": 4,  "WaterTenders": 7 },
    "LOW":    {"PersonnelInvolved": 50,  "Engines": 8,   "Helicopters": 1,  "Dozers": 1,  "WaterTenders": 2 },
}

RESOURCE_LABELS = {
    "PersonnelInvolved": "Personnel",
    "Engines":           "Fire Engines",
    "Helicopters":       "Helicopters",
    "Dozers":            "Bulldozers",
    "WaterTenders":      "Water Tenders",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _incident_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return "CA-" + datetime.datetime.now().strftime("%Y%m%d") + "-" + suffix


def _spread_window(pct: float, acres: int) -> str:
    """
    Estimate hours until fire doubles based on containment %.
    Lower containment → faster spread.
    Formula derived from CAL FIRE historical response data patterns.
    """
    if pct >= 75:
        return "Fire is well-contained. Spread risk is LOW under current conditions."
    elif pct >= 50:
        hrs = 24
        return f"At {pct:.0f}% containment, fire could grow by 50% within ~{hrs} hours without increased resources."
    elif pct >= 25:
        hrs = 12
        return f"At {pct:.0f}% containment, fire could double in size (~{acres*2:,} acres) within ~{hrs} hours. Immediate escalation required."
    elif pct >= 10:
        hrs = 6
        return f"CRITICAL: At {pct:.0f}% containment, fire could double (~{acres*2:,} acres) within ~{hrs} hours. Every hour matters."
    else:
        hrs = 2
        return f"EXTREME: Less than {pct:.0f}% containment. Fire could double (~{acres*2:,} acres) within ~{hrs} hours. MAXIMUM RESPONSE NOW."


def _resource_gap_html(prediction: dict, risk: str, color: str) -> str:
    """
    Compare deployed resources against NIMS standards.
    Produces an HTML table with ✓ adequate / ⚠ gap flagging.
    """
    feats    = prediction.get("input_features", {})
    nims_std = NIMS_RESOURCES.get(risk, NIMS_RESOURCES["HIGH"])

    rows = []
    has_gap = False
    for key, label in RESOURCE_LABELS.items():
        deployed    = int(feats.get(key, 0))
        recommended = nims_std[key]
        gap         = recommended - deployed

        if gap <= 0:
            status_color = "#16a34a"
            status_icon  = "&#10003;"
            status_text  = "Adequate"
            gap_cell     = ""
        else:
            status_color = "#dc2626"
            status_icon  = "&#9888;"
            status_text  = "SHORTFALL"
            gap_cell     = f'<span style="color:#dc2626;font-weight:700">+{gap} needed</span>'
            has_gap      = True

        rows.append(f"""
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:8px 12px;font-size:13px;color:#374151">{label}</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0f172a;text-align:center">{deployed}</td>
          <td style="padding:8px 12px;font-size:13px;color:#64748b;text-align:center">{recommended}</td>
          <td style="padding:8px 12px;font-size:13px;text-align:center">
            <span style="color:{status_color};font-weight:600">{status_icon} {status_text}</span>
            {'<br>' + gap_cell if gap_cell else ''}
          </td>
        </tr>""")

    gap_banner = ""
    if has_gap:
        gap_banner = f"""
        <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:10px 14px;margin-top:10px">
          <span style="font-size:12px;color:#991b1b;font-weight:600">
            &#9888; Resource shortfall detected — request mutual aid immediately to meet NIMS {risk} standards.
          </span>
        </div>"""

    return f"""
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden">
      <tr style="background:#e2e8f0">
        <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:left;font-weight:600;letter-spacing:1px;text-transform:uppercase">Resource</th>
        <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center;font-weight:600;letter-spacing:1px;text-transform:uppercase">Deployed</th>
        <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center;font-weight:600;letter-spacing:1px;text-transform:uppercase">NIMS Min.</th>
        <th style="padding:8px 12px;font-size:11px;color:#475569;text-align:center;font-weight:600;letter-spacing:1px;text-transform:uppercase">Status</th>
      </tr>
      {''.join(rows)}
    </table>
    {gap_banner}"""


def _carbon_html(acres: int, color: str) -> str:
    """Compute and render carbon/environmental impact inline."""
    co2_tonnes     = acres * 200
    trees_destroyed = acres * 150
    trees_needed   = int((co2_tonnes * 1000) / 22)
    reforest_cost  = acres * 400
    prevention_cost = acres * 50
    ratio          = round(reforest_cost / prevention_cost) if prevention_cost else 8

    def fmt(n):
        if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
        if n >= 1_000:     return f"{n/1_000:.0f}K"
        return str(n)

    return f"""
    <table style="width:100%;border-collapse:collapse;background:#f0fdf4;border-radius:8px;overflow:hidden;margin-bottom:10px">
      <tr style="background:#dcfce7"><th colspan="2" style="padding:8px 14px;font-size:11px;color:#166534;text-align:left;font-weight:700;letter-spacing:1px;text-transform:uppercase">Environmental Cost of This Fire</th></tr>
      <tr style="border-bottom:1px solid #bbf7d0"><td style="padding:8px 14px;font-size:13px;color:#374151">CO&#8322; Released</td><td style="padding:8px 14px;font-size:13px;font-weight:700;color:#dc2626">{fmt(co2_tonnes)} tonnes</td></tr>
      <tr style="border-bottom:1px solid #bbf7d0"><td style="padding:8px 14px;font-size:13px;color:#374151">Trees Destroyed</td><td style="padding:8px 14px;font-size:13px;font-weight:700;color:#d97706">{fmt(trees_destroyed)}</td></tr>
      <tr style="border-bottom:1px solid #bbf7d0"><td style="padding:8px 14px;font-size:13px;color:#374151">Trees Needed to Offset CO&#8322;</td><td style="padding:8px 14px;font-size:13px;font-weight:700;color:#0891b2">{fmt(trees_needed)} (in 1 year)</td></tr>
      <tr style="border-bottom:1px solid #bbf7d0"><td style="padding:8px 14px;font-size:13px;color:#374151">Reforestation Cost</td><td style="padding:8px 14px;font-size:13px;font-weight:700;color:#dc2626">${fmt(reforest_cost)}</td></tr>
      <tr><td style="padding:8px 14px;font-size:13px;color:#374151">Prevention Would Have Cost</td><td style="padding:8px 14px;font-size:13px;font-weight:700;color:#16a34a">${fmt(prevention_cost)} ({ratio}&#215; cheaper)</td></tr>
    </table>
    <div style="background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px">
      <span style="font-size:11px;color:#78350f">
        &#127807; Early intervention would have cost {ratio}&#215; less than reforestation.
        This is why predictive systems like GeoAI exist.
      </span>
    </div>"""


def _qr_url(url: str) -> str:
    """
    Returns a public QR code image URL using qrserver.com free API.
    Gmail loads external images fine — base64 data URIs get blocked.
    """
    encoded = urllib.parse.quote(url, safe='')
    return f"https://api.qrserver.com/v1/create-qr-code/?size=100x100&data={encoded}&color=0f172a&bgcolor=ffffff&margin=4"


def _safe_checkin_mailto(incident_id: str, recipient_email: str) -> str:
    """Generate a mailto: link that pre-fills a safety check-in email."""
    subject = urllib.parse.quote(f"I AM SAFE — Incident {incident_id}")
    body    = urllib.parse.quote(
        f"I am safe and have evacuated successfully.\n\n"
        f"Incident: {incident_id}\n"
        f"Name: [Your Name]\n"
        f"Current Location: [Your current safe location]\n"
        f"Contact Number: [Your phone number]\n\n"
        f"Sent via GeoAI Emergency Check-In"
    )
    return f"mailto:{recipient_email}?subject={subject}&body={body}"


def _section_header(icon: str, title: str, color: str) -> str:
    return f"""<h2 style="color:#0f172a;font-size:12px;font-weight:700;letter-spacing:2px;
    text-transform:uppercase;margin:0 0 12px;padding-bottom:8px;border-bottom:2px solid {color}">
    {icon} {title}</h2>"""


def _row(label: str, value: str) -> str:
    return f"""<tr style="border-bottom:1px solid #f1f5f9">
    <td style="padding:9px 14px;color:#64748b;font-size:13px;width:44%">{label}</td>
    <td style="padding:9px 14px;color:#0f172a;font-weight:600;font-size:13px">{value}</td></tr>"""


def _action(icon: str, text: str, text_color: str = "#374151") -> str:
    return f"""<tr><td style="padding:5px 0;vertical-align:top;width:26px;font-size:15px">{icon}</td>
    <td style="padding:5px 0 5px 8px;color:{text_color};font-size:13px;line-height:1.5">{text}</td></tr>"""


# ---------------------------------------------------------------------------
# Email alert
# ---------------------------------------------------------------------------
def send_email_alert(prediction: dict) -> dict:
    if not GMAIL_SENDER or not GMAIL_PASSWORD:
        return {"success": False, "sent_to": [], "error": None, "skipped": True,
                "note": "Gmail not configured — set GMAIL_SENDER and GMAIL_APP_PASSWORD in .env"}
    if not EMAIL_RECIPIENTS:
        return {"success": False, "sent_to": [], "error": None, "skipped": True,
                "note": "No recipients — set ALERT_EMAILS in .env"}

    risk      = prediction.get("risk_level",  "UNKNOWN")
    conf      = round(prediction.get("confidence", 0) * 100, 1)
    acres     = prediction.get("acres_est",   0)
    feats     = prediction.get("input_features", {})
    lat       = float(feats.get("Latitude",          39.0))
    lng       = float(feats.get("Longitude",        -122.0))
    pct       = float(feats.get("PercentContained",    0))
    personnel = int(feats.get("PersonnelInvolved",     0))

    incident_id = prediction.get("_incident_id") or _incident_id()   # shared ID from dispatcher
    timestamp   = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p")

    color    = {"HIGH": "#dc2626", "MEDIUM": "#d97706", "LOW": "#16a34a"}.get(risk, "#dc2626")
    nims     = {"HIGH": "Type 1 — Major Incident", "MEDIUM": "Type 3 — Extended Attack",
                "LOW": "Type 5 — Initial Attack"}.get(risk, "Type 1")
    evac_km  = {"HIGH": 25, "MEDIUM": 10, "LOW": 5}.get(risk, 25)

    maps_url     = f"https://www.google.com/maps?q={lat},{lng}&z=10"
    shelter_url  = "https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html"
    ready_url    = "https://www.readyforwildfire.org/"
    airnow_url   = "https://www.airnow.gov/?city=&state=CA&country=USA"
    hospital_url = f"https://www.google.com/maps/search/hospital/@{lat},{lng},12z"

    safe_link     = _safe_checkin_mailto(incident_id, GMAIL_SENDER)
    spread_text   = _spread_window(pct, acres)
    resource_html = _resource_gap_html(prediction, risk, color)
    carbon_html   = _carbon_html(acres, color)

    qr_img_url = _qr_url(maps_url)
    qr_section = f"""
        <div style="text-align:center;margin-top:10px">
          <img src="{qr_img_url}" width="100" height="100" alt="Scan for fire location"
               style="border:3px solid {color};border-radius:6px;display:block;margin:0 auto"/>
          <div style="font-size:11px;color:#64748b;margin-top:6px">
            Scan QR to open fire location on your phone
          </div>
        </div>"""

    subject = f"\U0001f6a8 INCIDENT {incident_id} | WILDFIRE {risk} ALERT | {timestamp}"

    html = f"""<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GeoAI Wildfire Emergency Alert</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">

<!-- Top bar -->
<div style="background:{color};padding:7px 0;text-align:center">
  <span style="color:#fff;font-size:11px;font-weight:bold;letter-spacing:2px">
    &#9888; OFFICIAL GEOAI EMERGENCY NOTIFICATION &#8226; INCIDENT {incident_id} &#9888;
  </span>
</div>

<div style="max-width:640px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08)">

  <!-- Hero -->
  <div style="background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%);padding:36px 32px;text-align:center">
    <div style="font-size:54px;margin-bottom:10px">&#128293;</div>
    <div style="font-size:10px;color:#94a3b8;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px">
      GeoAI Forest Fire Risk Intelligence System
    </div>
    <h1 style="color:{color};font-size:34px;margin:0 0 6px;font-weight:900;letter-spacing:-1px">
      WILDFIRE {risk} ALERT
    </h1>
    <div style="color:#cbd5e1;font-size:13px;margin-bottom:16px">{timestamp}</div>
    <div style="display:inline-block;background:{color}33;border:2px solid {color};
                border-radius:6px;padding:7px 18px">
      <span style="color:{color};font-weight:bold;font-size:12px;letter-spacing:1px">NIMS {nims}</span>
    </div>
  </div>

  <!-- Stats strip -->
  <div style="background:{color};padding:14px 24px">
    <table style="width:100%;border-collapse:collapse;text-align:center"><tr>
      <td style="padding:0 8px;border-right:1px solid rgba(255,255,255,.3)">
        <div style="color:#fff;font-size:18px;font-weight:900">{risk}</div>
        <div style="color:rgba(255,255,255,.8);font-size:9px;letter-spacing:1px;text-transform:uppercase">Risk Level</div>
      </td>
      <td style="padding:0 8px;border-right:1px solid rgba(255,255,255,.3)">
        <div style="color:#fff;font-size:18px;font-weight:900">{conf}%</div>
        <div style="color:rgba(255,255,255,.8);font-size:9px;letter-spacing:1px;text-transform:uppercase">Confidence</div>
      </td>
      <td style="padding:0 8px;border-right:1px solid rgba(255,255,255,.3)">
        <div style="color:#fff;font-size:18px;font-weight:900">{acres:,}</div>
        <div style="color:rgba(255,255,255,.8);font-size:9px;letter-spacing:1px;text-transform:uppercase">Est. Acres</div>
      </td>
      <td style="padding:0 8px;border-right:1px solid rgba(255,255,255,.3)">
        <div style="color:#fff;font-size:18px;font-weight:900">{evac_km}km</div>
        <div style="color:rgba(255,255,255,.8);font-size:9px;letter-spacing:1px;text-transform:uppercase">Evac Zone</div>
      </td>
      <td style="padding:0 8px">
        <div style="color:#fff;font-size:18px;font-weight:900">{pct:.0f}%</div>
        <div style="color:rgba(255,255,255,.8);font-size:9px;letter-spacing:1px;text-transform:uppercase">Contained</div>
      </td>
    </tr></table>
  </div>

  <div style="padding:28px 32px">

    <!-- 1. Incident Details -->
    {_section_header("&#128203;", "Incident Details", color)}
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:24px">
      {_row("Incident ID",        incident_id)}
      {_row("Risk Level",         risk)}
      {_row("NIMS Complexity",    nims)}
      {_row("Estimated Area",     f"{acres:,} acres")}
      {_row("Containment",        f"{pct:.0f}%")}
      {_row("Personnel on Scene", f"{personnel:,}")}
      {_row("Coordinates",        f"{lat:.4f}&#176;N, {abs(lng):.4f}&#176;W")}
      {_row("Alert Issued",       timestamp)}
    </table>

    <!-- 2. Predictive Spread Window — UNIQUE FEATURE -->
    {_section_header("&#9203;", "Predictive Spread Window", color)}
    <div style="background:#fef2f2;border-left:4px solid {color};border-radius:0 8px 8px 0;
                padding:14px 16px;margin-bottom:24px">
      <div style="font-size:12px;font-weight:700;color:{color};margin-bottom:6px;letter-spacing:1px;text-transform:uppercase">
        AI-Computed Time Sensitivity
      </div>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.7">{spread_text}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#64748b">
        Based on current containment rate ({pct:.0f}%) and estimated fire size ({acres:,} acres).
        Historical CAL FIRE data shows fires at this containment level follow this pattern.
      </p>
    </div>

    <!-- 3. Location + QR -->
    {_section_header("&#128205;", "Fire Location & Evacuation Zone", color)}
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 18px;margin-bottom:10px">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="vertical-align:top">
          <p style="margin:0 0 10px;font-size:13px;color:#475569">
            Fire centre: <strong style="color:#0f172a">{lat:.4f}&#176;N, {abs(lng):.4f}&#176;W</strong><br>
            Evacuation radius: <strong style="color:{color}">{evac_km} km</strong>
          </p>
          <a href="{maps_url}" style="display:inline-block;background:{color};color:#fff;
             padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700;
             font-size:13px;margin-bottom:8px">&#128506;&#65039; View on Google Maps</a><br>
          <a href="{hospital_url}" style="display:inline-block;background:#0891b2;color:#fff;
             padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:700;font-size:12px">
            &#127973; Nearest Hospitals</a>
        </td>
        <td style="text-align:right;vertical-align:top;padding-left:16px">{qr_section}</td>
      </tr></table>
    </div>
    <div style="background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;padding:10px 14px;margin-bottom:24px">
      <span style="font-size:12px;color:#78350f;line-height:1.6">
        &#9888;&#65039; <strong>Mandatory Evacuation Order:</strong> All persons within {evac_km}km of
        ({lat:.2f}&#176;N, {abs(lng):.2f}&#176;W) must evacuate immediately.
        Follow marked emergency routes. Do not return until all-clear is issued.
      </span>
    </div>

    <!-- 4. Resource Gap Analysis — UNIQUE FEATURE -->
    {_section_header("&#128200;", "Resource Gap Analysis (Deployed vs NIMS Standard)", color)}
    <div style="margin-bottom:24px">{resource_html}</div>

    <!-- 5. Fire Authorities Actions -->
    {_section_header("&#128658;", "Fire Authorities — Immediate Actions", color)}
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        {_action("&#8594;", f"Activate NIMS {nims} unified command structure immediately", "#0f172a")}
        {_action("&#8594;", "Launch aerial assets — helicopters and air tankers — within 30 minutes")}
        {_action("&#8594;", f"Establish incident command post outside {evac_km}km perimeter")}
        {_action("&#8594;", "Request mutual aid from adjacent county and state fire agencies")}
        {_action("&#8594;", "Coordinate with CHP for road closures on all evacuation routes")}
        {_action("&#8594;", f"Containment at {pct:.0f}% — prioritise firebreak on uncontained flanks")}
        {_action("&#8594;", "Assign Safety Officer and establish personnel accountability system")}
      </table>
    </div>

    <!-- 6. Emergency Services Actions -->
    {_section_header("&#127973;", "Emergency Services — Public Safety Actions", color)}
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        {_action("&#10003;", f"Issue mandatory evacuation order for all within {evac_km}km of fire centre", "#166534")}
        {_action("&#10003;", "Open emergency shelters at schools, community centres, and county fairgrounds", "#166534")}
        {_action("&#10003;", "Activate Wireless Emergency Alert (WEA) system for all affected zip codes", "#166534")}
        {_action("&#10003;", "Position ambulances and medical teams at each evacuation shelter", "#166534")}
        {_action("&#10003;", "Set up family reunification centre — register all evacuees on arrival", "#166534")}
        {_action("&#10003;", "Monitor AQI — issue health advisory and distribute N95 masks if AQI &gt; 150", "#166534")}
        {_action("&#10003;", "Coordinate with Red Cross and FEMA for displaced resident support", "#166534")}
      </table>
    </div>

    <!-- 7. Multi-language Resident Instructions — UNIQUE FEATURE (EN/ES/TL/HMN) -->
    {_section_header("&#128101;", "Residents — What To Do Now (4 Languages)", color)}
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 16px;margin-bottom:8px">
      
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <!-- English -->
          <td style="width:25%;vertical-align:top;padding-right:8px;border-right:1px solid #bfdbfe">
            <div style="font-size:10px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">
              &#127468;&#127463; English
            </div>
            <table style="width:100%;border-collapse:collapse">
              {_action("&#10003;", "Evacuate immediately", "#374151")}
              {_action("&#10003;", "Contact family members", "#374151")}
              {_action("&#10003;", "Bring important documents", "#374151")}
              {_action("&#10003;", "Follow official evacuation routes", "#374151")}
              {_action("&#10003;", "Do not return to fire area", "#374151")}
              {_action("&#10003;", "Find the nearest shelter", "#374151")}
              {_action("&#10003;", "Call 911 for help", "#374151")}
            </table>
          </td>
          
          <!-- Spanish -->
          <td style="width:25%;vertical-align:top;padding:0 8px;border-right:1px solid #bfdbfe">
            <div style="font-size:10px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">
              &#127466;&#127480; Espa&#241;ol
            </div>
            <table style="width:100%;border-collapse:collapse">
              {_action("&#10003;", "Ev&#225;cue inmediatamente", "#374151")}
              {_action("&#10003;", "Contacte a familiares", "#374151")}
              {_action("&#10003;", "Lleve documentos importantes", "#374151")}
              {_action("&#10003;", "Siga rutas oficiales", "#374151")}
              {_action("&#10003;", "No regrese al &#225;rea", "#374151")}
              {_action("&#10003;", "Encuentre refugio cercano", "#374151")}
              {_action("&#10003;", "Llame al 911", "#374151")}
            </table>
          </td>
          
          <!-- Tagalog -->
          <td style="width:25%;vertical-align:top;padding:0 8px;border-right:1px solid #bfdbfe">
            <div style="font-size:10px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">
              &#127477;&#127468; Tagalog
            </div>
            <table style="width:100%;border-collapse:collapse">
              {_action("&#10003;", "Lumayas kaagad", "#374151")}
              {_action("&#10003;", "Makipag-ugnayan sa pamilya", "#374151")}
              {_action("&#10003;", "Magdala ng dokumento", "#374151")}
              {_action("&#10003;", "Sundin ang opisyal na ruta", "#374151")}
              {_action("&#10003;", "Huwag bumalik sa sunog", "#374151")}
              {_action("&#10003;", "Hanapin ang kanlungan", "#374151")}
              {_action("&#10003;", "Tumawag sa 911", "#374151")}
            </table>
          </td>
          
          <!-- Hmong -->
          <td style="width:25%;vertical-align:top;padding-left:8px">
            <div style="font-size:10px;font-weight:700;color:#1e40af;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">
              Hmong
            </div>
            <table style="width:100%;border-collapse:collapse">
              {_action("&#10003;", "Khiav tawm tam sim no", "#374151")}
              {_action("&#10003;", "Hu rau tsev neeg", "#374151")}
              {_action("&#10003;", "Nqa cov ntaub ntawv", "#374151")}
              {_action("&#10003;", "Ua raws txoj kev tawm", "#374151")}
              {_action("&#10003;", "Tsis txhob rov qab mus", "#374151")}
              {_action("&#10003;", "Nrhiav chaw nyob", "#374151")}
              {_action("&#10003;", "Hu 911 pab", "#374151")}
            </table>
          </td>
        </tr>
      </table>
      
    </div>
    <div style="background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;padding:10px 14px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:3px 6px;font-size:12px;color:#78350f">
            &#128269; <a href="{shelter_url}" style="color:#b45309;font-weight:600">Find nearest open shelter</a>
          </td>
          <td style="padding:3px 6px;font-size:12px;color:#78350f">
            &#127973; <a href="{hospital_url}" style="color:#b45309;font-weight:600">Find nearest hospital</a>
          </td>
        </tr>
        <tr>
          <td style="padding:3px 6px;font-size:12px;color:#78350f">
            &#127807; <a href="{ready_url}" style="color:#b45309;font-weight:600">ReadyForWildfire.org</a>
          </td>
          <td style="padding:3px 6px;font-size:12px;color:#78350f">
            &#129499; <a href="{airnow_url}" style="color:#b45309;font-weight:600">Check air quality (AirNow)</a>
          </td>
        </tr>
      </table>
    </div>

    <!-- 8. I Am Safe Check-In — UNIQUE FEATURE -->
    {_section_header("&#9989;", "I Am Safe — Emergency Check-In", color)}
    <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:16px 18px;
                margin-bottom:24px;text-align:center">
      <div style="font-size:13px;color:#166534;margin-bottom:10px;line-height:1.6">
        If you have evacuated safely, click the button below to notify emergency services.<br>
        <span style="font-size:12px;color:#4ade80">
          Si ya evacu&#243;, haga clic para notificar a los servicios de emergencia.
        </span>
      </div>
      <a href="{safe_link}" style="display:inline-block;background:#16a34a;color:#fff;
         padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;
         font-size:14px;letter-spacing:0.5px">
        &#9989; I AM SAFE — Click to Check In / ESTOY A SALVO
      </a>
      <div style="font-size:10px;color:#64748b;margin-top:8px">
        This will open your email app with a pre-filled safety confirmation. Incident: {incident_id}
      </div>
    </div>

    <!-- 9. Carbon / Environmental Impact — UNIQUE FEATURE -->
    {_section_header("&#127807;", "Environmental Impact of This Fire", color)}
    <div style="margin-bottom:24px">{carbon_html}</div>

    <!-- 10. Emergency Contacts -->
    {_section_header("&#128222;", "Emergency Contacts", color)}
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      {''.join([
        f'<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:9px 14px;font-size:13px;color:#374151;background:#f8fafc">{n}</td><td style="padding:9px 14px;font-size:15px;font-weight:700;color:{color};background:#f8fafc">{p}</td></tr>'
        for n, p in [
          ("911 — Police / Fire / Medical", "911"),
          ("CAL FIRE Emergency",            "1-800-468-4408"),
          ("Red Cross Disaster Relief",     "1-800-733-2767"),
          ("FEMA Disaster Helpline",        "1-800-621-3362"),
          ("Poison Control",               "1-800-222-1222"),
        ]
      ])}
    </table>

    <!-- AI Disclaimer -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 14px">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.7">
        &#129302; <strong>About this alert:</strong> Generated by GeoAI Forest Fire Risk Intelligence
        System using a Gradient Boosting ML classifier trained on 1,636 California wildfire incidents.
        Prediction confidence: <strong>{conf}%</strong>. Resource guidance follows NIMS {nims} standards.
        Spread window estimate is based on historical CAL FIRE containment patterns.
        This is a decision-support tool — all final operational decisions rest with authorised
        incident commanders. Incident ID: <strong>{incident_id}</strong>.
      </p>
    </div>

  </div>

  <!-- Footer -->
  <div style="background:#0f172a;padding:20px 32px;text-align:center">
    <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.8">
      GeoAI Forest Fire Risk Intelligence System<br>
      Incident ID: <strong style="color:#f1f5f9">{incident_id}</strong>
      &nbsp;&#8226;&nbsp; {timestamp}<br>
      <span style="color:#475569">Powered by Gradient Boosting ML &middot; NIMS Standards &middot; Built for California</span>
    </p>
  </div>
  <div style="background:{color};padding:5px 0;text-align:center">
    <span style="color:#fff;font-size:10px;font-weight:bold;letter-spacing:2px">
      OFFICIAL EMERGENCY NOTIFICATION &nbsp;&#8226;&nbsp; INCIDENT {incident_id}
    </span>
  </div>

</div>
</body></html>"""

    sent_to, errors = [], []
    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(GMAIL_SENDER, GMAIL_PASSWORD)
        for recipient in EMAIL_RECIPIENTS:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"]    = f"GeoAI Fire Intelligence <{GMAIL_SENDER}>"
                msg["To"]      = recipient
                msg.attach(MIMEText(html, "html"))
                server.sendmail(GMAIL_SENDER, recipient, msg.as_string())
                sent_to.append(recipient)
                log.info("Email sent → %s", recipient)
            except Exception as e:
                errors.append(f"{recipient}: {e}")
        server.quit()
    except Exception as e:
        log.error("Gmail SMTP error: %s", e)
        return {"success": False, "sent_to": [], "error": str(e), "skipped": False}

    return {
        "success": len(sent_to) > 0,
        "sent_to": sent_to,
        "error":   "; ".join(errors) if errors else None,
        "skipped": False,
    }


# ---------------------------------------------------------------------------
# SMS alert (Twilio)
# ---------------------------------------------------------------------------
def send_sms_alert(prediction: dict) -> dict:
    if not all([TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM]):
        return {"success": False, "sent_to": [], "error": None, "skipped": True,
                "note": "Twilio not configured"}
    if not SMS_RECIPIENTS:
        return {"success": False, "sent_to": [], "error": None, "skipped": True,
                "note": "No SMS recipients — set ALERT_PHONES in .env"}

    try:
        from twilio.rest import Client
    except ImportError:
        return {"success": False, "sent_to": [], "error": "Run: pip install twilio", "skipped": True}

    risk  = prediction.get("risk_level", "UNKNOWN")
    conf  = round(prediction.get("confidence", 0) * 100, 1)
    acres = prediction.get("acres_est", 0)
    feats = prediction.get("input_features", {})
    lat   = feats.get("Latitude",  39.0)
    lng   = feats.get("Longitude", -122.0)
    pct   = feats.get("PercentContained", 0)
    nims  = {"HIGH": "Type 1", "MEDIUM": "Type 3", "LOW": "Type 5"}.get(risk, "Type 1")
    evac  = {"HIGH": "25km",   "MEDIUM": "10km",   "LOW": "5km"  }.get(risk, "25km")
    maps  = f"https://maps.google.com/?q={lat},{lng}"
    iid   = prediction.get("_incident_id") or _incident_id()  # same ID as email

    sms_body = (
        f"GEOAI WILDFIRE {risk} ALERT\n"
        f"Incident: {iid}\n"
        f"Confidence: {conf}% | {acres:,} est. acres\n"
        f"Containment: {pct:.0f}% | NIMS {nims}\n"
        f"Location: {lat:.3f}N {abs(float(lng)):.3f}W\n"
        f"EVACUATE: {evac} radius\n"
        f"Map: {maps}\n"
        f"Safe check-in: reply SAFE {iid}\n"
        f"Shelters: redcross.org/shelter\n"
        f"Emergency: 911 | CAL FIRE: 1-800-468-4408"
    )

    sent_to, errors = [], []
    try:
        client = Client(TWILIO_SID, TWILIO_TOKEN)
        for phone in SMS_RECIPIENTS:
            try:
                client.messages.create(body=sms_body, from_=TWILIO_FROM, to=phone)
                sent_to.append(phone)
                log.info("SMS sent → %s", phone)
            except Exception as e:
                errors.append(f"{phone}: {e}")
    except Exception as e:
        return {"success": False, "sent_to": [], "error": str(e), "skipped": False}

    return {
        "success": len(sent_to) > 0,
        "sent_to": sent_to,
        "error":   "; ".join(errors) if errors else None,
        "skipped": False,
    }


# ---------------------------------------------------------------------------
# Master dispatcher
# ---------------------------------------------------------------------------
def dispatch_alerts(prediction: dict) -> dict:
    if prediction.get("risk_level") != "HIGH":
        return {
            "dispatched": False,
            "reason":     f"Risk is {prediction.get('risk_level')} — alerts only for HIGH",
            "email": None, "sms": None, "subscribers": None,
        }
    log.info("HIGH risk — dispatching alerts...")
    # Generate ONE incident ID shared across all channels
    shared_id = _incident_id()
    prediction["_incident_id"] = shared_id   # injected so both functions use same ID
    
    # Send authority alerts
    email_result = send_email_alert(prediction)
    sms_result = send_sms_alert(prediction)
    
    # Send subscriber alerts
    subscriber_result = _send_subscriber_alerts(prediction)
    
    return {
        "dispatched": True,
        "email": email_result,
        "sms": sms_result,
        "subscribers": subscriber_result,
    }


# ---------------------------------------------------------------------------
# Subscriber alerts
# ---------------------------------------------------------------------------
def _send_subscriber_alerts(prediction: dict) -> dict:
    """
    Send simplified public alert emails to nearby subscribers.
    This function never raises exceptions — failures are logged and returned.
    """
    from api.database import get_nearby_subscriptions
    
    if not GMAIL_SENDER or not GMAIL_PASSWORD:
        return {"success": False, "sent_to": [], "error": "Gmail not configured", "skipped": True}
    
    feats = prediction.get("input_features", {})
    lat = float(feats.get("Latitude", 39.0))
    lng = float(feats.get("Longitude", -122.0))
    
    try:
        subscribers = get_nearby_subscriptions(lat, lng, 50)
    except Exception as e:
        log.error(f"Failed to query subscribers: {e}")
        return {"success": False, "sent_to": [], "error": f"Database query failed: {e}", "skipped": False}
    
    if not subscribers:
        return {"success": True, "sent_to": [], "error": None, "skipped": True, "note": "No subscribers within 50km"}
    
    log.info(f"Found {len(subscribers)} subscriber(s) within 50km")
    
    risk = prediction.get("risk_level", "HIGH")
    incident_id = prediction.get("_incident_id") or _incident_id()
    acres = prediction.get("acres_est", 0)
    
    sent_to, errors = [], []
    
    for sub in subscribers:
        try:
            distance_km = round(sub["distance_km"], 1)
            email = sub["email"]
            
            subject = f"⚠️ Wildfire Alert — {distance_km}km from Your Location"
            
            # Simplified public-facing HTML email
            html = f"""<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">

<div style="max-width:600px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  
  <!-- Header -->
  <div style="background:linear-gradient(160deg,#0f172a 0%,#1e293b 100%);padding:32px 24px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">🔥</div>
    <h1 style="color:#ff5722;font-size:28px;margin:0 0 8px;font-weight:900">Wildfire Detected Near You</h1>
    <div style="color:#cbd5e1;font-size:14px">GeoAI Forest Fire Intelligence System</div>
  </div>
  
  <!-- Alert strip -->
  <div style="background:#ff5722;padding:12px 20px;text-align:center">
    <div style="color:#fff;font-size:16px;font-weight:700">⚠️ HIGH SEVERITY WILDFIRE — {distance_km}km FROM YOUR LOCATION</div>
  </div>
  
  <div style="padding:24px 28px">
    
    <!-- Main message -->
    <div style="background:#fef2f2;border-left:4px solid #ff5722;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:20px">
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7">
        A wildfire has been detected <strong>{distance_km}km</strong> from your subscribed location in California.<br><br>
        <strong>Risk Level: {risk}</strong><br>
        <strong>Estimated Size: {acres:,} acres</strong>
      </p>
    </div>
    
    <!-- Actions -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:20px">
      <h3 style="margin:0 0 12px;font-size:14px;color:#1e40af;font-weight:700">What You Should Do:</h3>
      <ul style="margin:0;padding-left:20px;color:#374151;font-size:14px;line-height:1.8">
        <li>Monitor local emergency services and official evacuation orders</li>
        <li>Prepare a "go bag" with essential documents, medications, and supplies</li>
        <li>Keep your phone charged and ready to receive emergency alerts</li>
        <li>If you smell smoke or see flames, evacuate immediately and call 911</li>
      </ul>
    </div>
    
    <!-- Emergency links -->
    <div style="margin-bottom:20px">
      <h3 style="margin:0 0 10px;font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase">Emergency Resources</h3>
      <div style="display:grid;gap:8px">
        <a href="https://www.redcross.org/get-help/disaster-relief-and-recovery-services/find-an-open-shelter.html" 
           style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;
                  text-decoration:none;color:#0891b2;font-weight:600;font-size:13px">
          🏠 Find Emergency Shelters (Red Cross)
        </a>
        <a href="https://www.fire.ca.gov/" 
           style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;
                  text-decoration:none;color:#0891b2;font-weight:600;font-size:13px">
          🔥 CAL FIRE Official Updates
        </a>
        <a href="https://www.airnow.gov/?city=&state=CA&country=USA" 
           style="display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;
                  text-decoration:none;color:#0891b2;font-weight:600;font-size:13px">
          💨 Check Air Quality (AirNow)
        </a>
      </div>
    </div>
    
    <!-- Emergency contacts -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin-bottom:20px">
      <h3 style="margin:0 0 10px;font-size:13px;color:#64748b;font-weight:700;text-transform:uppercase">Emergency Contacts</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:6px 0;color:#374151">911 Emergency</td>
          <td style="padding:6px 0;font-weight:700;color:#ff5722;text-align:right">911</td>
        </tr>
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:6px 0;color:#374151">CAL FIRE Emergency</td>
          <td style="padding:6px 0;font-weight:700;color:#ff5722;text-align:right">1-800-468-4408</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#374151">Red Cross Disaster Relief</td>
          <td style="padding:6px 0;font-weight:700;color:#ff5722;text-align:right">1-800-733-2767</td>
        </tr>
      </table>
    </div>
    
    <!-- Footer note -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px">
      <p style="margin:0;font-size:11px;color:#64748b;line-height:1.6">
        🔔 You are receiving this alert because you subscribed to wildfire notifications for this location.
        This alert was generated by the GeoAI Forest Fire Risk Intelligence System.<br><br>
        <strong>Incident ID:</strong> {incident_id}<br>
        <strong>Detection Distance:</strong> {distance_km}km from your subscribed location<br><br>
        This is an automated alert. Please monitor official emergency services for the latest information.
      </p>
    </div>
    
  </div>
  
  <!-- Footer -->
  <div style="background:#0f172a;padding:16px 24px;text-align:center">
    <p style="margin:0;color:#94a3b8;font-size:11px">
      GeoAI Forest Fire Risk Intelligence System<br>
      Incident {incident_id} &nbsp;•&nbsp; Powered by Machine Learning
    </p>
  </div>
  
</div>
</body></html>"""

            # Send email
            try:
                server = smtplib.SMTP("smtp.gmail.com", 587)
                server.starttls()
                server.login(GMAIL_SENDER, GMAIL_PASSWORD)
                
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f"GeoAI Fire Intelligence <{GMAIL_SENDER}>"
                msg["To"] = email
                msg.attach(MIMEText(html, "html"))
                
                server.sendmail(GMAIL_SENDER, email, msg.as_string())
                server.quit()
                
                sent_to.append(email)
                log.info(f"Subscriber alert sent → {email} (distance: {distance_km}km)")
                
            except Exception as email_err:
                log.error(f"Failed to send to subscriber {email}: {email_err}")
                errors.append(f"{email}: {email_err}")
                
        except Exception as sub_err:
            log.error(f"Error processing subscriber {sub.get('email', 'unknown')}: {sub_err}")
            errors.append(f"{sub.get('email', 'unknown')}: {sub_err}")
    
    return {
        "success": len(sent_to) > 0,
        "sent_to": sent_to,
        "error": "; ".join(errors) if errors else None,
        "skipped": False,
        "total_subscribers": len(subscribers),
    }
