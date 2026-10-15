"""
Parses an uploaded SCORM 1.2 / 2004 package (a .zip) and figures out the
two things the player actually needs: which version of the SCORM JS API
to expose, and which unpacked file to launch — plus every individual
file's bytes, for the caller to store (course_service.upload_scorm_package
puts each one through the `files` dedup ledger; this module knows nothing
about storage at all, only about reading the zip).

A SCORM zip isn't one opaque asset — imsmanifest.xml's <resource href=...>
is almost always relative ("index.html", "scormdriver/indexAPI.html",
sometimes with "?query=params" SCORM content tools like to append), and
that file in turn pulls in sibling JS/CSS/images by relative path too. So
every file in the zip is returned individually, with its path preserved —
the content-serving endpoint then just looks each one up by that same
relative path.
"""
import zipfile
from dataclasses import dataclass
from io import BytesIO
from xml.etree import ElementTree

from fastapi import HTTPException, UploadFile

from app.services import storage_service

MAX_MANIFEST_SEARCH_DEPTH = 3  # imsmanifest.xml is almost always at the zip root


@dataclass
class ScormManifest:
    files: list[tuple[str, bytes]]  # (relative path inside the zip, raw bytes)
    launch_path: str
    version: str  # "1.2" | "2004"


def _local_tag(elem) -> str:
    """Strips the XML namespace off a tag — imscp namespaces vary across
    SCORM 1.2 ("imscp_rootv1p1p2"), 2004 ("imscp_v1p1"), and real-world
    packages exported by different authoring tools, so matching on the
    bare tag name is far more robust than trying to track every namespace
    URI a manifest might declare."""
    return elem.tag.rsplit("}", 1)[-1]


def _find_all(root, tag: str):
    return [el for el in root.iter() if _local_tag(el) == tag]


def parse_manifest(manifest_xml: bytes) -> tuple[str, str]:
    """Returns (launch_path, version) from imsmanifest.xml's bytes."""
    try:
        root = ElementTree.fromstring(manifest_xml)
    except ElementTree.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"imsmanifest.xml isn't valid XML: {exc}") from exc

    version = "1.2"
    for schemaversion_el in _find_all(root, "schemaversion"):
        text = (schemaversion_el.text or "").strip()
        if "2004" in text:
            version = "2004"
        break

    # The default <organization>'s first <item>'s identifierref points at
    # the <resource> that actually carries the launch href.
    organizations = _find_all(root, "organizations")
    items = _find_all(organizations[0], "item") if organizations else _find_all(root, "item")
    resources = _find_all(root, "resource")
    resources_by_id = {r.attrib.get("identifier"): r for r in resources}

    href = None
    for item in items:
        ref = item.attrib.get("identifierref")
        resource = resources_by_id.get(ref)
        if resource is not None and resource.attrib.get("href"):
            href = resource.attrib["href"]
            break
    if href is None and resources:
        # Fall back to the first resource with an href — some packages
        # skip <item>/<organizations> structure entirely for a single-SCO course.
        href = next((r.attrib["href"] for r in resources if r.attrib.get("href")), None)
    if href is None:
        raise HTTPException(status_code=400, detail="Couldn't find a launch file (<resource href=...>) in imsmanifest.xml")

    # Strip any query/fragment SCORM content tools sometimes append to the href.
    href = href.split("?", 1)[0].split("#", 1)[0]
    return href, version


def parse_zip(file: UploadFile, size: int) -> ScormManifest:
    if size > storage_service.MAX_SCORM_ZIP_BYTES:
        raise HTTPException(status_code=400, detail=f"SCORM package too large — max {storage_service.MAX_SCORM_ZIP_BYTES // (1024 * 1024)} MB")

    file.file.seek(0)
    raw = file.file.read()
    try:
        zf = zipfile.ZipFile(BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="That doesn't look like a valid .zip file") from exc

    names = [n for n in zf.namelist() if not n.endswith("/")]
    manifest_name = next((n for n in names if n.lower().endswith("imsmanifest.xml")), None)
    if manifest_name is None:
        raise HTTPException(status_code=400, detail="No imsmanifest.xml found in this package")

    launch_href, version = parse_manifest(zf.read(manifest_name))

    # The manifest's href is relative to the manifest's own folder, not
    # necessarily the zip root (some packages nest everything one level in).
    manifest_dir = manifest_name.rsplit("/", 1)[0] + "/" if "/" in manifest_name else ""
    launch_path = manifest_dir + launch_href

    files = []
    for name in names:
        if ".." in name.split("/"):  # zip-slip guard
            continue
        files.append((name, zf.read(name)))

    return ScormManifest(files=files, launch_path=launch_path, version=version)
