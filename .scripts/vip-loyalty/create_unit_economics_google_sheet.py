#!/usr/bin/env python3
"""
Create or update a Google Spreadsheet for VIP Loyalty v1 unit economics.

The spreadsheet is intentionally formula-driven: assumptions live in Inputs,
calculations reference those cells, and checks surface where the assignment
data is inconsistent or where offer economics fail guardrails.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROJECT_DIR = REPO / "04-Projects" / "VIP_Loyalty_Test_Assignment"
SHEET_ID_FILE = PROJECT_DIR / "google_unit_economics_sheet_id.txt"
PRODUCT_GOOGLE_DOC_URL = "https://docs.google.com/document/d/1zE_V-hSzDe2uojRzehyjo2X3GYJabCkFsE3r6qK0EfY/edit?tab=t.0"
UNIT_ECONOMICS_GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1kt0XCMAiAEywLMNIlehPdGV98UWh-glqiDjNB0kdwv0/edit?usp=drivesdk"

SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/spreadsheets",
]

SHEET_TITLES = [
    "README",
    "Inputs",
    "Segments",
    "Offers",
    "Budget_Checks",
    "Scenarios",
    "Data_Checks",
]

OBSOLETE_SHEET_TITLES = [
    "KPI_Map",
]


def credentials_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_CREDENTIALS_PATH") or os.environ.get("GOOGLE_CALENDAR_CREDENTIALS_PATH")
    if path:
        return Path(path).expanduser()
    return REPO / "Credentials" / "personal" / "credentials.json"


def token_path() -> Path:
    path = os.environ.get("GOOGLE_DRIVE_TOKEN_PATH")
    if path:
        return Path(path).expanduser()
    return credentials_path().parent / "google_drive_token.json"


def get_credentials():
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow

    creds_path = credentials_path()
    tok_path = token_path()
    if not creds_path.exists():
        raise FileNotFoundError(f"Missing Google OAuth credentials: {creds_path}")

    creds = None
    if tok_path.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(tok_path), SCOPES)
        except Exception as exc:
            print(f"Warning: could not load existing token: {exc}", file=sys.stderr)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                creds = None
        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
            creds = flow.run_local_server(port=0)
        tok_path.parent.mkdir(parents=True, exist_ok=True)
        tok_path.write_text(creds.to_json(), encoding="utf-8")

    return creds


def read_existing_sheet_id() -> str | None:
    env_value = os.environ.get("VIP_UNIT_ECONOMICS_SHEET_ID", "").strip()
    if env_value:
        return env_value
    if SHEET_ID_FILE.exists():
        text = SHEET_ID_FILE.read_text(encoding="utf-8").strip()
        return text or None
    return None


def write_sheet_id(sheet_id: str) -> None:
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    SHEET_ID_FILE.write_text(f"{sheet_id}\n", encoding="utf-8")


def make_services():
    from googleapiclient.discovery import build

    creds = get_credentials()
    return (
        build("sheets", "v4", credentials=creds),
        build("drive", "v3", credentials=creds),
    )


def create_or_load_spreadsheet(sheets_service) -> str:
    sheet_id = read_existing_sheet_id()
    if sheet_id:
        return sheet_id

    body = {
        "properties": {
            "title": "VIP Loyalty v1 - Unit Economics Model",
            "locale": "en_US",
            "autoRecalc": "ON_CHANGE",
        },
        "sheets": [{"properties": {"title": title}} for title in SHEET_TITLES],
    }
    created = sheets_service.spreadsheets().create(body=body, fields="spreadsheetId").execute()
    sheet_id = created["spreadsheetId"]
    write_sheet_id(sheet_id)
    return sheet_id


def sheet_metadata(sheets_service, spreadsheet_id: str) -> dict[str, int]:
    meta = sheets_service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    return {s["properties"]["title"]: s["properties"]["sheetId"] for s in meta["sheets"]}


def ensure_sheets(sheets_service, spreadsheet_id: str) -> dict[str, int]:
    existing = sheet_metadata(sheets_service, spreadsheet_id)
    requests = []
    for title in SHEET_TITLES:
        if title not in existing:
            requests.append({"addSheet": {"properties": {"title": title}}})
    for title in OBSOLETE_SHEET_TITLES:
        if title in existing:
            requests.append({"deleteSheet": {"sheetId": existing[title]}})
    if requests:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": requests},
        ).execute()
    existing = sheet_metadata(sheets_service, spreadsheet_id)
    if "Sheet1" in existing and "Sheet1" not in SHEET_TITLES:
        sheets_service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"deleteSheet": {"sheetId": existing["Sheet1"]}}]},
        ).execute()
        existing = sheet_metadata(sheets_service, spreadsheet_id)
    return existing


def update_values(sheets_service, spreadsheet_id: str) -> None:
    values = {
        "README!A1:D13": [
            ["VIP Loyalty v1 - Unit Economics Model", "", "", ""],
            ["Purpose", "Test if VIP offer economics work under documented caps, P(save), and budget constraints.", "", ""],
            ["How to use", "Edit blue input cells in Inputs, Segments, and Offers. Formula cells recalculate automatically.", "", ""],
            ["Offers tab", "The five offer rows are an economic test matrix, not a promise to launch all five in v1.", "", ""],
            ["Important", "This model exposes one critical issue: the assignment average deposit and highroller assumptions conflict if treated as the same population.", "", ""],
            ["Source doc", PRODUCT_GOOGLE_DOC_URL, "Includes unit economics appendix", ""],
            ["Unit economics spreadsheet", UNIT_ECONOMICS_GOOGLE_SHEET_URL, "", ""],
            ["Core formula", "Expected Value = P(save) * ExpectedNGR_if_saved - VIPCost", "", ""],
            ["Offer approval", "Expected Value >= $100, Expected Value / VIPCost >= 20%, VIPCost within caps.", "", ""],
            ["Budget logic", "Budget_Checks and Scenarios include only rows marked Included in v1 plan = TRUE.", "", ""],
            ["Main outputs", "Budget_Checks, Scenarios, Data_Checks", "", ""],
            ["Color convention", "Blue text = hardcoded editable assumptions; black text = formulas; green text = cross-sheet links.", "", ""],
            ["Caution", "Replace illustrative ExpectedNGR and deposit assumptions with real cohort NGR/GGR before go-live.", "", ""],
        ],
        "Inputs!A1:E51": [
            ["Parameter", "Value", "Unit", "Source", "Notes"],
            ["Core assignment inputs", "", "", "", ""],
            ["MAU", 15000, "players", "Assignment", "Monthly active users"],
            ["Depositors share", 0.40, "%", "Assignment", "Share of MAU who deposit"],
            ["Depositors per month", "=B3*B4", "players", "Formula", "MAU * depositors share"],
            ["Average monthly deposit", 80, "USD/player", "Assignment", "Average deposit across monthly depositors"],
            ["Reported monthly deposit volume", "=B5*B6", "USD", "Formula", "Used only for consistency check"],
            ["Pareto top money share", 0.80, "%", "Assignment", "10% players generate 80% of money"],
            ["Top active depositors share", 0.10, "%", "Assignment", "Top segment count before highroller split"],
            ["Top active depositors count", "=B5*B9", "players", "Formula", "Depositors * top share"],
            ["Highroller count low", 50, "players", "Assignment", "Lower bound"],
            ["Highroller count base", 75, "players", "Assumption", "Editable midpoint for modelling"],
            ["Highroller count high", 100, "players", "Assignment", "Upper bound"],
            ["Highroller minimum monthly deposit", 30000, "USD/player", "Assignment", "Used for consistency check"],
            ["NGR margin assumption", 0.50, "% of deposit", "Assumption", "Replace with actual NGR/GGR margin"],
            ["", "", "", "", ""],
            ["Caps and approval guardrails - values that must not be exceeded", "", "", "", ""],
            ["Monthly VIP budget cap", 0.08, "% of NGR", "Unit economics appendix", "Applied to high-value + highroller NGR"],
            ["Manual compensation budget cap", 0.20, "% of VIP budget", "Unit economics appendix", "Project-wide, not per player"],
            ["Minimum Expected Value", 100, "USD/player", "Unit economics appendix", "Offer approval threshold"],
            ["Minimum EV / VIPCost", 0.20, "%", "Unit economics appendix", "Offer approval threshold"],
            ["Manual approval threshold rate", 0.10, "% of Platinum-Diamond per-player cap", "Model", "Keeps approval threshold tied to the next serious VIP tier"],
            ["Manual approval threshold", "=B25*B22", "USD/action", "Formula", "10% of Platinum-Diamond per-player cap"],
            ["Bronze-Gold per-player cap", 100, "USD/month", "Unit economics appendix", "Editable"],
            ["Platinum-Diamond per-player cap", 1500, "USD/month", "Unit economics appendix", "Editable"],
            ["Elite per-player cap", 5000, "USD/month", "Unit economics appendix", "Manual approval only"],
            ["Bronze-Gold tier cap", 0.05, "% of tier NGR", "Unit economics appendix", "Editable"],
            ["Platinum-Diamond tier cap", 0.08, "% of tier NGR", "Unit economics appendix", "Editable"],
            ["Elite tier cap", 0.12, "% of tier NGR", "Unit economics appendix", "Editable"],
            ["", "", "", "", ""],
            ["Segment deposit assumptions", "", "", "", ""],
            ["High-value monthly deposit low", 5000, "USD/player", "Assignment range", "Lower bound for high-value segment"],
            ["High-value monthly deposit high", 20000, "USD/player", "Assignment range", "Upper bound for high-value segment"],
            ["High-value avg monthly deposit", "=AVERAGE(B32:B33)", "USD/player", "Formula", "Midpoint of documented $5k-$20k range"],
            ["Highroller avg monthly deposit", 40000, "USD/player", "Assumption", "Must be replaced with actual cohort data"],
            ["Middle avg monthly deposit", 80, "USD/player", "Assignment", "Used for middle segment"],
            ["", "", "", "", ""],
            ["Segment P(save) assumptions", "", "", "", ""],
            ["middle", 0.10, "%", "Unit economics appendix", "Starting v1 hypothesis"],
            ["high-value", 0.20, "%", "Unit economics appendix", "Starting v1 hypothesis"],
            ["highroller", 0.15, "%", "Unit economics appendix", "Conservative starting v1 hypothesis"],
            ["", "", "", "", ""],
            ["Vertical multipliers", "", "", "", ""],
            ["slots", 1.00, "x", "Unit economics appendix", "No discount"],
            ["live", 0.90, "x", "Unit economics appendix", "Temporary risk-control discount"],
            ["sport", 0.80, "x", "Unit economics appendix", "Temporary risk-control discount"],
            ["", "", "", "", ""],
            ["Scenario multipliers", "P(save)", "VIPCost", "Source", "Notes"],
            ["Conservative", 0.75, 0.80, "Model", "Low response, lower spend"],
            ["Base", 1.00, 1.00, "Model", "Current v1 assumption"],
            ["Aggressive", 1.25, 1.20, "Model", "Stronger response, higher cost pressure"],
        ],
        "Segments!A1:L4": [
            ["Tier group", "Segment", "Player count", "Avg deposit/month", "Deposit volume", "NGR margin", "ExpectedNGR_if_saved", "Segment NGR", "Tier cap %", "Tier budget cap", "Per-player cap", "Notes"],
            ["Bronze-Gold", "middle", "=Inputs!$B$5*0.80", "=Inputs!$B$36", "=C2*D2", "=Inputs!$B$15", "=D2*F2", "=C2*G2", "=Inputs!$B$27", "=H2*I2", "=Inputs!$B$24", "Middle segment is included for progression, not main ROI case"],
            ["Platinum-Diamond", "high-value", "=MAX(Inputs!$B$10-Inputs!$B$12,0)", "=Inputs!$B$34", "=C3*D3", "=Inputs!$B$15", "=D3*F3", "=C3*G3", "=Inputs!$B$28", "=H3*I3", "=Inputs!$B$25", "High-value without separately listed highrollers"],
            ["Elite", "highroller", "=Inputs!$B$12", "=Inputs!$B$35", "=C4*D4", "=Inputs!$B$15", "=D4*F4", "=C4*G4", "=Inputs!$B$29", "=H4*I4", "=Inputs!$B$26", "Elite/highroller requires manual approval"],
        ],
        "Offers!A1:AB11": [
            ["Case", "Segment", "Tier group", "Vertical", "Target players", "P(save) base", "Vertical multiplier", "P(save) case", "ExpectedNGR_if_saved", "Bonus cost", "Service cost", "Manual compensation cost", "VIPCost", "RetainedMarginGain", "Expected Value", "EV / VIPCost", "Per-player cap", "Pass EV >= min", "Pass EV ratio", "Pass cap", "Decision", "Total VIPCost", "Manual comp total", "Total Expected Value", "Included in v1 plan", "V1 role", "Implementation intent", "Why keep it in model"],
            ["Included v1 plan - used in Budget_Checks and Scenarios", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["High-value live recovery offer", "high-value", "Platinum-Diamond", "live", 50, '=INDEX(Inputs!$B$39:$B$41,MATCH(B3,Inputs!$A$39:$A$41,0))', '=INDEX(Inputs!$B$44:$B$46,MATCH(D3,Inputs!$A$44:$A$46,0))', "=F3*G3", '=INDEX(Segments!$G$2:$G$4,MATCH(B3,Segments!$B$2:$B$4,0))', 120, 40, 20, "=SUM(J3:L3)", "=H3*I3", "=N3-M3", "=IFERROR(O3/M3,0)", '=INDEX(Segments!$K$2:$K$4,MATCH(B3,Segments!$B$2:$B$4,0))', "=O3>=Inputs!$B$20", "=P3>=Inputs!$B$21", "=M3<=Q3", '=IF(AND(R3,S3,T3),"PASS","FAIL")', "=E3*M3", "=E3*L3", "=E3*O3", True, "Primary v1 candidate", "Launch as one of 1-2 automated scenarios", "Best match to product goal: high-value retention"],
            ["Elite live manager package", "highroller", "Elite", "live", 10, '=INDEX(Inputs!$B$39:$B$41,MATCH(B4,Inputs!$A$39:$A$41,0))', '=INDEX(Inputs!$B$44:$B$46,MATCH(D4,Inputs!$A$44:$A$46,0))', "=F4*G4", '=INDEX(Segments!$G$2:$G$4,MATCH(B4,Segments!$B$2:$B$4,0))', 500, 200, 1000, "=SUM(J4:L4)", "=H4*I4", "=N4-M4", "=IFERROR(O4/M4,0)", '=INDEX(Segments!$K$2:$K$4,MATCH(B4,Segments!$B$2:$B$4,0))', "=O4>=Inputs!$B$20", "=P4>=Inputs!$B$21", "=M4<=Q4", '=IF(AND(R4,S4,T4),"PASS","FAIL")', "=E4*M4", "=E4*L4", "=E4*O4", True, "Manual v1 candidate", "Launch only as the one manual upper-tier scenario", "Matches product scope: one manual scenario with approval and audit"],
            ["V1 plan totals", "", "", "", "=SUM(E3:E4)", "", "", "", "", "=SUM(J3:J4)", "=SUM(K3:K4)", "=SUM(L3:L4)", "", "", "", "", "", "", "", "", "", "=SUM(V3:V4)", "=SUM(W3:W4)", "=SUM(X3:X4)", "", "", "", ""],
            ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["Diagnostic examples - excluded from v1 totals", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["Middle small automated package", "middle", "Bronze-Gold", "slots", 500, '=INDEX(Inputs!$B$39:$B$41,MATCH(B8,Inputs!$A$39:$A$41,0))', '=INDEX(Inputs!$B$44:$B$46,MATCH(D8,Inputs!$A$44:$A$46,0))', "=F8*G8", '=INDEX(Segments!$G$2:$G$4,MATCH(B8,Segments!$B$2:$B$4,0))', 20, 2, 0, "=SUM(J8:L8)", "=H8*I8", "=N8-M8", "=IFERROR(O8/M8,0)", '=INDEX(Segments!$K$2:$K$4,MATCH(B8,Segments!$B$2:$B$4,0))', "=O8>=Inputs!$B$20", "=P8>=Inputs!$B$21", "=M8<=Q8", '=IF(AND(R8,S8,T8),"PASS","FAIL")', "=E8*M8", "=E8*L8", "=E8*O8", False, "Reference scenario", "Not a primary v1 launch offer", "Checks that lower tiers stay inexpensive and within caps"],
            ["High-value sport bonus-heavy offer", "high-value", "Platinum-Diamond", "sport", 50, '=INDEX(Inputs!$B$39:$B$41,MATCH(B9,Inputs!$A$39:$A$41,0))', '=INDEX(Inputs!$B$44:$B$46,MATCH(D9,Inputs!$A$44:$A$46,0))', "=F9*G9", '=INDEX(Segments!$G$2:$G$4,MATCH(B9,Segments!$B$2:$B$4,0))', 150, 40, 0, "=SUM(J9:L9)", "=H9*I9", "=N9-M9", "=IFERROR(O9/M9,0)", '=INDEX(Segments!$K$2:$K$4,MATCH(B9,Segments!$B$2:$B$4,0))', "=O9>=Inputs!$B$20", "=P9>=Inputs!$B$21", "=M9<=Q9", '=IF(AND(R9,S9,T9),"PASS","FAIL")', "=E9*M9", "=E9*L9", "=E9*O9", False, "Alternative test scenario", "Do not launch together with the live offer in v1", "Compares vertical sensitivity and bonus-heavy economics"],
            ["Elite slots expensive package", "highroller", "Elite", "slots", 10, '=INDEX(Inputs!$B$39:$B$41,MATCH(B10,Inputs!$A$39:$A$41,0))', '=INDEX(Inputs!$B$44:$B$46,MATCH(D10,Inputs!$A$44:$A$46,0))', "=F10*G10", '=INDEX(Segments!$G$2:$G$4,MATCH(B10,Segments!$B$2:$B$4,0))', 1000, 200, 2500, "=SUM(J10:L10)", "=H10*I10", "=N10-M10", "=IFERROR(O10/M10,0)", '=INDEX(Segments!$K$2:$K$4,MATCH(B10,Segments!$B$2:$B$4,0))', "=O10>=Inputs!$B$20", "=P10>=Inputs!$B$21", "=M10<=Q10", '=IF(AND(R10,S10,T10),"PASS","FAIL")', "=E10*M10", "=E10*L10", "=E10*O10", False, "Stress-test only", "Do not launch in v1", "Kept to show where expensive offers break economics"],
            ["Diagnostic totals", "", "", "", "=SUM(E8:E10)", "", "", "", "", "=SUM(J8:J10)", "=SUM(K8:K10)", "=SUM(L8:L10)", "", "", "", "", "", "", "", "", "", "=SUM(V8:V10)", "=SUM(W8:W10)", "=SUM(X8:X10)", "", "", "", ""],
        ],
        "Budget_Checks!A1:D12": [
            ["Check", "Value", "Threshold / comparator", "Status"],
            ["High-value + highroller NGR", "=SUM(Segments!H3:H4)", "", ""],
            ["Monthly VIP Budget Cap", "=B2*Inputs!$B$18", "8% of high-value + highroller NGR", ""],
            ["Planned VIPCost total", '=SUMIF(Offers!Y2:Y10,TRUE,Offers!V2:V10)', "<= Monthly VIP Budget Cap", '=IF(B4<=B3,"PASS","FAIL")'],
            ["Budget burn", "=IFERROR(B4/B3,0)", "<= 100%", '=IF(B5<=1,"PASS","FAIL")'],
            ["Manual compensation total", '=SUMIF(Offers!Y2:Y10,TRUE,Offers!W2:W10)', "<= Manual compensation cap", '=IF(B6<=B7,"PASS","FAIL")'],
            ["Manual compensation cap", "=B3*Inputs!$B$19", "20% of VIP budget", ""],
            ["Manual compensation share of VIP budget", "=IFERROR(B6/B3,0)", "<= 20% of monthly VIP budget", '=IF(B8<=Inputs!$B$19,"PASS","FAIL")'],
            ["Approved v1 offer count", '=COUNTIFS(Offers!Y2:Y10,TRUE,Offers!U2:U10,"PASS")', "Included v1 rows should pass", ""],
            ["Failed v1 offer count", '=COUNTIFS(Offers!Y2:Y10,TRUE,Offers!U2:U10,"FAIL")', "0 required", '=IF(B10=0,"PASS","REVIEW")'],
            ["Total Expected Value", '=SUMIF(Offers!Y2:Y10,TRUE,Offers!X2:X10)', "> 0 for included v1 rows", '=IF(B11>0,"PASS","FAIL")'],
            ["Model conclusion", '=IF(AND(D4="PASS",D5="PASS",D8="PASS",D10="PASS",D11="PASS"),"Economics pass current assumptions","Review failed checks / assumptions")', "", ""],
        ],
        "Scenarios!A1:H4": [
            ["Scenario", "P(save) multiplier", "VIPCost multiplier", "RetainedMarginGain", "VIPCost", "Expected Value", "Budget burn", "Status"],
            ["Conservative", "=Inputs!$B$49", "=Inputs!$C$49", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$H$2:$H$10,Offers!$I$2:$I$10,Offers!$Y$2:$Y$10)*B2", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$M$2:$M$10,Offers!$Y$2:$Y$10)*C2", "=D2-E2", "=IFERROR(E2/Budget_Checks!$B$3,0)", '=IF(AND(F2>0,G2<=1),"PASS","FAIL")'],
            ["Base", "=Inputs!$B$50", "=Inputs!$C$50", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$H$2:$H$10,Offers!$I$2:$I$10,Offers!$Y$2:$Y$10)*B3", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$M$2:$M$10,Offers!$Y$2:$Y$10)*C3", "=D3-E3", "=IFERROR(E3/Budget_Checks!$B$3,0)", '=IF(AND(F3>0,G3<=1),"PASS","FAIL")'],
            ["Aggressive", "=Inputs!$B$51", "=Inputs!$C$51", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$H$2:$H$10,Offers!$I$2:$I$10,Offers!$Y$2:$Y$10)*B4", "=SUMPRODUCT(Offers!$E$2:$E$10,Offers!$M$2:$M$10,Offers!$Y$2:$Y$10)*C4", "=D4-E4", "=IFERROR(E4/Budget_Checks!$B$3,0)", '=IF(AND(F4>0,G4<=1),"PASS","FAIL")'],
        ],
        "Data_Checks!A1:D10": [
            ["Data check", "Value", "Expected / issue", "Status"],
            ["Assignment total deposit volume", "=Inputs!$B$7", "All monthly depositors, including regular, top 10%, and highrollers", ""],
            ["Top 10% deposit volume implied by Pareto", "=B2*Inputs!$B$8", "80% of assignment total deposit volume", ""],
            ["Minimum highroller deposit volume", "=Inputs!$B$11*Inputs!$B$14", "50 highrollers * $30k minimum monthly deposit", ""],
            ["Highroller minimum vs top 10% pool", "=IFERROR(B4/B3,0)", "Should be <= 100% if highrollers are inside the Pareto top pool", '=IF(B4<=B3,"OK","INPUT CONFLICT")'],
            ["Highroller minimum vs assignment total", "=IFERROR(B4/B2,0)", "Should be <= 100% if all numbers refer to the same month", '=IF(B4<=B2,"OK","INPUT CONFLICT")'],
            ["Modeled segment deposit volume", "=SUM(Segments!E2:E4)", "Based on editable segment assumptions", ""],
            ["Model deposit volume / assignment total", "=IFERROR(B7/B2,0)", "Large gap means model assumptions are not calibrated to assignment totals", '=IF(ABS(B8-1)<=0.2,"OK","REVIEW")'],
            ["Critical missing data", "Actual NGR/GGR by tier and cohort", "Needed before production budget approval", "OPEN"],
            ["Recommendation", '=IF(OR(D5="INPUT CONFLICT",D6="INPUT CONFLICT"),"Use policy-based budget by actual segment NGR/GGR; do not rely on global average deposit","Inputs are broadly consistent")', "", ""],
        ],
    }
    data = [{"range": rng, "values": rows} for rng, rows in values.items()]
    sheets_service.spreadsheets().values().batchClear(
        spreadsheetId=spreadsheet_id,
        body={"ranges": [f"{title}!A1:AB200" for title in SHEET_TITLES]},
    ).execute()
    sheets_service.spreadsheets().values().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"valueInputOption": "USER_ENTERED", "data": data},
    ).execute()


def clear_offer_conditional_formats(sheets_service, spreadsheet_id: str, offers_sheet_id: int) -> None:
    meta = sheets_service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets(properties(sheetId,title),conditionalFormats)",
    ).execute()
    rule_count = 0
    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("sheetId") == offers_sheet_id:
            rule_count = len(sheet.get("conditionalFormats", []))
            break

    if not rule_count:
        return

    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {"deleteConditionalFormatRule": {"sheetId": offers_sheet_id, "index": 0}}
                for _ in range(rule_count)
            ]
        },
    ).execute()


def clear_sheet_conditional_formats(sheets_service, spreadsheet_id: str, target_sheet_id: int) -> None:
    meta = sheets_service.spreadsheets().get(
        spreadsheetId=spreadsheet_id,
        fields="sheets(properties(sheetId,title),conditionalFormats)",
    ).execute()
    rule_count = 0
    for sheet in meta.get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("sheetId") == target_sheet_id:
            rule_count = len(sheet.get("conditionalFormats", []))
            break

    if not rule_count:
        return

    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={
            "requests": [
                {"deleteConditionalFormatRule": {"sheetId": target_sheet_id, "index": 0}}
                for _ in range(rule_count)
            ]
        },
    ).execute()


def format_sheet(sheets_service, spreadsheet_id: str, ids: dict[str, int]) -> None:
    clear_offer_conditional_formats(sheets_service, spreadsheet_id, ids["Offers"])
    clear_sheet_conditional_formats(sheets_service, spreadsheet_id, ids["Budget_Checks"])

    requests = []
    for title in SHEET_TITLES:
        sheet_id = ids[title]
        requests.extend([
            {
                "repeatCell": {
                    "range": {"sheetId": sheet_id, "startRowIndex": 0, "endRowIndex": 1},
                    "cell": {
                        "userEnteredFormat": {
                            "backgroundColor": {"red": 0.12, "green": 0.19, "blue": 0.32},
                            "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True},
                        }
                    },
                    "fields": "userEnteredFormat(backgroundColor,textFormat)",
                }
            },
            {"updateSheetProperties": {"properties": {"sheetId": sheet_id, "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}},
            {"autoResizeDimensions": {"dimensions": {"sheetId": sheet_id, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 28}}},
        ])

    blue_ranges = [
        ("Inputs", 2, 4, 1, 2),
        ("Inputs", 5, 6, 1, 2),
        ("Inputs", 7, 9, 1, 2),
        ("Inputs", 10, 14, 1, 2),
        ("Inputs", 17, 29, 1, 2),
        ("Inputs", 31, 36, 1, 2),
        ("Inputs", 39, 41, 1, 2),
        ("Inputs", 44, 46, 1, 2),
        ("Inputs", 49, 51, 1, 3),
        ("Offers", 1, 11, 4, 5),
        ("Offers", 1, 11, 9, 12),
    ]
    for title, start_row, end_row, start_col, end_col in blue_ranges:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids[title],
                    "startRowIndex": start_row,
                    "endRowIndex": end_row,
                    "startColumnIndex": start_col,
                    "endColumnIndex": end_col,
                },
                "cell": {"userEnteredFormat": {"textFormat": {"foregroundColor": {"red": 0, "green": 0, "blue": 1}}}},
                "fields": "userEnteredFormat.textFormat.foregroundColor",
            }
        })

    percent_ranges = [
        ("Inputs", 3, 4, 1, 2),
        ("Inputs", 7, 9, 1, 2),
        ("Inputs", 14, 15, 1, 2),
        ("Inputs", 17, 19, 1, 2),
        ("Inputs", 20, 22, 1, 2),
        ("Inputs", 26, 29, 1, 2),
        ("Inputs", 39, 41, 1, 2),
        ("Offers", 1, 11, 5, 8),
        ("Offers", 1, 11, 15, 16),
        ("Segments", 1, 4, 5, 6),
        ("Segments", 1, 4, 8, 9),
        ("Budget_Checks", 4, 5, 1, 2),
        ("Budget_Checks", 7, 8, 1, 2),
        ("Scenarios", 1, 4, 6, 7),
        ("Data_Checks", 4, 6, 1, 2),
        ("Data_Checks", 7, 8, 1, 2),
    ]
    for title, start_row, end_row, start_col, end_col in percent_ranges:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids[title],
                    "startRowIndex": start_row,
                    "endRowIndex": end_row,
                    "startColumnIndex": start_col,
                    "endColumnIndex": end_col,
                },
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "PERCENT", "pattern": "0.0%"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    currency_ranges = [
        ("Inputs", 5, 7, 1, 2),
        ("Inputs", 13, 14, 1, 2),
        ("Inputs", 19, 20, 1, 2),
        ("Inputs", 22, 26, 1, 2),
        ("Inputs", 31, 36, 1, 2),
        ("Segments", 1, 4, 3, 5),
        ("Segments", 1, 4, 6, 8),
        ("Segments", 1, 4, 9, 11),
        ("Offers", 1, 11, 8, 15),
        ("Offers", 1, 11, 16, 18),
        ("Offers", 1, 11, 21, 24),
        ("Budget_Checks", 1, 4, 1, 2),
        ("Budget_Checks", 5, 7, 1, 2),
        ("Budget_Checks", 10, 11, 1, 2),
        ("Scenarios", 1, 4, 3, 6),
        ("Data_Checks", 1, 4, 1, 2),
        ("Data_Checks", 6, 7, 1, 2),
    ]
    for title, start_row, end_row, start_col, end_col in currency_ranges:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids[title],
                    "startRowIndex": start_row,
                    "endRowIndex": end_row,
                    "startColumnIndex": start_col,
                    "endColumnIndex": end_col,
                },
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "CURRENCY", "pattern": "$#,##0;($#,##0);-"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    number_ranges = [
        ("Inputs", 2, 3, 1, 2),
        ("Inputs", 4, 5, 1, 2),
        ("Inputs", 9, 13, 1, 2),
        ("Inputs", 44, 46, 1, 2),
        ("Budget_Checks", 8, 10, 1, 2),
        ("Offers", 1, 11, 4, 5),
        ("Segments", 1, 4, 2, 3),
    ]
    for title, start_row, end_row, start_col, end_col in number_ranges:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids[title],
                    "startRowIndex": start_row,
                    "endRowIndex": end_row,
                    "startColumnIndex": start_col,
                    "endColumnIndex": end_col,
                },
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "#,##0"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    multiplier_ranges = [
        ("Inputs", 44, 46, 1, 2),
        ("Inputs", 49, 51, 1, 3),
        ("Scenarios", 1, 4, 1, 3),
    ]
    for title, start_row, end_row, start_col, end_col in multiplier_ranges:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids[title],
                    "startRowIndex": start_row,
                    "endRowIndex": end_row,
                    "startColumnIndex": start_col,
                    "endColumnIndex": end_col,
                },
                "cell": {"userEnteredFormat": {"numberFormat": {"type": "NUMBER", "pattern": "0.00x"}}},
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    green = {"red": 0.0, "green": 0.45, "blue": 0.16}
    red = {"red": 0.75, "green": 0.0, "blue": 0.0}
    offers_decision_format_rules = [
        (17, 20, '=R2=TRUE', green),
        (17, 20, '=R2=FALSE', red),
        (20, 21, '=U2="PASS"', green),
        (20, 21, '=U2="FAIL"', red),
    ]
    for start_col, end_col, formula, color in offers_decision_format_rules:
        requests.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{
                        "sheetId": ids["Offers"],
                        "startRowIndex": 1,
                        "endRowIndex": 10,
                        "startColumnIndex": start_col,
                        "endColumnIndex": end_col,
                    }],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": formula}],
                        },
                        "format": {"textFormat": {"foregroundColor": color, "bold": True}},
                    },
                },
                "index": 0,
            }
        })

    budget_status_format_rules = [
        ('=$D2="PASS"', green),
        ('=$D2="FAIL"', red),
    ]
    for formula, color in budget_status_format_rules:
        requests.append({
            "addConditionalFormatRule": {
                "rule": {
                    "ranges": [{
                        "sheetId": ids["Budget_Checks"],
                        "startRowIndex": 1,
                        "endRowIndex": 12,
                        "startColumnIndex": 3,
                        "endColumnIndex": 4,
                    }],
                    "booleanRule": {
                        "condition": {
                            "type": "CUSTOM_FORMULA",
                            "values": [{"userEnteredValue": formula}],
                        },
                        "format": {"textFormat": {"foregroundColor": color, "bold": True}},
                    },
                },
                "index": 0,
            }
        })

    requests.append({
        "repeatCell": {
            "range": {"sheetId": ids["README"], "startRowIndex": 0, "endRowIndex": 1, "startColumnIndex": 0, "endColumnIndex": 4},
            "cell": {"userEnteredFormat": {"textFormat": {"fontSize": 14, "bold": True}}},
            "fields": "userEnteredFormat.textFormat",
        }
    })

    section_rows = [1, 16, 30, 37, 42, 47]
    for row in section_rows:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids["Inputs"],
                    "startRowIndex": row,
                    "endRowIndex": row + 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": 5,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.88, "green": 0.92, "blue": 1.0},
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        })

    offer_group_rows = [1, 6]
    for row in offer_group_rows:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids["Offers"],
                    "startRowIndex": row,
                    "endRowIndex": row + 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": 28,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.88, "green": 0.92, "blue": 1.0},
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        })

    offer_total_rows = [4, 10]
    for row in offer_total_rows:
        requests.append({
            "repeatCell": {
                "range": {
                    "sheetId": ids["Offers"],
                    "startRowIndex": row,
                    "endRowIndex": row + 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": 28,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.94, "green": 0.94, "blue": 0.94},
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat)",
            }
        })

    sheets_service.spreadsheets().batchUpdate(
        spreadsheetId=spreadsheet_id,
        body={"requests": requests},
    ).execute()


def verify_outputs(sheets_service, spreadsheet_id: str) -> list[list[str]]:
    result = sheets_service.spreadsheets().values().batchGet(
        spreadsheetId=spreadsheet_id,
        ranges=["Budget_Checks!A1:D12", "Data_Checks!A1:D10", "Scenarios!A1:H4"],
        valueRenderOption="FORMATTED_VALUE",
    ).execute()
    rows: list[list[str]] = []
    for value_range in result.get("valueRanges", []):
        rows.extend(value_range.get("values", []))
        rows.append([])
    return rows


def main() -> int:
    sheets_service, drive_service = make_services()
    spreadsheet_id = create_or_load_spreadsheet(sheets_service)
    ids = ensure_sheets(sheets_service, spreadsheet_id)
    update_values(sheets_service, spreadsheet_id)
    format_sheet(sheets_service, spreadsheet_id, ids)

    drive_service.files().update(
        fileId=spreadsheet_id,
        body={"name": "VIP Loyalty v1 - Unit Economics Model"},
        fields="id,name,webViewLink",
    ).execute()

    meta = drive_service.files().get(fileId=spreadsheet_id, fields="id,name,webViewLink").execute()
    print(f"Spreadsheet: {meta['name']}")
    print(f"ID: {meta['id']}")
    print(f"URL: {meta['webViewLink']}")
    print("\nVerification snapshot:")
    for row in verify_outputs(sheets_service, spreadsheet_id):
        print("\t".join(str(cell) for cell in row))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
