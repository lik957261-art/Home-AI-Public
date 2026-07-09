"""Scoped PPTX generation for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


DEFAULT_ALLOWED_ROOTS = (
    "/mnt/c/ProgramData/HermesMobile/data/drive",
    "/mnt/c/ProgramData/HermesMobile/data/uploads",
    "/mnt/c/ProgramData/HermesMobile/data/artifacts",
)
SUPPORTED_IMAGE_SUFFIXES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}
MAX_SLIDES = 80
MAX_BULLETS_PER_SLIDE = 20
MAX_TEXT_CHARS = 5000
MAX_IMAGE_BYTES = 20 * 1024 * 1024
EMU_W = 12192000
EMU_H = 6858000
REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
CT_NS = "{http://schemas.openxmlformats.org/package/2006/content-types}"
P_NS = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R_ATTR = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
REL_OFFICE_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
REL_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"
REL_SLIDE_MASTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster"
REL_SLIDE_LAYOUT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout"
REL_THEME = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"
REL_IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
REL_PRES_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps"
REL_VIEW_PROPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps"
REL_TABLE_STYLES = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles"


PPTX_CREATE_SCHEMA = {
    "name": "pptx_create",
    "description": (
        "Create a real Microsoft PowerPoint .pptx file from structured slide text and optional "
        "in-scope PNG/JPEG images. The output_path must be an absolute .pptx path inside the "
        "current Hermes Mobile drive/upload/artifact roots. Return the media_line in the final "
        "answer so Hermes Mobile can preview or download the deck."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "output_path": {
                "type": "string",
                "description": "Absolute output .pptx path inside an allowed Hermes Mobile root.",
            },
            "title": {
                "type": "string",
                "description": "Presentation title stored in the package metadata.",
            },
            "slides": {
                "type": "array",
                "description": "Slides to generate. Each slide may include title, body, bullets, and one image_path.",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "body": {"type": "string"},
                        "bullets": {"type": "array", "items": {"type": "string"}},
                        "image_path": {"type": "string"},
                        "image_alt": {"type": "string"},
                        "layout": {
                            "type": "string",
                            "enum": ["title", "title_bullets", "image_text", "section"],
                            "default": "title_bullets",
                        },
                    },
                },
                "minItems": 1,
                "maxItems": MAX_SLIDES,
            },
            "theme": {
                "type": "object",
                "description": "Optional colors: accent_color, background_color, text_color as six-digit hex.",
            },
        },
        "required": ["output_path", "slides"],
    },
}

PPTX_VALIDATE_SCHEMA = {
    "name": "pptx_validate",
    "description": (
        "Validate an in-scope .pptx deliverable for PowerPoint-compatible OpenXML package "
        "relationships before returning it to the user. If LibreOffice/soffice is installed, "
        "the validator also performs a bounded headless conversion smoke."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Absolute .pptx path inside an allowed Hermes Mobile root.",
            },
            "require_external_engine": {
                "type": "boolean",
                "description": "When true, fail if the optional LibreOffice/soffice validation engine is unavailable.",
                "default": False,
            },
        },
        "required": ["file_path"],
    },
}


def _json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False)


def _split_env_list(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "")
    if not raw.strip():
        return list(defaults)
    return [item.strip() for item in re.split(r"[;,\n]+", raw) if item.strip()]


def _platform_path(value: str) -> str:
    text = str(value or "").strip().strip('"').strip("'")
    if os.name == "nt":
        match = re.match(r"^/mnt/([A-Za-z])/(.*)$", text)
        if match:
            rest = match.group(2).replace("/", "\\")
            return f"{match.group(1).upper()}:\\{rest}"
        return text
    match = re.match(r"^([A-Za-z]):[\\/](.*)$", text)
    if match:
        rest = match.group(2).replace("\\", "/")
        return f"/mnt/{match.group(1).lower()}/{rest}"
    return text


def _roots() -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list("HERMES_MOBILE_PPTX_ALLOWED_ROOTS", DEFAULT_ALLOWED_ROOTS):
        try:
            roots.append(Path(_platform_path(item)).resolve())
        except Exception:
            continue
    return roots


def _output_roots() -> list[Path]:
    roots: list[Path] = []
    for item in _split_env_list("HERMES_MOBILE_PPTX_OUTPUT_ROOTS", tuple(str(root) for root in _roots())):
        try:
            roots.append(Path(_platform_path(item)).resolve())
        except Exception:
            continue
    return roots


def _inside(path: Path, roots: list[Path]) -> bool:
    try:
        resolved = path.resolve()
    except Exception:
        return False
    for root in roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def _safe_text(value: Any, limit: int = MAX_TEXT_CHARS) -> str:
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]+", " ", str(value or ""))
    text = re.sub(r"[ \t]+", " ", text).strip()
    return text[:limit]


def _hex(value: Any, default: str) -> str:
    text = str(value or "").strip().lstrip("#")
    return text.upper() if re.fullmatch(r"[0-9A-Fa-f]{6}", text or "") else default


def _validate_output_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("output_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("output_path_must_be_absolute")
    if path.suffix.lower() != ".pptx":
        raise ValueError("unsupported_pptx_output_suffix")
    if not _inside(path, _output_roots()):
        raise PermissionError("output_path_outside_allowed_roots")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def _validate_existing_pptx_path(value: Any) -> Path:
    text = str(value or "").strip()
    if not text:
        raise ValueError("file_path_required")
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("file_path_must_be_absolute")
    if path.suffix.lower() != ".pptx":
        raise ValueError("unsupported_pptx_file_suffix")
    if not _inside(path, _roots()):
        raise PermissionError("file_path_outside_allowed_roots")
    if not path.exists():
        raise FileNotFoundError("pptx_file_not_found")
    if not path.is_file():
        raise ValueError("pptx_path_not_file")
    return path.resolve()


def _validate_image_path(value: Any) -> Path | None:
    text = str(value or "").strip()
    if not text:
        return None
    path = Path(_platform_path(text)).expanduser()
    if not path.is_absolute():
        raise PermissionError("image_path_must_be_absolute")
    if not _inside(path, _roots()):
        raise PermissionError("image_path_outside_allowed_roots")
    if path.suffix.lower() not in SUPPORTED_IMAGE_SUFFIXES:
        raise ValueError("unsupported_pptx_image_suffix")
    if not path.exists():
        raise FileNotFoundError("image_path_not_found")
    if not path.is_file():
        raise ValueError("image_path_not_file")
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError("pptx_image_too_large")
    return path.resolve()


def _slides(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError("slides_required")
    if len(value) > MAX_SLIDES:
        raise ValueError("pptx_slide_count_exceeds_limit")
    cleaned = []
    for index, raw in enumerate(value, start=1):
        slide = raw if isinstance(raw, dict) else {"body": raw}
        bullets = slide.get("bullets") if isinstance(slide.get("bullets"), list) else []
        cleaned.append({
            "title": _safe_text(slide.get("title") or f"Slide {index}", 180),
            "body": _safe_text(slide.get("body"), 1600),
            "bullets": [_safe_text(item, 360) for item in bullets[:MAX_BULLETS_PER_SLIDE] if _safe_text(item, 360)],
            "image_path": slide.get("image_path") or "",
            "image_alt": _safe_text(slide.get("image_alt"), 180),
            "layout": str(slide.get("layout") or "title_bullets"),
        })
    return cleaned


def _text_runs(lines: list[str], *, bullet: bool, font_size: int) -> str:
    paragraphs = []
    for line in lines:
        text = escape(_safe_text(line))
        if not text:
            continue
        ppr = '<a:pPr marL="285750" indent="-171450"><a:buChar char="•"/></a:pPr>' if bullet else "<a:pPr/>"
        paragraphs.append(
            f'<a:p>{ppr}<a:r><a:rPr lang="zh-CN" sz="{font_size}"/><a:t>{text}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="{font_size}"/></a:p>'
        )
    return "".join(paragraphs) or '<a:p><a:endParaRPr lang="zh-CN" sz="2400"/></a:p>'


def _shape(shape_id: int, name: str, x: int, y: int, cx: int, cy: int, lines: list[str], *, font_size: int, bullet: bool = False) -> str:
    return f"""
