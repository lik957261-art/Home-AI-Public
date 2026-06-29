"""Scoped PPTX generation for Hermes Mobile Gateway profiles."""

from __future__ import annotations

import hashlib
import json
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
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
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Hermes Mobile">
  <a:themeElements>
    <a:clrScheme name="Hermes Mobile"><a:dk1><a:srgbClr val="{colors["text"]}"/></a:dk1><a:lt1><a:srgbClr val="{colors["background"]}"/></a:lt1><a:accent1><a:srgbClr val="{colors["accent"]}"/></a:accent1></a:clrScheme>
    <a:fontScheme name="Hermes Mobile"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Microsoft YaHei"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="Hermes Mobile"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>'''


def _slide_master_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles>
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
        archive.writestr("ppt/theme/theme1.xml", _theme_xml(colors))
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
        return _json({
            "ok": True,
            "tool": "pptx_create",
            "source": "office-open-xml",
            "media_line": f"MEDIA:{output_path}",
            **result,
        })
    except Exception as error:
        return _json({
            "ok": False,
            "tool": "pptx_create",
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