<p:sp>
  <p:nvSpPr><p:cNvPr id="{shape_id}" name="{escape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
  <p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>
  <p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>{_text_runs(lines, bullet=bullet, font_size=font_size)}</p:txBody>
</p:sp>"""


def _picture(shape_id: int, rel_id: str, name: str, x: int, y: int, cx: int, cy: int) -> str:
    return f"""
<p:pic>
  <p:nvPicPr><p:cNvPr id="{shape_id}" name="{escape(name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
  <p:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
  <p:spPr><a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>"""


def _slide_xml(slide: dict[str, Any], image_rel: str | None, colors: dict[str, str]) -> str:
    title = slide["title"]
    body_lines = []
    if slide["body"]:
        body_lines.extend([line.strip() for line in slide["body"].splitlines() if line.strip()])
    body_lines.extend(slide["bullets"])
    has_image = bool(image_rel)
    body_w = 6096000 if has_image else 10210800
    shapes = [
        _shape(2, "Title", 685800, 365760, 10820400, 914400, [title], font_size=3600),
        _shape(3, "Content", 914400, 1463040, body_w, 4206240, body_lines or [""], font_size=2200, bullet=bool(slide["bullets"])),
    ]
    if image_rel:
        shapes.append(_picture(4, image_rel, slide.get("image_alt") or "Image", 7537440, 1584960, 3505200, 3505200))
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="{colors["background"]}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{EMU_W}" cy="{EMU_H}"/><a:chOff x="0" y="0"/><a:chExt cx="{EMU_W}" cy="{EMU_H}"/></a:xfrm></p:grpSpPr>
      {"".join(shapes)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>'''


def _content_types(slide_count: int, media: list[tuple[str, str]]) -> str:
    defaults = {
        "rels": "application/vnd.openxmlformats-package.relationships+xml",
        "xml": "application/xml",
    }
    for _, suffix in media:
        defaults[suffix.lstrip(".")] = SUPPORTED_IMAGE_SUFFIXES[suffix]
    default_xml = "".join(f'<Default Extension="{ext}" ContentType="{ctype}"/>' for ext, ctype in sorted(defaults.items()))
    slide_xml = "".join(
        f'<Override PartName="/ppt/slides/slide{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for index in range(1, slide_count + 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
{default_xml}
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>
<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>
<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
{slide_xml}
</Types>'''


def _rels_root() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''


def _presentation_xml(slide_count: int) -> str:
    slide_ids = "".join(f'<p:sldId id="{255 + index}" r:id="rId{index}"/>' for index in range(1, slide_count + 1))
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster1"/></p:sldMasterIdLst>
  <p:sldIdLst>{slide_ids}</p:sldIdLst>
  <p:sldSz cx="{EMU_W}" cy="{EMU_H}" type="wide"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:defaultTextStyle>
</p:presentation>'''


def _presentation_rels(slide_count: int) -> str:
    rels = [
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{index}.xml"/>'
        for index in range(1, slide_count + 1)
    ]
    rels.append('<Relationship Id="rIdMaster1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>')
    rels.append('<Relationship Id="rIdPresProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>')
    rels.append('<Relationship Id="rIdViewProps" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>')
    rels.append('<Relationship Id="rIdTableStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>')
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{"".join(rels)}</Relationships>'''


def _slide_rels(media_name: str | None) -> str:
    relationships = [
        '<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
    ]
    if media_name:
        relationships.append(
            f'<Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{media_name}"/>'
        )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  {"".join(relationships)}
</Relationships>'''


def _theme_xml(colors: dict[str, str]) -> str:
    accent = colors["accent"]
    text = colors["text"]
    background = colors["background"]
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Hermes Mobile">
  <a:themeElements>
    <a:clrScheme name="Hermes Mobile">
      <a:dk1><a:srgbClr val="{text}"/></a:dk1>
      <a:lt1><a:srgbClr val="{background}"/></a:lt1>
      <a:dk2><a:srgbClr val="1F2937"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent}"/></a:accent1>
      <a:accent2><a:srgbClr val="16A34A"/></a:accent2>
      <a:accent3><a:srgbClr val="F59E0B"/></a:accent3>
      <a:accent4><a:srgbClr val="DC2626"/></a:accent4>
      <a:accent5><a:srgbClr val="7C3AED"/></a:accent5>
      <a:accent6><a:srgbClr val="0891B2"/></a:accent6>
      <a:hlink><a:srgbClr val="0563C1"/></a:hlink>
      <a:folHlink><a:srgbClr val="954F72"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Hermes Mobile">
      <a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont>
      <a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Hermes Mobile">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="105000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="95000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="18000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
        <a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="38100" dir="5400000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="20000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill>
        <a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="98000"/><a:satMod val="130000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
</a:theme>'''


def _slide_master_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3600" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr marL="342900" indent="-171450" algn="l"><a:defRPr sz="2200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr algn="l"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill></a:defRPr></a:lvl1pPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>'''


def _slide_master_rels() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>'''


def _slide_layout_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>'''


def _slide_layout_rels() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>'''


def _pres_props_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:showPr showAnimation="1"><p:sldAll/><p:penClr><a:srgbClr val="FF0000"/></p:penClr></p:showPr>
</p:presentationPr>'''


def _view_props_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>
  <p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr>
  <p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="100" d="100"/><a:sy n="100" d="100"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr>
  <p:gridSpacing cx="72008" cy="72008"/>
</p:viewPr>'''


def _table_styles_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>'''


def _doc_props(title: str, slide_count: int) -> tuple[str, str]:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    core = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>{escape(title)}</dc:title><dc:creator>Hermes Mobile</dc:creator><cp:lastModifiedBy>Hermes Mobile</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified>
</cp:coreProperties>'''
    app = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Hermes Mobile Gateway</Application><PresentationFormat>On-screen Show (16:9)</PresentationFormat><Slides>{slide_count}</Slides>
</Properties>'''
    return core, app


def _write_pptx(output_path: Path, title: str, slides: list[dict[str, Any]], colors: dict[str, str]) -> dict[str, Any]:
    media: list[tuple[str, str]] = []
    slide_media_names: list[str | None] = []
    image_paths: list[Path] = []
    for index, slide in enumerate(slides, start=1):
        image_path = _validate_image_path(slide.get("image_path"))
        if not image_path:
            slide_media_names.append(None)
            continue
        suffix = image_path.suffix.lower()
        stored_suffix = ".jpg" if suffix == ".jpeg" else suffix
        digest = hashlib.sha256(str(image_path).encode("utf-8")).hexdigest()[:8]
        media_name = f"image{index}-{digest}{stored_suffix}"
        media.append((media_name, stored_suffix))
        slide_media_names.append(media_name)
        image_paths.append(image_path)

    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    if tmp_path.exists():
        tmp_path.unlink()
    core, app = _doc_props(title, len(slides))
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types(len(slides), media))
        archive.writestr("_rels/.rels", _rels_root())
        archive.writestr("docProps/core.xml", core)
        archive.writestr("docProps/app.xml", app)
        archive.writestr("ppt/presentation.xml", _presentation_xml(len(slides)))
        archive.writestr("ppt/_rels/presentation.xml.rels", _presentation_rels(len(slides)))
        archive.writestr("ppt/slideMasters/slideMaster1.xml", _slide_master_xml())
        archive.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", _slide_master_rels())
        archive.writestr("ppt/slideLayouts/slideLayout1.xml", _slide_layout_xml())
        archive.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", _slide_layout_rels())
        archive.writestr("ppt/theme/theme1.xml", _theme_xml(colors))
        archive.writestr("ppt/presProps.xml", _pres_props_xml())
        archive.writestr("ppt/viewProps.xml", _view_props_xml())
        archive.writestr("ppt/tableStyles.xml", _table_styles_xml())
        for index, slide in enumerate(slides, start=1):
            media_name = slide_media_names[index - 1]
            image_rel = "rIdImage1" if media_name else None
            archive.writestr(f"ppt/slides/slide{index}.xml", _slide_xml(slide, image_rel, colors))
            archive.writestr(f"ppt/slides/_rels/slide{index}.xml.rels", _slide_rels(media_name))
        for (media_name, _suffix), image_path in zip(media, image_paths):
            archive.write(image_path, f"ppt/media/{media_name}")
    tmp_path.replace(output_path)
    return {
        "fileName": output_path.name,
        "bytes": output_path.stat().st_size,
        "slide_count": len(slides),
        "image_count": len(media),
    }


def _rels_name_for_part(part_name: str) -> str:
    if part_name == "_rels/.rels":
        return "_rels/.rels"
    path = PurePosixPath(part_name)
    return str(path.parent / "_rels" / f"{path.name}.rels")


def _source_part_for_rels(rels_name: str) -> str:
    if rels_name == "_rels/.rels":
        return "_rels/.rels"
    marker = "/_rels/"
    if marker not in rels_name or not rels_name.endswith(".rels"):
        return ""
    prefix, rest = rels_name.split(marker, 1)
    return f"{prefix}/{rest[:-5]}"


def _normalize_part(parts: tuple[str, ...]) -> str:
    out: list[str] = []
    for item in parts:
        if item in {"", "."}:
            continue
        if item == "..":
            if not out:
                return ""
            out.pop()
        else:
            out.append(item)
    return "/".join(out)


def _resolve_rel_target(source_part: str, target: str) -> str:
    clean = str(target or "").strip()
    if not clean:
        return ""
    if clean.startswith("/"):
        return _normalize_part(tuple(PurePosixPath(clean.lstrip("/")).parts))
    base = PurePosixPath("") if source_part == "_rels/.rels" else PurePosixPath(source_part).parent
    return _normalize_part(tuple((base / clean).parts))


def _read_xml(archive: zipfile.ZipFile, part_name: str, issues: list[str]) -> ET.Element | None:
    try:
        return ET.fromstring(archive.read(part_name))
    except KeyError:
        issues.append(f"missing_part:{part_name}")
    except ET.ParseError:
        issues.append(f"invalid_xml:{part_name}")
    return None


def _relationship_list(archive: zipfile.ZipFile, source_part: str, issues: list[str], *, required: bool = True) -> list[dict[str, str]]:
    rels_name = _rels_name_for_part(source_part)
    if rels_name not in archive.namelist():
        if required:
            issues.append(f"missing_relationships:{rels_name}")
        return []
    root = _read_xml(archive, rels_name, issues)
    if root is None:
        return []
    relationships = []
    for rel in root.findall(f"{REL_NS}Relationship"):
        relationships.append({
            "id": str(rel.attrib.get("Id") or ""),
            "type": str(rel.attrib.get("Type") or ""),
            "target": str(rel.attrib.get("Target") or ""),
            "target_mode": str(rel.attrib.get("TargetMode") or ""),
        })
    return relationships


def _first_rel_target(relationships: list[dict[str, str]], rel_type: str, source_part: str) -> str:
    for rel in relationships:
        if rel.get("type") == rel_type:
            return _resolve_rel_target(source_part, rel.get("target") or "")
    return ""


def _rels_by_id(relationships: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    return {rel.get("id") or "": rel for rel in relationships if rel.get("id")}


def _validate_relationship_targets(archive: zipfile.ZipFile, issues: list[str]) -> None:
    names = set(archive.namelist())
    for rels_name in sorted(name for name in names if name.endswith(".rels")):
        source_part = _source_part_for_rels(rels_name)
        if not source_part:
            continue
        relationships = _relationship_list(archive, source_part, issues, required=False)
        for rel in relationships:
            if (rel.get("target_mode") or "").lower() == "external":
                issues.append(f"external_relationship:{rels_name}:{rel.get('id') or 'unknown'}")
                continue
            target = _resolve_rel_target(source_part, rel.get("target") or "")
            if not target or target not in names:
                issues.append(f"relationship_target_missing:{rels_name}:{rel.get('id') or 'unknown'}")


def _content_type_sets(root: ET.Element | None) -> tuple[set[str], set[str]]:
    if root is None:
        return set(), set()
    defaults = {str(item.attrib.get("Extension") or "").lower() for item in root.findall(f"{CT_NS}Default")}
    overrides = {str(item.attrib.get("PartName") or "").lstrip("/") for item in root.findall(f"{CT_NS}Override")}
    return defaults, overrides


def _validate_theme_root(root: ET.Element | None, issues: list[str]) -> None:
    if root is None:
        return
    theme_elements = root.find(f"{A_NS}themeElements")
    if theme_elements is None:
        issues.append("theme_elements_missing")
        return
    color_scheme = theme_elements.find(f"{A_NS}clrScheme")
    if color_scheme is None:
        issues.append("theme_color_scheme_missing")
    else:
        required_colors = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
        missing = [name for name in required_colors if color_scheme.find(f"{A_NS}{name}") is None]
        if missing:
            issues.append(f"theme_color_scheme_incomplete:{','.join(missing[:6])}")
    font_scheme = theme_elements.find(f"{A_NS}fontScheme")
    if font_scheme is None:
        issues.append("theme_font_scheme_missing")
    else:
        for font_kind in ("majorFont", "minorFont"):
            font_root = font_scheme.find(f"{A_NS}{font_kind}")
            if font_root is None:
                issues.append(f"theme_font_scheme_missing:{font_kind}")
                continue
            for child in ("latin", "ea", "cs"):
                if font_root.find(f"{A_NS}{child}") is None:
                    issues.append(f"theme_font_scheme_incomplete:{font_kind}:{child}")
    fmt_scheme = theme_elements.find(f"{A_NS}fmtScheme")
    if fmt_scheme is None:
        issues.append("theme_format_scheme_missing")
    else:
        required_counts = {
            "fillStyleLst": 3,
            "lnStyleLst": 3,
            "effectStyleLst": 3,
            "bgFillStyleLst": 3,
        }
        for list_name, expected_count in required_counts.items():
            list_root = fmt_scheme.find(f"{A_NS}{list_name}")
            if list_root is None:
                issues.append(f"theme_format_list_missing:{list_name}")
                continue
            actual_count = len(list(list_root))
            if actual_count < expected_count:
                issues.append(f"theme_format_list_incomplete:{list_name}:{actual_count}")


def _validate_slide_master_root(root: ET.Element | None, issues: list[str], part: str) -> None:
    if root is None:
        return
    color_map = root.find(f"{P_NS}clrMap")
    if color_map is None:
        issues.append(f"slide_master_color_map_missing:{part}")
    else:
        required = ["bg1", "tx1", "bg2", "tx2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
        missing = [name for name in required if not color_map.attrib.get(name)]
        if missing:
            issues.append(f"slide_master_color_map_incomplete:{part}:{','.join(missing[:6])}")
    if root.find(f"{P_NS}sldLayoutIdLst") is None:
        issues.append(f"slide_master_layout_list_missing:{part}")
    if root.find(f"{P_NS}txStyles") is None:
        issues.append(f"slide_master_text_styles_missing:{part}")


def _libreoffice_command() -> str:
    configured = str(os.environ.get("HERMES_MOBILE_PPTX_VALIDATOR_COMMAND") or "").strip()
    if configured:
        return configured
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    mac_app = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    return mac_app if Path(mac_app).exists() else ""


def _run_libreoffice_validation(path: Path, require_external_engine: bool = False) -> dict[str, Any]:
    command = _libreoffice_command()
    if not command:
        return {
            "available": False,
            "skipped": True,
            "required": bool(require_external_engine),
            "ok": not require_external_engine,
            "error": "libreoffice_validator_unavailable" if require_external_engine else "",
        }
    timeout = int(os.environ.get("HERMES_MOBILE_PPTX_VALIDATOR_TIMEOUT_SECONDS") or "35")
    with tempfile.TemporaryDirectory(prefix="homeai-pptx-validate-") as tmp:
        try:
            result = subprocess.run(
                [command, "--headless", "--convert-to", "pdf", "--outdir", tmp, str(path)],
                timeout=max(5, min(timeout, 120)),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                "available": True,
                "skipped": False,
                "required": bool(require_external_engine),
                "ok": False,
                "error": "libreoffice_validation_timeout",
            }
        except Exception:
            return {
                "available": True,
                "skipped": False,
                "required": bool(require_external_engine),
                "ok": False,
                "error": "libreoffice_validation_failed",
            }
        outputs = list(Path(tmp).glob("*.pdf"))
        converted = bool(outputs and outputs[0].exists() and outputs[0].stat().st_size > 0)
        return {
            "available": True,
            "skipped": False,
            "required": bool(require_external_engine),
            "ok": bool(result.returncode == 0 and converted),
            "error": "" if result.returncode == 0 and converted else "libreoffice_conversion_failed",
            "output_count": len(outputs),
        }


def _validate_pptx_file(path: Path, *, require_external_engine: bool = False) -> dict[str, Any]:
    issues: list[str] = []
    slide_count = 0
    image_count = 0
    try:
        with zipfile.ZipFile(path) as archive:
            bad_member = archive.testzip()
            if bad_member:
                issues.append(f"zip_member_corrupt:{bad_member}")
            names = set(archive.namelist())
            for part in (
                "[Content_Types].xml",
                "_rels/.rels",
                "ppt/presentation.xml",
                "ppt/_rels/presentation.xml.rels",
                "ppt/presProps.xml",
                "ppt/viewProps.xml",
                "ppt/tableStyles.xml",
            ):
                if part not in names:
                    issues.append(f"missing_part:{part}")
            content_root = _read_xml(archive, "[Content_Types].xml", issues)
            defaults, overrides = _content_type_sets(content_root)
            if "rels" not in defaults:
                issues.append("content_type_default_missing:rels")
            if "xml" not in defaults:
                issues.append("content_type_default_missing:xml")
            root_rels = _relationship_list(archive, "_rels/.rels", issues)
            presentation_target = _first_rel_target(root_rels, REL_OFFICE_DOCUMENT, "_rels/.rels")
            if presentation_target != "ppt/presentation.xml":
                issues.append("office_document_relationship_invalid")
            presentation_root = _read_xml(archive, "ppt/presentation.xml", issues)
            presentation_rels = _relationship_list(archive, "ppt/presentation.xml", issues)
            presentation_by_id = _rels_by_id(presentation_rels)
            slide_parts: list[str] = []
            master_parts: list[str] = []
            if presentation_root is not None:
                slide_ids = presentation_root.findall(f".//{P_NS}sldId")
                slide_count = len(slide_ids)
                if slide_count < 1:
                    issues.append("presentation_has_no_slides")
                for item in slide_ids:
                    rel_id = str(item.attrib.get(R_ATTR) or "")
                    rel = presentation_by_id.get(rel_id)
                    if not rel or rel.get("type") != REL_SLIDE:
                        issues.append(f"slide_relationship_missing:{rel_id or 'unknown'}")
                        continue
                    target = _resolve_rel_target("ppt/presentation.xml", rel.get("target") or "")
                    slide_parts.append(target)
                    if target not in names:
                        issues.append(f"slide_part_missing:{target or 'unknown'}")
                master_ids = presentation_root.findall(f".//{P_NS}sldMasterId")
                if not master_ids:
                    issues.append("slide_master_list_missing")
                for item in master_ids:
                    rel_id = str(item.attrib.get(R_ATTR) or "")
                    rel = presentation_by_id.get(rel_id)
                    if not rel or rel.get("type") != REL_SLIDE_MASTER:
                        issues.append(f"slide_master_relationship_missing:{rel_id or 'unknown'}")
                        continue
                    target = _resolve_rel_target("ppt/presentation.xml", rel.get("target") or "")
                    master_parts.append(target)
                    if target not in names:
                        issues.append(f"slide_master_part_missing:{target or 'unknown'}")
            for part in ["ppt/presentation.xml", *slide_parts, *master_parts, "ppt/slideLayouts/slideLayout1.xml", "ppt/theme/theme1.xml"]:
                if part and part.endswith(".xml") and part not in overrides:
                    issues.append(f"content_type_override_missing:{part}")
            for part in ["ppt/presProps.xml", "ppt/viewProps.xml", "ppt/tableStyles.xml"]:
                if part not in overrides:
                    issues.append(f"content_type_override_missing:{part}")
            for rel_type, label in (
                (REL_PRES_PROPS, "presentation_properties"),
                (REL_VIEW_PROPS, "view_properties"),
                (REL_TABLE_STYLES, "table_styles"),
            ):
                target = _first_rel_target(presentation_rels, rel_type, "ppt/presentation.xml")
                if not target:
                    issues.append(f"{label}_relationship_missing")
                elif target not in names:
                    issues.append(f"{label}_part_missing:{target}")
            for slide_part in slide_parts:
                _read_xml(archive, slide_part, issues)
                slide_rels = _relationship_list(archive, slide_part, issues)
                layout_target = _first_rel_target(slide_rels, REL_SLIDE_LAYOUT, slide_part)
                if not layout_target:
                    issues.append(f"slide_layout_relationship_missing:{slide_part}")
                elif layout_target not in names:
                    issues.append(f"slide_layout_part_missing:{layout_target}")
                for rel in slide_rels:
                    if rel.get("type") == REL_IMAGE:
                        image_count += 1
            for master_part in master_parts:
                master_root = _read_xml(archive, master_part, issues)
                _validate_slide_master_root(master_root, issues, master_part)
                master_rels = _relationship_list(archive, master_part, issues)
                if not _first_rel_target(master_rels, REL_SLIDE_LAYOUT, master_part):
                    issues.append(f"master_layout_relationship_missing:{master_part}")
                if not _first_rel_target(master_rels, REL_THEME, master_part):
                    issues.append(f"master_theme_relationship_missing:{master_part}")
            for layout_part in sorted(part for part in names if part.startswith("ppt/slideLayouts/") and part.endswith(".xml")):
                _read_xml(archive, layout_part, issues)
                layout_rels = _relationship_list(archive, layout_part, issues)
                master_target = _first_rel_target(layout_rels, REL_SLIDE_MASTER, layout_part)
                if not master_target:
                    issues.append(f"layout_master_relationship_missing:{layout_part}")
                elif master_target not in names:
                    issues.append(f"layout_master_part_missing:{master_target}")
            theme_root = _read_xml(archive, "ppt/theme/theme1.xml", issues)
            _validate_theme_root(theme_root, issues)
            _read_xml(archive, "ppt/presProps.xml", issues)
            _read_xml(archive, "ppt/viewProps.xml", issues)
            _read_xml(archive, "ppt/tableStyles.xml", issues)
            _validate_relationship_targets(archive, issues)
    except zipfile.BadZipFile:
        issues.append("invalid_zip_package")
    except Exception:
        issues.append("pptx_validation_failed")
    external = _run_libreoffice_validation(path, require_external_engine=require_external_engine) if not issues else {
        "available": False,
        "skipped": True,
        "required": bool(require_external_engine),
        "ok": not require_external_engine,
        "error": "skipped_due_openxml_issues",
    }
    if external.get("required") and not external.get("ok"):
        issues.append(str(external.get("error") or "external_validation_failed"))
    issues = list(dict.fromkeys(item for item in issues if item))[:40]
    return {
        "ok": not issues,
        "tool": "pptx_validate",
        "fileName": path.name,
        "bytes": path.stat().st_size if path.exists() else 0,
        "slide_count": slide_count,
        "image_count": image_count,
        "validation_engine": "openxml-relationships",
        "external_validation": external,
        "issue_count": len(issues),
        "issues": issues,
    }


def _pptx_create_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        output_path = _validate_output_path(args.get("output_path"))
        slides = _slides(args.get("slides"))
        title = _safe_text(args.get("title") or slides[0]["title"] or output_path.stem, 180)
        theme = args.get("theme") if isinstance(args.get("theme"), dict) else {}
        colors = {
            "accent": _hex(theme.get("accent_color"), "2563EB"),
            "background": _hex(theme.get("background_color"), "FFFFFF"),
            "text": _hex(theme.get("text_color"), "111827"),
        }
        result = _write_pptx(output_path, title, slides, colors)
        validation = _validate_pptx_file(output_path)
        if not validation.get("ok"):
            try:
                output_path.unlink()
            except Exception:
                pass
            return _json({
                "ok": False,
                "tool": "pptx_create",
                "error": "pptx_compatibility_validation_failed",
                "validation": validation,
            })
        return _json({
            "ok": True,
            "tool": "pptx_create",
            "source": "office-open-xml",
            "compatibility": "validated",
            "validation": validation,
            "media_line": f"MEDIA:{output_path}",
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pptx_create",
            "error": str(error),
        })


def _pptx_validate_handler(args: dict[str, Any], **_: Any) -> str:
    try:
        file_path = _validate_existing_pptx_path(args.get("file_path"))
        return _json(_validate_pptx_file(file_path, require_external_engine=bool(args.get("require_external_engine"))))
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pptx_validate",
            "error": str(error),
        })


def register(ctx) -> None:
    ctx.register_tool(
        name="pptx_create",
        toolset="file",
        schema=PPTX_CREATE_SCHEMA,
        handler=_pptx_create_handler,
        description="Scoped PPTX generation for Hermes Mobile workspace deliverables.",
        emoji="pptx",
    )
    ctx.register_tool(
        name="pptx_validate",
        toolset="file",
        schema=PPTX_VALIDATE_SCHEMA,
        handler=_pptx_validate_handler,
        description="Scoped PPTX compatibility validation for Hermes Mobile workspace deliverables.",
        emoji="pptx",
    )
